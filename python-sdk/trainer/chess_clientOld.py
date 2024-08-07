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
        avatar: Optional[str] = None,
        log_level: Optional[int] = None,
        server_configuration: ServerConfiguration,
        start_listening: bool = True,
        ping_interval: Optional[float] = 20.0,
        ping_timeout: Optional[float] = 20.0,
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

        if start_listening:
            # self._listening_coroutine = asyncio.run_coroutine_threadsafe(
            #     self.listen(), CHESS_LOOP
            # )
            self._listening_coroutine = create_task(self.listen())
        

    async def invite_player(self, invitee:str):
        await self.connected.wait()
        self.invitation_sent.clear()
        await self.send_message(f'42["invitePlayer", {{"invitee": "{invitee}"}}]')
        # Wait for response
        try:
            await asyncio.wait_for(self.invitation_sent.wait(), timeout=5.0)
            return self.invitation_response
        except asyncio.TimeoutError:
            self.logger.error("Timeout waiting for invitation response")
            return None

    async def message_handler(self, message):
        try:
            #message = await self.websocket.recv()
            self.logger.info(f"Received raw message: {message}")
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
    
    async def manual_message_handler(self):
        try:
            message = await self.websocket.recv()
            self.logger.info(f"Received raw message: {message}")
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
        self.logger.info(f"Handshake successful. SID: {self.sid}")
        await self.send_message('40')
        self.connected.set()
    
    async def handle_event(self, data):
        event_data = json.loads(data)
        event = event_data[0]
        payload = event_data[1] if len(event_data) > 1 else None
        self.logger.info(f"Received event: {event}, payload: {payload}")
        if event == 'playerNameSet':
            self.player_name = payload.get('name')
            self.logger.info(f"Player name set: {self.player_name}")
            self._logged_in.set()  # Use the correct attribute name
            self.logger.info("Player logged_in set")

        elif event == 'invitationSent':
            self.invitation_response = payload
            self.invitation_sent.set()
        elif event == 'invitationError':
            self.invitation_response = payload
            self.invitation_sent.set()

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
        # Wait for response
        start_time = time.time()
        while time.time() - start_time < 5:  # 5 second timeout
            if self.player_name:
                logging.info(f"Test passed: Player ({self.player_name})registration successful")
                return True
            await asyncio.sleep(0.1)
        logging.error("Test failed: Player registration unsuccessful")
        return False
    
    async def wait_for_login(self, checking_interval: float = 0.001, wait_for: int = 5):
        start = perf_counter()
        while perf_counter() - start < wait_for:
            await sleep(checking_interval)
            if self.logged_in:
                return
        assert self.logged_in, f"Expected {self.username} to be logged in."
    

    async def send_message(self, data):
        if self.websocket and self.websocket.open:
            await self.websocket.send(data)
            self.logger.info(f"Sent message: {data}")
        else:
            self.logger.error("WebSocket is not open")

    async def connect(self):
        ws_uri = f"ws://{self.websocket_url}/socket.io/?EIO=4&transport=websocket"
        try:
            self.websocket = await ws.connect(
                ws_uri,
                extra_headers={"Origin": f"http://{self.websocket_url}"}
            )
            logging.info("Connected to server via WebSocket")
            #asyncio.create_task(self.message_handler())
            return True
        except Exception as e:
            logging.error(f"WebSocket connection failed: {str(e)}")
            return False
    
    async def manualConnect(self):
        ws_uri = f"ws://{self.websocket_url}/socket.io/?EIO=4&transport=websocket"
        self.websocket = await ws.connect(
            ws_uri,
            extra_headers={"Origin": f"http://{self.websocket_url}"}
        )
        logging.info("Connected to server via WebSocket")
        create_task(self.manual_message_handler())
        return True
        
    async def listen(self):
        """Listen to websocket and dispatch messages to be handled."""
        self.logger.info("Starting listening to websocket")
        ws_uri = f"ws://{self.websocket_url}/socket.io/?EIO=4&transport=websocket"
        if not self.connected.is_set():
            self.logger.info("Server not connected, connecting now...")
            self.websocket = await ws.connect(
                ws_uri,
                extra_headers={"Origin": f"http://{self.websocket_url}"}
            )
            logging.info("Connected to server via WebSocket")
            message = await self.websocket.recv()
            create_task(self.message_handler(message))
        
        await self.connected.wait()
        self.logger.info("WebSocket Connected")
        try:
            # async with ws.connect(
            #     ws_uri,
            #     extra_headers={"Origin": f"http://{self.websocket_url}"},
            #     max_queue=None,
            #     ping_interval=self._ping_interval,
            #     ping_timeout=self._ping_timeout,
            # ) as websocket:
            #     self.websocket = websocket
            
            async for message in self.websocket:
                self.logger.info("\033[92m\033[1m<<<\033[0m %s", message)
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
    

async def main():
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

    #await chessBot.manualConnect()
    logging.info("ChessBot created")

    # Wait for the connection to be established
    try:
        await asyncio.wait_for(chessBot.connected.wait(), timeout=30)
        logging.info("Successfully connected to the server")
    except asyncio.TimeoutError:
        logging.error("Failed to connect to the server within the timeout period")
        return

    # Now wait for login to complete
    try:
        await asyncio.wait_for(chessBot.logged_in.wait(), timeout=30)
        logging.info("Successfully logged in")
    except asyncio.TimeoutError:
        logging.error("Failed to log in within the timeout period")
        return

    # Proceed with the invitation test
    invite_result = await chessBot.invite_player("scv")
    logging.info("Invite result: %s", invite_result)

    if invite_result:
        if 'message' in invite_result and 'Player not found' in invite_result['message']:
            logging.info("Test passed: Invitation to non-existent player handled correctly")
        elif 'roomId' in invite_result:
            logging.info("Test passed: Invitation sent successfully. Room ID: %s", invite_result['roomId'])
        else:
            logging.error("Test failed: Unexpected invitation response")
    else:
        logging.error("Test failed: No response received for invitation")

    # Keep the client running for a while to process any remaining messages
    await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.get_event_loop().run_until_complete(main())
    #asyncio.run(main())