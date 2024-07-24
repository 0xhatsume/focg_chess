import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

interface Player {
    id: string;
    name: string;
    color: 'white' | 'black' | null;
}

interface GameRoom {
    id: string;
    name: string;
    players: Player[];
    spectators: string[];
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
const playerNames: Record<string, string> = {}; // New: Store player names by socket ID

io.on('connection', (socket: Socket) => {
    console.log('A user connected');

    // New: Check if the player has a stored name
    const storedName = playerNames[socket.id];
    if (storedName) {
        socket.emit('nameRestored', storedName);
    }

    socket.emit('roomList', Object.values(rooms));

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
            spectators: [] 
        };
        
        playerNames[socket.id] = playerName; // Store the player name
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
        io.emit('roomList', Object.values(rooms));
    });

    socket.on('joinRoom', ({ roomId, playerName }) => {
        const room = rooms[roomId];
        if (room) {
            if (room.players.length < 2) {
                const color = room.players[0].color === 'white' ? 'black' : 'white';
                const player: Player = { id: socket.id, name: playerName, color };
                room.players.push(player);
                playerNames[socket.id] = playerName; // Store the player name
                socket.join(roomId);
                socket.emit('joinedRoom', { roomId, color, players: room.players, spectators: room.spectators });
                if (room.players.length === 2) {
                    io.to(roomId).emit('gameStart', { 
                        white: room.players.find(p => p.color === 'white')!.name, 
                        black: room.players.find(p => p.color === 'black')!.name 
                    });
                }
            } else {
                room.spectators.push(playerName);
                playerNames[socket.id] = playerName; // Store the player name
                socket.join(roomId);
                socket.emit('joinedAsSpectator', { roomId, players: room.players, spectators: room.spectators });
                io.to(roomId).emit('spectatorJoined', playerName);
            }
            io.emit('roomList', Object.values(rooms));
        } else {
            socket.emit('roomNotFound');
        }
    });

    // ... (other event handlers remain the same)

    socket.on('disconnect', () => {
        console.log('User disconnected');
        const playerName = playerNames[socket.id];
        delete playerNames[socket.id]; // Remove the player name when they disconnect

        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const color = room.players[playerIndex].color;
                room.players.splice(playerIndex, 1);
                io.to(roomId).emit('playerLeft', { color, name: playerName });
                if (room.players.length === 0 && room.spectators.length === 0) {
                    delete rooms[roomId];
                }
            } else {
                const spectatorIndex = room.spectators.indexOf(playerName);
                if (spectatorIndex !== -1) {
                    room.spectators.splice(spectatorIndex, 1);
                    io.to(roomId).emit('spectatorLeft', playerName);
                }
            }
        }
        io.emit('roomList', Object.values(rooms));
    });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});