"""This module defines a base class for players.
"""

import asyncio
import random
from abc import ABC, abstractmethod
from asyncio import Condition, Event, Queue, Semaphore
from logging import Logger
from time import perf_counter
from typing import Any, Awaitable, Dict, List, Optional, Union

from chess_client import ChessClient
from account_configuration import AccountConfiguration, CONFIGURATION_FROM_PLAYER_COUNTER
from server_configuration import (
    LocalhostServerConfiguration, ServerConfiguration)
from concurrency import create_in_chess_loop, handle_threaded_coroutines
from environment import AbstractGame, Game

import chess

class Player(ABC):
    """Base class for players.
    """

    def __init__(self,
        account_configuration: Optional[AccountConfiguration] = None,
        *,
        log_level: Optional[int] = None,
        max_concurrent_games: int = 1,
        server_configuration: Optional[ServerConfiguration] = None,
        start_timer_on_game_start: bool = False,
        start_listening: bool = True,
        ping_interval: Optional[float] = 20.0,
        ping_timeout: Optional[float] = 20.0,
        autostart: bool = True
        ):
        if account_configuration is None:
            account_configuration = self._create_account_configuration()

        if server_configuration is None:
            server_configuration = LocalhostServerConfiguration

        self.chess_client = ChessClient(
            account_configuration=account_configuration,
            log_level=log_level,
            server_configuration=server_configuration,
            start_listening=start_listening,
            ping_interval=ping_interval,
            ping_timeout=ping_timeout,
            autostart=autostart
        )

        self.chess_client._handle_ingame_message = self._handle_ingame_message
        self.chess_client._handle_invite_request = self._handle_invite_request
        self.chess_client._handle_game_start = self._handle_game_start
        self.chess_client._handle_accepted_invite = self._handle_accepted_invite
        self.chess_client._handle_playerJoined = self._handle_playerJoined

        self.autostart = autostart

        self._max_concurrent_games: int = max_concurrent_games
        self._start_timer_on_game_start: bool = start_timer_on_game_start

        self._games: Dict[str, AbstractGame] = {}
        self._game_semaphore: Semaphore = create_in_chess_loop(Semaphore, 0)

        self._game_start_condition: Condition = create_in_chess_loop(Condition)
        self._game_count_queue: Queue[Any] = create_in_chess_loop(
            Queue, max_concurrent_games
        )
        self._game_end_condition: Condition = create_in_chess_loop(Condition)
        self._invite_queue: Queue[Any] = create_in_chess_loop(Queue)

        self.logger.debug("Player initialisation finished")

    def _create_account_configuration(self) -> AccountConfiguration:
        key = type(self).__name__
        CONFIGURATION_FROM_PLAYER_COUNTER.update([key])
        username = "%s %d" % (key, CONFIGURATION_FROM_PLAYER_COUNTER[key])
        if len(username) > 18:
            username = "%s %d" % (
                key[: 18 - len(username)],
                CONFIGURATION_FROM_PLAYER_COUNTER[key],
            )
        return AccountConfiguration(username, None)


    def _game_finished_callback(self, game: AbstractGame):
        pass

    async def _create_game(self, message: Dict[str, Any])-> AbstractGame:

        game_tag = message.get("id")
        self.logger.info(f"create new game of tag: {game_tag}")
        if game_tag in self._games:
                return self._games[game_tag]
        else:
            game = Game(
                game_tag=game_tag,
                username=self.username,
                logger=self.logger
            )

            # set player color
            if (message.get("black") == game.player_username):
                game.player_color = "b"
            elif (message.get("white") == game.player_username):
                game.player_color = "w"
            
            # (if color tags cannot be found, player is given white by default)

            game._game_status = "playing"
            game.game_fen = message.get("gameFen")
            board = chess.Board(game.game_fen)
            game.to_play = "b" if board.turn == chess.BLACK else "w"

            game.player_color = "b" if message.get("black") == self.username else "w"

            await self._game_count_queue.put(None)
            if game_tag in self._games:
                await self._game_count_queue.get()
                return self._games[game_tag]
            
            async with self._game_start_condition:
                self._game_semaphore.release()
                self._game_start_condition.notify_all()
                self._games[game_tag] = game

            return game
    
    async def _get_game(self, game_tag: str) -> AbstractGame:
        while True:
            if game_tag in self._games:
                return self._games[game_tag]
            async with self._game_start_condition:
                await self._game_start_condition.wait() #why?
    
    async def _handle_accepted_invite(self, game_tag: str):
        if game_tag not in self._games:
            if self.autostart:
                self.logger.info(f"Auto Starting Game Room: {game_tag}")
                await self.start_game(game_tag)
    
    async def _handle_playerJoined(self, game_tag:str):
        if game_tag not in self._games:
            if self.autostart:
                self.logger.info(f"Auto Starting Game Room: {game_tag}")
                await self.start_game(game_tag)
    
    async def start_game(self, game_tag:str):
        self.logger.info(f"Auto Starting Game: {game_tag}")
        await self.chess_client.send_message(f'42["startGame", "{game_tag}"]')

    async def _handle_game_start(self, message: Dict[str, Any]):
        self.logger.info("===== ===== HANDLING GAME START ===== =====")
        self.logger.info(message)
        game_tag = message.get("id")
        game = await self._create_game(message)

        if self.games[game_tag] :
            self.logger.info("ABLE TO CREATE NEW GAME")

        return game

    async def _handle_ingame_message(self, message):
        self.logger.info("HANDLE INGAME MESSAGE")
        game_tag = message.get("room")
        if not game_tag:
            game_tag = message.get("id")
        if not game_tag:
            game_tag = message.get("roomId")
            
        fen = message.get("fen")
        game_status = message.get("status")
        self.logger.info(game_tag)
        self.logger.info(fen)
        self.logger.info(game_status)

        if game_tag and (game_tag in self._games) and (game_status == "playing"):
            self.logger.info(f"Game Started and Playing: {game_tag}")
            game = await self._get_game(game_tag)

            game.game_fen = fen
            board = chess.Board(game.game_fen)
            game.to_play = "b" if board.turn == chess.BLACK else "w"

            self.logger.info(f"handling game request for game: {game.game_tag}")
            await self._handle_game_request(game)

    async def _handle_game_request(self,
            game: AbstractGame,
            ):
        
        self.logger.info(f"handling game request for game: {game.game_tag}")
        # choose a move and return a response if it is player's turn

        if game.to_play == game.player_color:
            move_str = self.choose_move(game)
            
            move_msg = f'42["move", {{"roomId": "{game.game_tag}", "move": "{move_str}"}}]'
            self.logger.info(f"trying to make a move: {move_str}")
            
            #f'42["move","{roomId, move}"]'
            await self.chess_client.send_message(
                move_msg
            )
    
    @abstractmethod
    def choose_move(
        self, battle: AbstractGame
    )->str:
        pass
    
    def choose_random_move(self, game: AbstractGame) -> str:
        board = chess.Board(game.game_fen)
        # Get a list of legal moves
        legal_moves = list(board.legal_moves)

        # Choose a random move
        if legal_moves:
            random_move = random.choice(legal_moves)
            self.logger.info(f"Suggested random move: {random_move.uci()}")
            return board.san(random_move)
        else:
            self.logger.info("No legal moves available. The game might be over.")
            return False 

    async def _handle_invite_request(self, inviter:str, roomId: str):
        """Handles an individual invite."""
        challenging_player = inviter

        if challenging_player != self.username:
            #todo: also check if format is correct
            await self._invite_queue.put(challenging_player)
    
    async def accept_invites(self, opponent: Optional[Union[str, List[str]]],
        n_challenges: int):
        await handle_threaded_coroutines(
            self._accept_challenges(opponent, n_challenges)
        )

    async def _accept_invites(self,
        opponent: Optional[Union[str, List[str]]],
        n_challenges: int):
        
        if opponent:
            if isinstance(opponent, list):
                opponent = [str(o) for o in opponent]
            else:
                opponent = str(opponent)
        await self.chess_client.logged_in.wait()
        self.logger.debug("Event logged in received in accept_challenge")

        for _ in range(n_challenges):
            while True:
                # get username inviter from queue until it matches the opponent specified
                roomId, username = str(await self._invite_queue.get())
                self.logger.debug(
                    "Consumed %s from invite queue in accept_invite", roomId, username,
                )

                # if opponent is None, accept any invites (1 times)
                if (
                    (opponent is None)
                    or (opponent == username)
                    or (isinstance(opponent, list) and (username in opponent))
                ):
                    await self.chess_client.accept_invite(username)
                    await self._game_semaphore.acquire()
                    break
        await self._game_count_queue.join()

    async def send_invites(
        self, opponent: str, n_challenges: int, to_wait: Optional[Event] = None
    ):
        """Make the player send challenges to opponent.

        opponent must be a string, corresponding to the name of the player to challenge.

        n_challenges defines how many challenges will be sent.

        to_wait is an optional event that can be set, in which case it will be waited
        before launching challenges.

        :param opponent: Player username to challenge.
        :type opponent: str
        :param n_challenges: Number of battles that will be started
        :type n_challenges: int
        :param to_wait: Optional event to wait before launching challenges.
        :type to_wait: Event, optional.
        """
        await handle_threaded_coroutines(
            self._send_invites(opponent, n_challenges, to_wait)
        )

    async def _send_invites(
        self, opponent: str, n_challenges: int, to_wait: Optional[Event] = None
    ):
        await self.chess_client.logged_in.wait()
        self.logger.info("Event logged in received in send invite")

        if to_wait is not None:
            await to_wait.wait()

        start_time = perf_counter()

        for _ in range(n_challenges):
            #await self.chess_client.invite_player(opponent, self._format)
            await self.chess_client.invite_player(opponent)
            await self._game_semaphore.acquire()
        await self._game_count_queue.join()
        self.logger.info(
            "Challenges (%d games) finished in %fs",
            n_challenges,
            perf_counter() - start_time,
        )

    @property
    def games(self) -> Dict[str, AbstractGame]:
        return self._games

    @property
    def format(self) -> str:
        return self._format
    
    @property
    def logger(self) -> Logger:
        return self.chess_client.logger

    @property
    def username(self) -> str:
        return self.chess_client.username



