import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { configureRoomHandlers, rooms } from './roomHandlers';
import { configureGameHandlers } from './gameHandlers';

const sessionStore = new Map();
const playerNames: Record<string, string> = {};

export function configureSocket(io: Server) {
    io.use((socket: Socket, next) => {
        const sessionID = socket.handshake.auth.sessionID;
        if (sessionID) {
            const session = sessionStore.get(sessionID);
            if (session) {
                socket.data.sessionID = sessionID;
                socket.data.userID = session.userID;
                return next();
            }
        }
        const userID = uuidv4();
        const newSessionID = uuidv4();
        socket.data.sessionID = newSessionID;
        socket.data.userID = userID;
        next();
    });

    io.on('connection', (socket: Socket) => {
        console.log('A user connected', socket.data.userID);
        console.log(socket.data);
        console.log(playerNames);
        console.log("rooms");
        console.log(rooms);

        sessionStore.set(socket.data.sessionID, {
            userID: socket.data.userID,
        });

        socket.emit('session', {
            sessionID: socket.data.sessionID,
            userID: socket.data.userID,
        });

        socket.on('getPlayerName', () => {
            console.log("getPlayerName for userID: ", socket.data.userID);
            const storedName = playerNames[socket.data.userID];
            if (storedName) {
                socket.emit('playerNameSet', { socketId: socket.id, name: storedName });
            }
        });

        socket.on('setPlayerName', (name: string) => {
            playerNames[socket.data.userID] = name;
            socket.emit('playerNameSet', { socketId: socket.id, name: name });
            console.log(playerNames);  
        });

        configureRoomHandlers(io, socket, playerNames);
        configureGameHandlers(io, socket);

        socket.on('disconnect', () => {
            console.log('User disconnected', socket.data.userID);
            // Handle disconnection logic here
        });
    });
}

export { playerNames };