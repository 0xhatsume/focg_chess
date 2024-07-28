import asyncio
import socketio
import logging

class ChessGameTest:
    def __init__(self):
        self.sio = socketio.AsyncClient()
        self.player_name = None
        self.session = None

    async def connect(self):
        await self.sio.connect('http://localhost:3001')
        logging.info("Connected to server")

        @self.sio.event
        def connect():
            logging.info("Connection established")

        @self.sio.event
        def disconnect():
            logging.info("Disconnected from server")

        @self.sio.on('session')
        def on_session(data):
            logging.info(f"Session received: {data}")
            self.session = data

        @self.sio.on('playerNameSet')
        def on_player_name_set(data):
            logging.info(f"Player name set: {data}")
            self.player_name = data['name']

    async def register_name(self, name):
        await self.sio.emit('setPlayerName', name)
        await asyncio.sleep(1)  # Wait for server response

    async def verify_registration(self):
        if self.player_name:
            logging.info(f"Registration successful. Player name: {self.player_name}")
            return True
        else:
            logging.error("Registration failed. Player name not set.")
            return False

    async def run_test(self):
        await self.connect()
        
        test_name = "TestPlayer"
        await self.register_name(test_name)
        
        registration_success = await self.verify_registration()
        
        if registration_success:
            logging.info("Test passed: Player registration successful")
        else:
            logging.error("Test failed: Player registration unsuccessful")

        await self.sio.disconnect()

async def main():
    logging.basicConfig(level=logging.INFO)
    test = ChessGameTest()
    await test.run_test()

if __name__ == "__main__":
    asyncio.run(main())