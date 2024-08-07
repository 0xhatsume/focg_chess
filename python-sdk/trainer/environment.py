import os
from abc import ABC, abstractmethod
from logging import Logger
from typing import Any, Dict, List, Optional, Set, Tuple, Union

class AbstractGame(ABC):
    def __init__(self,
        game_tag:str,
        username: str,
        logger:Logger,

        ):
        
        # Utils attributes
        self._game_tag: str = game_tag
        self._player_username: str = username
        self._player_color: str = "w"
        self._opponent_username: Optional[str] = None
        self._anybody_inactive: bool = False
        self._reconnected: bool = True
        self.logger: Optional[Logger] = logger
        self._wait: Optional[bool] = None
        self._finished: bool = False
        self._turn: int = 0
        self._game_status: str = "waiting"
        self.game_fen: str = ""
        self.to_play: str = "w"

        # Initialize Observations
        #self._observations: Dict[int, Observation] = {}
        #self._current_observation: Observation = Observation()


    @property
    def game_tag(self) -> str:
        """
        :return: The battle identifier.
        :rtype: str
        """
        return self._game_tag
    
    @property
    def opponent_username(self) -> Optional[str]:
        """
        :return: The opponent's username, or None if unknown.
        :rtype: str, optional.
        """
        return self._opponent_username

    @opponent_username.setter
    def opponent_username(self, value: str):
        self._opponent_username = value

    @property
    def player_username(self) -> str:
        """
        :return: The player's username.
        :rtype: str
        """
        return self._player_username

    @player_username.setter
    def player_username(self, value: str):
        self._player_username = value
    
    @property
    def player_color(self) -> str:
        return self._player_color
    
    @player_color.setter
    def player_color(self, value:str):
        self._player_color = value

    @property
    def turn(self) -> int:
        """
        :return: The current battle turn.
        :rtype: int
        """
        return self._turn
    

    @turn.setter
    def turn(self, turn: int):
        """Sets the current turn counter to given value.

        :param turn: Current turn value.
        :type turn: int
        """
        self._turn = turn


class Game(AbstractGame):
    def __init__(
        self,
        game_tag: str,
        username: str,
        logger: Logger
    ):
        super(Game, self).__init__(game_tag, username, logger)
        # Turn choice attributes
        self._available_moves: List = []