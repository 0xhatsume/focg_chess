import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

interface Player {
    id: string;
    name: string;
    color: 'white' | 'black';
}

interface GameRoom {
    id: string;
    name: string;
    players: Player[];
    gameStarted: boolean;
}

interface GameResult {
    winner: 'white' | 'black' | 'draw';
    reason: 'checkmate' | 'stalemate' | 'insufficient material' | 'threefold repetition' | 'draw' | 'resignation' | 'timeout';
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

const rooms: Record<string, GameRoom> = {};
const playerNames: Record<string, string> = {};

function emitUpdatedRoomList() {
    io.emit('roomListUpdate', Object.values(rooms));
}

io.on('connection', (socket: Socket) => {
    console.log('A user connected');

    const storedName = playerNames[socket.id];
    if (storedName) {
        socket.emit('nameRestored', storedName);
    }

    socket.emit('roomListUpdate', Object.values(rooms));

    socket.on('setPlayerName', (name: string) => {
        playerNames[socket.id] = name;
    });

    socket.on('createRoom', ({ roomName, playerName }) => {
        const roomId = uuidv4();
        const player: Player = { id: socket.id, name: playerName, color: 'white' };
        
        rooms[roomId] = { 
            id: roomId, 
            name: roomName, 
            players: [player],
            gameStarted: false
        };
        
        playerNames[socket.id] = playerName;
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, player });
        emitUpdatedRoomList();
    });

    socket.on('joinRoom', ({ roomId, playerName }) => {
        const room = rooms[roomId];
        if (room) {
            const existingPlayer = room.players.find(p => p.id === socket.id || p.name === playerName);
            if (existingPlayer) {
                // Player is already in the room, just re-join the socket room
                socket.join(roomId);
                socket.emit('playerJoined', { roomId, players: room.players });
            } else if (room.players.length < 2) {
                const color = room.players[0].color === 'white' ? 'black' : 'white';
                const player: Player = { id: socket.id, name: playerName, color };
                room.players.push(player);
                playerNames[socket.id] = playerName;
                socket.join(roomId);
                io.to(roomId).emit('playerJoined', { roomId, players: room.players });
                if (room.players.length === 2) {
                    io.to(roomId).emit('gameStart', { 
                        white: room.players.find(p => p.color === 'white')!.name, 
                        black: room.players.find(p => p.color === 'black')!.name 
                    });
                }
            } else {
                // Join as spectator
                playerNames[socket.id] = playerName;
                socket.join(roomId);
                socket.emit('joinedAsSpectator', { roomId, players: room.players });
            }
            emitUpdatedRoomList();
        } else {
            socket.emit('roomNotFound');
        }
    });

    socket.on('switchSides', (roomId: string) => {
        const room = rooms[roomId];
        if (room && room.players.length === 2 && !room.gameStarted) {
            [room.players[0].color, room.players[1].color] = [room.players[1].color, room.players[0].color];
            io.to(roomId).emit('sidesSwitched', room.players);
        }
    });

    socket.on('move', ({ roomId, move }) => {
        const room = rooms[roomId];
        if (room) {
            room.gameStarted = true;
            socket.to(roomId).emit('move', move);
        }
    });

    socket.on('offerDraw', ({ roomId, color }) => {
        io.to(roomId).emit('drawOffered', color);
    });

    socket.on('acceptDraw', ({ roomId }) => {
        io.to(roomId).emit('gameOver', { winner: 'draw', reason: 'draw' });
    });

    socket.on('declineDraw', ({ roomId }) => {
        socket.to(roomId).emit('drawDeclined');
    });

    socket.on('gameOver', ({ roomId, result }: { roomId: string, result: GameResult }) => {
        io.to(roomId).emit('gameOver', result);
        const room = rooms[roomId];
        if (room) {
            room.gameStarted = false;
        }
    });

    socket.on('leaveRoom', (roomId: string) => {
        const room = rooms[roomId];
        if (room) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
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
            }
            emitUpdatedRoomList();
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        const playerName = playerNames[socket.id];
        delete playerNames[socket.id];

        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const color = room.players[playerIndex].color;
                room.players.splice(playerIndex, 1);
                io.to(roomId).emit('playerLeft', { color, name: playerName });
                if (room.players.length === 0) {
                    delete rooms[roomId];
                } else {
                    room.gameStarted = false;
                }
            }
        }
        emitUpdatedRoomList();
    });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});