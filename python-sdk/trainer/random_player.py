from player import Player
from environment import AbstractGame

import asyncio
from account_configuration import AccountConfiguration
from server_configuration import LocalhostServerConfiguration

import logging

class RandomPlayer(Player):
    def choose_move(self, game: AbstractGame):
        return self.choose_random_move(game)

async def main():
		# We create a random player
		player = RandomPlayer(
			account_configuration=AccountConfiguration("rando_chessbot", None),
			server_configuration=LocalhostServerConfiguration,
            log_level=logging.INFO
		)

		# Sending challenges to 'your_username'
		await player.send_invites("0xhatsume", n_challenges=1)



if __name__ == "__main__":
    asyncio.get_event_loop().run_until_complete(main())