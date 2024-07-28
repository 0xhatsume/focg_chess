import socketio
import asyncio

class ChessGameTester:
    def __init__(self, server_url):
        self.sio = socketio.AsyncClient()
        self.server_url = server_url
        self.player_name = None
        self.player_name_set = asyncio.Event()

        @self.sio.event
        async def connect():
            print("Connected to server")

        @self.sio.event
        async def disconnect():
            print("Disconnected from server")

        @self.sio.on('playerNameSet')
        async def on_player_name_set(data):
            print(f"Player name set/get: {data}")
            self.player_name = data['name']
            self.player_name_set.set()

    async def connect_to_server(self):
        await self.sio.connect(self.server_url)
        await asyncio.sleep(1)  # Give some time for the connection to establish

    async def set_player_name(self, name):
        self.player_name_set.clear()
        await self.sio.emit('setPlayerName', name)
        print(f"Sent setPlayerName event: {name}")

    async def get_player_name(self):
        self.player_name_set.clear()
        await self.sio.emit('getPlayerName')
        print("Sent getPlayerName event")

    async def disconnect_from_server(self):
        await self.sio.disconnect()

    async def is_connected(self):
        return self.sio.connected

    async def verify_player_name(self, expected_name, timeout=5):
        try:
            await asyncio.wait_for(self.player_name_set.wait(), timeout)
            return self.player_name == expected_name
        except asyncio.TimeoutError:
            return False

    async def run_test(self):
        try:
            await self.connect_to_server()
            
            if await self.is_connected():
                print("Successfully connected to the server.")
            else:
                print("Failed to connect to the server.")
                return

            expected_name = "TestPlayer"
            await self.set_player_name(expected_name)
            
            if await self.verify_player_name(expected_name):
                print(f"Player name '{expected_name}' successfully set.")
            else:
                print(f"Failed to set player name '{expected_name}'.")

            await asyncio.sleep(1)  # Give some time for server to process

            await self.get_player_name()

            if await self.verify_player_name(expected_name):
                print(f"Player name '{expected_name}' successfully retrieved from server.")
            else:
                print(f"Failed to retrieve player name '{expected_name}' from server.")

        finally:
            await self.disconnect_from_server()

async def main():
    tester = ChessGameTester('http://localhost:3001')
    await tester.run_test()

if __name__ == "__main__":
    asyncio.run(main())