import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { GameRoom, Player } from '../types';

// In-memory storage for rooms
const rooms: Record<string, GameRoom> = {};

export function configureRoomHandlers(io: Server, socket: Socket, playerNames: Record<string, string>) {
    // Send the current room list to the client when they connect
    //socket.emit('roomListUpdate', Object.values(rooms));

    socket.on('createRoom', ({ roomName }) => {
        const roomId = uuidv4();
        const player: Player = { id: socket.data.userID, name: playerNames[socket.data.userID], color: 'white' };
        
        rooms[roomId] = { 
            id: roomId, 
            name: roomName, 
            players: [player],
            gameStarted: false,
            gameFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            moveHistory: [],
            gameStatus: 'waiting'
        };
        
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, player });
        emitUpdatedRoomList(io);
    });

    socket.on('joinRoom', ({ roomId, playerName }) => {
        const room = rooms[roomId];
        if (room) {
            const existingPlayer = room.players.find(p => p.id === socket.data.userID);

            if (existingPlayer) {
                console.log("existing player joining back", socket.data.userID);
                // Player is rejoining the room
                socket.join(roomId);
                existingPlayer.name = playerName; // Update name in case it changed
                io.to(roomId).emit('playerJoined', { 
                        roomId, 
                        players: room.players,
                        fen: room.gameFen,
                        history: room.moveHistory,
                        status: room.gameStatus
                    });
                
            } else if (room.players.length < 3) {
                // New player joining
                console.log("new player joining")
                const color = room.players[0].color === 'white' ? 'black' : 'white';
                const player: Player = { id: socket.data.userID, name: playerName, color };
                room.players.push(player);
                playerNames[socket.data.userID] = playerName;
                socket.join(roomId);
                io.to(roomId).emit('playerJoined', 
                { 
                    roomId, 
                    players: room.players,
                    fen: room.gameFen,
                    history: room.moveHistory,
                    status: room.gameStatus
                });
                // if (room.players.length === 2) {
                //     room.gameStarted = true;
                //     room.gameStatus = 'playing';
                //     io.to(roomId).emit('gameStart', { 
                //         white: room.players.find(p => p.color === 'white')!.name, 
                //         black: room.players.find(p => p.color === 'black')!.name 
                //     });
                // }
            } else {
                // Join as spectator
                console.log("spectator")
                playerNames[socket.data.userID] = playerName;
                socket.join(roomId);
                io.to(roomId).emit('joinedAsSpectator', 
                    { 
                        roomId, 
                        players: room.players,
                        fen: room.gameFen,
                        history: room.moveHistory,
                        status: room.gameStatus
                    });
                
            }
            
            emitUpdatedRoomList(io);
        } else {
            socket.emit('roomNotFound');
        }
    });

    socket.on('leaveRoom', (roomId: string) => {
        const room = rooms[roomId];
        if (room) {
            const playerIndex = room.players.findIndex(p => p.id === socket.data.userID);
            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                io.to(roomId).emit('playerLeft', { color: player.color, name: player.name });
            }
            socket.leave(roomId);
            if (room.players.length === 0) {
                delete rooms[roomId];
            } else {
                room.gameStarted = false;
                //room.gameStatus = 'waiting';
            }
            emitUpdatedRoomList(io);
        }
    });

    socket.on('switchSides', (roomId: string) => {
        const room = rooms[roomId];
        if (room && room.players.length === 2 && !room.gameStarted) {
            [room.players[0].color, room.players[1].color] = [room.players[1].color, room.players[0].color];
            io.to(roomId).emit('sidesSwitched', room.players);
        }
    });

    socket.on('startGame', (roomId: string) => {
        const room = rooms[roomId];
        if (room && room.players.length === 2 && !room.gameStarted) {
            room.gameStarted = true;
            room.gameStatus = 'playing';
            io.to(roomId).emit('gameStart', { 
                white: room.players.find(p => p.color === 'white')!.name, 
                black: room.players.find(p => p.color === 'black')!.name 
            });
            io.to(roomId).emit('gameState', {
                room: roomId,
                fen: room.gameFen,
                history: room.moveHistory,
                status: room.gameStatus,
            });
        }
    });

    // New event for querying room list
    socket.on('getRoomList', () => {
        socket.emit('roomListUpdate', Object.values(rooms));
    });

    // Handle disconnections
    socket.on('disconnect', () => {
        // Find all rooms the player is in
        // Object.values(rooms).forEach(room => {
        //     const playerIndex = room.players.findIndex(p => p.id === socket.data.userID);
        //     if (playerIndex !== -1) {
        //         const player = room.players[playerIndex];
        //         room.players.splice(playerIndex, 1);
        //         socket.to(room.id).emit('playerLeft', { color: player.color, name: player.name });
                
        //         if (room.players.length === 0) {
        //             delete rooms[room.id];
        //         } else {
        //             room.gameStarted = false;
        //             room.gameStatus = 'waiting';
        //         }
        //     }
        // });
        // emitUpdatedRoomList(io);
        console.log("User disconnected from room");
    });
}

function emitUpdatedRoomList(io: Server) {
    console.log('Emitting updated room list');
    io.emit('roomListUpdate', Object.values(rooms));
    console.log(rooms);
}

export { rooms };