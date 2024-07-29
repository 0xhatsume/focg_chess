"""This module contains objects related to server configuration.
"""

from typing import NamedTuple


class ServerConfiguration(NamedTuple):
    """Server configuration object. Represented with a tuple with two entries: server url
    and authentication endpoint url."""

    websocket_url: str
    authentication_url: str


LocalhostServerConfiguration = ServerConfiguration(
    "localhost:3001",
    "",
)
