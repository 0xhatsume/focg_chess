import asyncio
import websockets
import json
import logging
import time

class ChessGameConnectionTest:
    def __init__(self, base_url):
        self.base_url = base_url
        self.websocket = None
        self.sid = None
        self.ping_interval = None
        self.ping_timeout = None
        self.player_name = None
        self.connected = asyncio.Event()

    async def connect(self):
        ws_uri = f"ws://{self.base_url}/socket.io/?EIO=4&transport=websocket"
        try:
            self.websocket = await websockets.connect(
                ws_uri,
                extra_headers={"Origin": f"http://{self.base_url}"}
            )
            logging.info("Connected to server via WebSocket")
            asyncio.create_task(self.message_handler())
            return True
        except Exception as e:
            logging.error(f"WebSocket connection failed: {str(e)}")
            return False

    async def message_handler(self):
        try:
            while True:
                message = await self.websocket.recv()
                logging.info(f"Received raw message: {message}")
                if message.startswith('0'):  # Socket.IO handshake
                    await self.handle_handshake(message[1:])
                elif message.startswith('40'):  # Socket.IO connection established
                    logging.info("Socket.IO connection established")
                    self.connected.set()
                elif message.startswith('42'):  # Socket.IO event
                    await self.handle_event(message[2:])
                elif message == '2':  # Socket.IO ping
                    await self.send_message('3')  # Respond with pong
        except websockets.exceptions.ConnectionClosed:
            logging.error("WebSocket connection closed")
            self.connected.clear()

    async def handle_handshake(self, data):
        handshake_data = json.loads(data)
        self.sid = handshake_data['sid']
        self.ping_interval = handshake_data.get('pingInterval', 25000) / 1000
        self.ping_timeout = handshake_data.get('pingTimeout', 20000) / 1000
        logging.info(f"Handshake successful. SID: {self.sid}")
        await self.send_message('40')  # Send connection request

    async def handle_event(self, data):
        event_data = json.loads(data)
        event = event_data[0]
        payload = event_data[1] if len(event_data) > 1 else None
        logging.info(f"Received event: {event}, payload: {payload}")
        if event == 'playerNameSet':
            self.player_name = payload.get('name')
            logging.info(f"Player name set: {self.player_name}")

    async def send_message(self, data):
        if self.websocket and self.websocket.open:
            await self.websocket.send(data)
            logging.info(f"Sent message: {data}")
        else:
            logging.error("WebSocket is not open")

    async def register_name(self, name):
        await self.connected.wait()
        await self.send_message(f'42["setPlayerName","{name}"]')
        # Wait for response
        start_time = time.time()
        while time.time() - start_time < 5:  # 5 second timeout
            if self.player_name:
                return True
            await asyncio.sleep(0.1)
        return False

    async def verify_registration(self):
        if self.player_name:
            logging.info(f"Registration successful. Player name: {self.player_name}")
            return True
        else:
            logging.error("Registration failed. Player name not set.")
            return False

    async def run_test(self):
        try:
            if not await self.connect():
                logging.error("Test aborted due to connection failure")
                return False

            test_name = "TestPlayer"
            registration_success = await self.register_name(test_name)
            
            if registration_success:
                logging.info("Test passed: Player registration successful")
                return True
            else:
                logging.error("Test failed: Player registration unsuccessful")
                return False
        finally:
            if self.websocket and self.websocket.open:
                await self.websocket.close()
                logging.info("WebSocket connection closed gracefully")

async def main():
    logging.basicConfig(level=logging.INFO)
    base_url = "localhost:3001"  # Adjust this to your server's base URL
    test = ChessGameConnectionTest(base_url)
    success = await test.run_test()
    
    print("\n--- Test Summary ---")
    if success:
        print("✅ All tests passed successfully!")
    else:
        print("❌ Some tests failed. Check the logs for details.")

if __name__ == "__main__":
    asyncio.run(main())