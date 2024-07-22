import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

// Game Room Model
interface GameRoom {
    id: string;
    players: string[];
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

io.on('connection', (socket: Socket) => {
    console.log('A user connected');

    // create new room
    socket.on('createRoom', () => {
        const roomId = uuidv4();
        rooms[roomId] = { id: roomId, players: [], spectators: [] };
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
    });

    // join room
    // start game if there are 2 players
    socket.on('joinRoom', (roomId: string) => {
        const room = rooms[roomId];
        if (room) {

            // Start Room if there are 2 players
            if (room.players.length < 2) {
                room.players.push(socket.id); // player tracked by socket id
                socket.join(roomId);
                socket.emit('joinedRoom', roomId);

                if (room.players.length === 2) {
                    io.to(roomId).emit('gameStart', 
                        { white: room.players[0], black: room.players[1] }
                    );
                }

            } else {
                room.spectators.push(socket.id);
                socket.join(roomId);
                socket.emit('joinedAsSpectator', roomId);
            }
        } else {
            socket.emit('roomNotFound');
        }
    });

    socket.on('move', ({ roomId, move }) => {
        socket.to(roomId).emit('move', move);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        
        // looping through rooms to find room Id
        for (const roomId in rooms) {
            
            const room = rooms[roomId];
            const playerIndex = room.players.indexOf(socket.id);
            
            if (playerIndex !== -1) {

                room.players.splice(playerIndex, 1);
                io.to(roomId).emit('playerLeft', socket.id);

                if (room.players.length === 0 && room.spectators.length === 0) 
                {
                    delete rooms[roomId];
                }

            } else {

                const spectatorIndex = room.spectators.indexOf(socket.id);
                
                if (spectatorIndex !== -1) {
                    room.spectators.splice(spectatorIndex, 1);
                }

            }
        }
    });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});