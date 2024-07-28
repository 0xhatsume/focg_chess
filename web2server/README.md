### Server Protocol

This is a minimum chess server to simulate a chess game backend. To help scaffold and build towards a Dojo/Mud based chess game that can integrate with RL trainers.
We using websockets (socket.io in JS)

1. **'Login' User Name**
   `socket.emit('setPlayerName', name)`

2. **Check for sessionData**
    `socket.emit(getSession)`
    returns 'sessionData' event with {sessionID, userID, playerName}

3. Get Player Name to check if it is in global registry
   `socket.emit(getPlayerName)`
   returns 'playerNameSet' event with {socketId, name} 

4. **Create a Room**
   `socket.emit(createRoom, ({roomName}))`
   returns 'roomCreated' event with {roomId, player}

5. **Join a Room**
   `socket.emit(joinRoom, {roomId, playerName})`
   returns 'playerJoined' event with 
   {
        roomId, 
        players,
        fen,
        history, //move History array
        status // waiting | playing | ended
   }

6. Leave a Room
   `socket.emit(leaveRoom, {roomId})`
   returns 'playerLeft' event with {color, name}
   (if no more players in room, room is deleted)

7. Switch Sides before game starts
   `socket.emit(switchSides, {roomId})`
   returns 'sidesSwitched' with players array

8. **Start a Game**
   `socket.emit(startGame, {roomId})`
   returns 'gameStart' event with {white: player.name, black: player.name}
   AND 'gameState' event with game state object: 
   {
        fen,
        history, //move History array
        status // waiting | playing | ended
   }

9. Get room List
    `socket.emit(getRoomList)`
    returns 'roomListUpdate' event with rooms

10. Disconnect from server
    `socket.emit(disconnect)`


11. **Move a piece when game has started**
    `socket.emit(move, {roomId, move})`
    will check for whether is a valid move. If so, move and update state.
    Then returns:
        'gameState' event with 
        {
            fen: room.gameFen,
            history: room.moveHistory,
            status: room.gameStatus,
            lastMove: move
        }
    
    Then checks if game is over, if so, returns:
    'gameOver' event with {winner: 'black/white/draw', reason: 'string'}

12. offer a draw to opponent
    `socket.emit(offerDraw, {roomId, color})`
13. accept draw offer
    `socket.emit(acceptDraw, {roomId})`
    will update gameStatus and result then return 
    'gameOver' event with { winner: 'draw', reason: 'draw' }
14. declineDraw
    `socket.emit(declineDraw, {roomId})`

15. get Game state at a point
    `socket.emit(getGameState, {roomId})`
    returns 'gameState' event with 
    {
        fen: room.gameFen,
        history: room.moveHistory,
        status: room.gameStatus,
    }