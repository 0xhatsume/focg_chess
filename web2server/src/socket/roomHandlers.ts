import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { GameRoom, Player } from '../types';

// In-memory storage for rooms
const rooms: Record<string, GameRoom> = {};
const playerSockets: Record<string, string> = {}; // Map player names to socket IDs

export function configureRoomHandlers(io: Server, socket: Socket, sessionStore: Map<string, any>) {
    // Send the current room list to the client when they connect
    //socket.emit('roomListUpdate', Object.values(rooms));

    socket.on('createRoom', ({ roomName }) => {
        const roomId = uuidv4();
        const session = sessionStore.get(socket.data.sessionID);
        const player: Player = { id: socket.data.userID, name: session.playerName, color: 'white' };
        
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

    socket.on('joinRoom', ({ roomId }) => {
        const room = rooms[roomId];
        if (room) {
            const session = sessionStore.get(socket.data.sessionID);
            const existingPlayer = room.players.find(p => p.id === socket.data.userID);

            if (existingPlayer) {
                console.log("existing player joining back", socket.data.userID);
                socket.join(roomId);
                existingPlayer.name = session.playerName; // Update name in case it changed
                io.to(roomId).emit('playerJoined', { 
                    roomId, 
                    players: room.players,
                    fen: room.gameFen,
                    history: room.moveHistory,
                    status: room.gameStatus
                });
            } else if (room.players.length < 2) {
                console.log("new player joining")
                const color = room.players[0].color === 'white' ? 'black' : 'white';
                const player: Player = { id: socket.data.userID, name: session.playerName, color };
                room.players.push(player);
                socket.join(roomId);
                io.to(roomId).emit('playerJoined', { 
                    roomId, 
                    players: room.players,
                    fen: room.gameFen,
                    history: room.moveHistory,
                    status: room.gameStatus
                });
            } else {
                console.log("spectator")
                socket.join(roomId);
                io.to(roomId).emit('joinedAsSpectator', { 
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
            console.log("gameStart", roomId)
            io.to(roomId).emit('gameStart', { 
                ...room,
                white: room.players.find(p => p.color === 'white')!.name, 
                black: room.players.find(p => p.color === 'black')!.name 
            });
            io.to(roomId).emit('gameState', {
                room: roomId,
                fen: room.gameFen,
                history: room.moveHistory,
                status: room.gameStatus,
                white: room.players.find(p => p.color === 'white')!.name, 
                black: room.players.find(p => p.color === 'black')!.name 
            });
        }
        else {
            console.log("===== FAILED TO START GAME =====")
            console.log(room)
            console.log("players length: ", room.players.length)
        }
    });

    socket.on('invitePlayer', ({ invitee }) => {
        const inviterSession = sessionStore.get(socket.data.sessionID);
        const inviterName = inviterSession.playerName;
        
        // Find the socket ID of the invitee
        let inviteeSocketId: string | undefined;
        for (const [sessionID, session] of sessionStore.entries()) {
            if (session.playerName === invitee) {
                const inviteeSocket = Array.from(io.sockets.sockets.values()).find(s => s.data.sessionID === sessionID);
                if (inviteeSocket) {
                    inviteeSocketId = inviteeSocket.id;
                    break;
                }
            }
        }
        
        if (inviteeSocketId) {
            const roomId = uuidv4();
            const inviter: Player = { id: socket.data.userID, name: inviterName, color: 'white' };
            
            rooms[roomId] = { 
                id: roomId, 
                name: `${inviterName} vs ${invitee}`,
                players: [inviter],
                gameStarted: false,
                gameFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                moveHistory: [],
                gameStatus: 'waiting'
            };

            // Emit invitation to invitee
            io.to(inviteeSocketId).emit('invitation', { from: inviterName, roomId });

            // Emit acknowledgement to inviter
            socket.emit('invitationSent', { 
                message: `Invitation sent to ${invitee}`,
                roomId: roomId,
                roomName: rooms[roomId].name
            });

            // Join the inviter to the room
            socket.join(roomId);
            
            // Emit updated room list to all connected clients
            io.emit('roomListUpdate', Object.values(rooms));
            
        } else {
            socket.emit('invitationError', { message: 'Player not found or offline' });
            console.log("invitation error")
        }
    });

    socket.on('acceptInvitation', ({ roomId }) => {
        const room = rooms[roomId];
        if (room) {
            const session = sessionStore.get(socket.data.sessionID);
            const invitee: Player = { id: socket.data.userID, name: session.playerName, color: 'black' };
            room.players.push(invitee);
            socket.join(roomId);

            // Find the inviter's socket
            const inviter = room.players.find(player => player.id !== socket.data.userID);
            if (inviter) {
                const inviterSocket = Array.from(io.sockets.sockets.values()).find(s => s.data.userID === inviter.id);
                if (inviterSocket) {
                    // Emit inviteAccepted event to the inviter
                    inviterSocket.emit('inviteAccepted', { roomId });
                }
            }

            // Emit playerJoined event to all players in the room
            io.to(roomId).emit('playerJoined', { 
                roomId: roomId, 
                players: room.players,
                fen: room.gameFen,
                history: room.moveHistory,
                status: room.gameStatus
            });

            // Update the room list for all clients
            emitUpdatedRoomList(io);
        }
    });

    socket.on('declineInvitation', ({ from }) => {
        // Find the socket ID of the inviter
        let inviterSocketId: string | undefined;
        let inviterRoomId: string | undefined;
        for (const [sessionID, session] of sessionStore.entries()) {
            if (session.playerName === from) {
                const inviterSocket = Array.from(io.sockets.sockets.values()).find(s => s.data.sessionID === sessionID);
                if (inviterSocket) {
                    inviterSocketId = inviterSocket.id;
                    // Find the room created by the inviter
                    inviterRoomId = Object.keys(rooms).find(roomId => 
                        rooms[roomId].players.length === 1 && 
                        rooms[roomId].players[0].id === inviterSocket.data.userID
                    );
                    break;
                }
            }
        }

        if (inviterSocketId) {
            const declinerSession = sessionStore.get(socket.data.sessionID);
            io.to(inviterSocketId).emit('invitationDeclined', { by: declinerSession.playerName });

            // Remove the room if it was created for this invitation
            if (inviterRoomId) {
                delete rooms[inviterRoomId];
                console.log(`Room ${inviterRoomId} removed after invitation decline.`);
                // Notify all clients about the updated room list
                io.emit('roomListUpdate', Object.values(rooms));
            }
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