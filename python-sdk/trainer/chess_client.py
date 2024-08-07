import asyncio
import json
import logging
from asyncio import CancelledError, Event, Lock, create_task, sleep
from logging import Logger
from time import perf_counter
import time
from typing import Any, List, Optional, Set

import requests
import websockets.client as ws
from websockets.exceptions import ConnectionClosedOK, ConnectionClosed

from account_configuration import AccountConfiguration
from server_configuration import ServerConfiguration, LocalhostServerConfiguration
from concurrency import (
    CHESS_LOOP,
    create_in_chess_loop,
    handle_threaded_coroutines,
)

class ChessClient:
    def __init__(
        self,
        account_configuration: AccountConfiguration,
        *,
        log_level: Optional[int] = None,
        server_configuration: ServerConfiguration,
        start_listening: bool = True,
        ping_interval: Optional[float] = 20.0,
        ping_timeout: Optional[float] = 20.0,
        autostart: bool = True
    ):
        
        self._server_configuration = server_configuration
        self._account_configuration = account_configuration
        self._logger: Logger = self._create_logger(log_level)

        self._active_tasks: Set[Any] = set()
        self._ping_interval = ping_interval
        self._ping_timeout = ping_timeout

        self.connected = create_in_chess_loop(Event)
        self.invitation_sent = create_in_chess_loop(Event)
        self.invitation_response = None
        self._logged_in: Event = create_in_chess_loop(Event)
        self._sending_lock = create_in_chess_loop(Lock)

        self.websocket: ws.WebSocketClientProtocol
        self.sid = None
        
        self.player_name = None
        self.autostart = autostart

        if start_listening:
            self._listening_coroutine = asyncio.run_coroutine_threadsafe(
                self.listen(), CHESS_LOOP
            )
            #self._listening_coroutine = create_task(self.listen())
        

    async def message_handler(self, message):
        try:
            #message = await self.websocket.recv()
            #self.logger.info(f"\033[93m\033[1m<<<\033[0m Received raw message: {message}")
            if message.startswith('0'):  # Socket.IO handshake
                await self.handle_handshake(message[1:])
            elif message.startswith('40'):  # Socket.IO connection established
                self.logger.info("Socket.IO connection established")
                self.connected.set()

                # after we are connected, we can login with our username
                await self.log_in(self.username)

            elif message.startswith('42'):  # Socket.IO event
                await self.handle_event(message[2:])
            elif message == '2':  # Socket.IO ping
                await self.send_message('3')  # Respond with pong
        except ConnectionClosed:
            self.logger.error("WebSocket connection closed")
            self.connected.clear()

    async def handle_handshake(self, data):
        handshake_data = json.loads(data)
        self.sid = handshake_data['sid']
        self.ping_interval = handshake_data.get('pingInterval', 25000) / 1000
        self.ping_timeout = handshake_data.get('pingTimeout', 20000) / 1000
        self.logger.info(f"\033[96m\033[1m===\033[0m Handshake successful. SID: {self.sid}")
        await self.send_message('40')
        self.connected.set()
        self.logger.info("\033[92m\033[1m=== ===\033[0m WebSocket Connected \033[92m\033[1m=== ===\033[0m")
    
    async def handle_event(self, data):
        event_data = json.loads(data)
        event = event_data[0]
        payload = event_data[1] if len(event_data) > 1 else None
        self.logger.info(f"\033[92m\033[1m>>>\033[0m Received event: {event}, payload: {payload}")
        if event == 'playerNameSet':
            self.player_name = payload.get('name')
            if self.player_name: 
                self.logger.info(f"\033[92m\033[1m=== ===\033[0m Player name set: {self.player_name} \033[92m\033[1m=== ===\033[0m")
                self._logged_in.set()

        elif event == 'invitationSent':
            self.invitation_response = payload
            self.invitation_sent.set()
        elif event == 'invitationError':
            self.invitation_response = payload
            self.invitation_sent.set()
        elif event == 'invitation':
            if payload and 'from' in payload and 'roomId' in payload:
                await self._handle_invite_request(payload['from'], payload['roomId'])
        
        elif event == 'inviteAccepted':
            self.logger.info("\033[96m\033[1m=== ===\033[0m Player Accepted Invite \033[96m\033[1m=== ===\033[0m")
            game_tag = payload.get("roomId")
            await self._handle_accepted_invite(game_tag)

        elif event == 'playerJoined':
            self.logger.info(f"Joined Room EVENT: {payload}")
            game_tag = payload.get("roomId")
            #await self._handle_playerJoined(game_tag)

        elif event == 'gameStart':
            self.logger.info(f"Game Started. W: {payload.get('white')} B: {payload.get('black')}")
            #update game object
            await self._handle_game_start(payload)

        elif event == 'gameState':
            self.logger.info(f"Game state update: {payload}")
            await self._handle_ingame_message(payload)
        
        


    def _create_logger(self, log_level: Optional[int]) -> Logger:
        """Creates a logger for the client.

        Returns a Logger displaying asctime and the account's username before messages.

        :param log_level: The logger's level.
        :type log_level: int
        :return: The logger.
        :rtype: Logger
        """
        logger = logging.getLogger(self.username)

        stream_handler = logging.StreamHandler()
        if log_level is not None:
            logger.setLevel(log_level)

        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        stream_handler.setFormatter(formatter)

        logger.addHandler(stream_handler)
        return logger
    
    async def log_in(self, name):
        # another name for the original register_name method
        await self.connected.wait()
        await self.send_message(f'42["setPlayerName","{name}"]')
    
    def wait_for_connection(self, timeout=30):
        return asyncio.run_coroutine_threadsafe(
            self._wait_for_event_external(self.connected, timeout),
            CHESS_LOOP
        ).result()

    def wait_for_login(self, timeout=30):
        return asyncio.run_coroutine_threadsafe(
            self._wait_for_event_external(self._logged_in, timeout),
            CHESS_LOOP
        ).result()

    async def _wait_for_event_external(self, event, timeout):
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False

    async def invite_player(self, invitee:str):
        await self.connected.wait()
        assert self._logged_in.is_set(), f"Expected {self.username} to be logged in."
        self.invitation_sent.clear()
        await self.send_message(f'42["invitePlayer", {{"invitee": "{invitee}"}}]')
        # Wait for response
        try:
            await asyncio.wait_for(self.invitation_sent.wait(), timeout=5.0)
            return self.invitation_response
        except asyncio.TimeoutError:
            self.logger.error("Timeout waiting for invitation response")
            return None
    
    def invite_player_sync(self, invitee: str):
        return asyncio.run_coroutine_threadsafe(
            self.invite_player(invitee),
            CHESS_LOOP
        ).result()

    async def accept_invite(self, roomId: str, inviter: str):
        await self.connected.wait()
        await self.send_message(f'42["acceptInvitation", {{"roomId": "{roomId}"}}]')
        self.logger.info(f"Accepted invitation from {inviter} at room {roomId}")
        
        # Wait for confirmation (you might want to adjust this based on your server's response)
        try:
            # Assuming your server sends a 'joinedRoom' event when successful
            event = await asyncio.wait_for(self._wait_for_event('playerJoined'), timeout=5.0)
            self.logger.info(f"Successfully joined room: {event}")
            return True
        except asyncio.TimeoutError:
            self.logger.error("Timeout waiting for room join confirmation")
            return False

    def accept_invite_sync(self, roomId: str, inviter: str):
        return asyncio.run_coroutine_threadsafe(
            self.accept_invite(roomId, inviter),
            CHESS_LOOP
        ).result()
    
    async def _wait_for_event(self, event_name: str):
        # This is a helper method to wait for a specific event
        future = asyncio.get_running_loop().create_future()
        
        def event_handler(data):
            future.set_result(data)
            self.websocket.remove_event_listener(event_name, event_handler)

        self.websocket.add_event_listener(event_name, event_handler)
        return await future

    async def handle_invitation(self, inviter: str, roomId: str):
        self.logger.info(f"Received invitation from {inviter} to join room {roomId}")
        return {'inviter': inviter, 'roomId': roomId}
    
    async def send_message(self, data):
        if self.websocket and self.websocket.open:
            await self.websocket.send(data)
            self.logger.info(f"\033[91m\033[1m<<<\033[0m Sent message: {data}")
        else:
            self.logger.error("WebSocket is not open")

    async def connect(self):
        ws_uri = f"ws://{self.websocket_url}/socket.io/?EIO=4&transport=websocket"
        try:
            self.websocket = await ws.connect(
                ws_uri,
                extra_headers={"Origin": f"http://{self.websocket_url}"}
            )
            self.logger.info("Connected to server via WebSocket")
            #asyncio.create_task(self.message_handler())
            return True
        except Exception as e:
            self.logger.error(f"WebSocket connection failed: {str(e)}")
            return False
        
    async def listen(self):
        """Listen to websocket and dispatch messages to be handled."""
        self.logger.info("Starting listening to websocket")
        ws_uri = f"ws://{self.websocket_url}/socket.io/?EIO=4&transport=websocket"
        try:
            async with ws.connect(
                ws_uri,
                extra_headers={"Origin": f"http://{self.websocket_url}"},
                # max_queue=None,
                # ping_interval=self._ping_interval,
                # ping_timeout=self._ping_timeout,
            ) as websocket:
                self.websocket = websocket
            
                async for message in self.websocket:
                    self.logger.info("\033[93m\033[1m>>>\033[0m %s", message)
                    task = create_task(self.message_handler(str(message)))
                    self._active_tasks.add(task)
                    task.add_done_callback(self._active_tasks.discard)

        except ConnectionClosedOK:
            self.logger.warning(
                "Websocket connection with %s closed", self.websocket_url
            )
        except (CancelledError, RuntimeError) as e:
            self.logger.critical("Listen interrupted by %s", e)
        except Exception as e:
            self.logger.exception(e)

    async def _stop_listening(self):
        await self.websocket.close()

    async def stop_listening(self):
        await handle_threaded_coroutines(self._stop_listening())

    

    @property
    def account_configuration(self) -> AccountConfiguration:
        """The client's account configuration.

        :return: The client's account configuration.
        :rtype: AccountConfiguration
        """
        return self._account_configuration

    @property
    def logged_in(self) -> Event:
        """Event object associated with user login.

        :return: The logged-in event
        :rtype: Event
        """
        return self._logged_in

    @property
    def logger(self) -> Logger:
        """Logger associated with the client.

        :return: The logger.
        :rtype: Logger
        """
        return self._logger

    @property
    def server_configuration(self) -> ServerConfiguration:
        """The client's server configuration.

        :return: The client's server configuration.
        :rtype: ServerConfiguration
        """
        return self._server_configuration

    @property
    def username(self) -> str:
        """The account's username.

        :return: The account's username.
        :rtype: str
        """
        return self.account_configuration.username

    @property
    def websocket_url(self) -> str:
        """The websocket url.

        It is derived from the server url.

        :return: The websocket url.
        :rtype: str
        """
        return self.server_configuration.websocket_url
    
def create_main_logger(log_level: Optional[int] = None) -> Logger:
    logger = logging.getLogger("Main")
    stream_handler = logging.StreamHandler()
    if log_level is not None:
        logger.setLevel(log_level)
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)
    return logger

def main():
    
    main_logger = create_main_logger(logging.INFO)

    account_configuration = AccountConfiguration("TestBot", None)
    server_configuration = LocalhostServerConfiguration
    
    chessBot = ChessClient(
        account_configuration=account_configuration,
        log_level=logging.INFO,
        server_configuration=server_configuration,
        start_listening=True,
        ping_interval=20,
        ping_timeout=20,
    )

    main_logger.info("ChessBot created")

    # Wait for the connection to be established
    if chessBot.wait_for_connection(timeout=30):
        main_logger.info("Successfully connected to the server")
    else:
        main_logger.error("Failed to connect to the server within the timeout period")
        return

    # Now wait for login to complete
    if chessBot.wait_for_login(timeout=30):
        main_logger.info("Successfully logged in")
    else:
        main_logger.error("Failed to log in within the timeout period")
        return

    # Proceed with the invitation test
    invite_result = chessBot.invite_player_sync("scv")
    main_logger.info("Invite result: %s", invite_result)

    if invite_result:
        if 'message' in invite_result and 'Player not found' in invite_result['message']:
            main_logger.info("Test passed: Invitation to non-existent player handled correctly")
        elif 'roomId' in invite_result:
            main_logger.info("Test passed: Invitation sent successfully. Room ID: %s", invite_result['roomId'])
        else:
            main_logger.error("Test failed: Unexpected invitation response")
    else:
        main_logger.error("Test failed: No response received for invitation")

    # Keep the program running for a while to process any remaining messages
    time.sleep(5)

if __name__ == "__main__":
    main()