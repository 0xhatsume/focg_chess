import asyncio
import json
import logging
from asyncio import CancelledError, Event, Lock, create_task, sleep
from logging import Logger
from time import perf_counter
from typing import Any, List, Optional, Set

import requests
import websockets.client as ws
from websockets.exceptions import ConnectionClosedOK

from .account_configuration import AccountConfiguration
from .server_configuration import ServerConfiguration
from .concurrency import (
    CHESS_LOOP,
    create_in_chess_loop,
    handle_threaded_coroutines,
)

class ChessClient:
    def __init__(
        self,
        account_configuration: AccountConfiguration,
        *,
        avatar: Optional[str] = None,
        log_level: Optional[int] = None,
        server_configuration: ServerConfiguration,
        start_listening: bool = True,
        ping_interval: Optional[float] = 20.0,
        ping_timeout: Optional[float] = 20.0,
    ):
        self._active_tasks: Set[Any] = set()
        self._ping_interval = ping_interval
        self._ping_timeout = ping_timeout

        self._server_configuration = server_configuration
        self._account_configuration = account_configuration

        self._logged_in: Event = create_in_chess_loop(Event)
        self._sending_lock = create_in_chess_loop(Lock)

        self.websocket: ws.WebSocketClientProtocol
        self._logger: Logger = self._create_logger(log_level)

        if start_listening:
            self._listening_coroutine = asyncio.run_coroutine_threadsafe(
                self.listen(), CHESS_LOOP
            )
    
    async def log_in(self, split_message: List[str]):
        # if self.account_configuration.password:
        #     log_in_request = requests.post(
        #         self.server_configuration.authentication_url,
        #         data={
        #             "act": "login",
        #             "name": self.account_configuration.username,
        #             "pass": self.account_configuration.password,
        #             "challstr": split_message[2] + "%7C" + split_message[3],
        #         },
        #     )
        #     self.logger.info("Sending authentication request")
        #     assertion = json.loads(log_in_request.text[1:])["assertion"]
        # else:
        #     self.logger.info("Bypassing authentication request")
        #     assertion = ""
        pass
    
    async def send_message(
        self, payload: str
    ):
        await self.websocket.send(payload)

    async def stop_listening(self):
        await handle_threaded_coroutines(self._stop_listening())