import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { configureRoomHandlers, rooms } from './roomHandlers';
import { configureGameHandlers } from './gameHandlers';
import { sessionStore } from './middleware';

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
        console.log('A user connected', socket.data.sessionID);
        console.log(socket.data);
        console.log("rooms");
        console.log(rooms);

        const session = sessionStore.get(socket.data.sessionID);
        if (session) {
            session.userID = socket.data.userID;
            //session.playerName = socket.data.playerName;
            socket.emit('session', {
                sessionID: socket.data.sessionID,
                userID: socket.data.userID,
                playerName: session.playerName
            });
        } else {
            sessionStore.set(socket.data.sessionID, {
                userID: socket.data.userID,
                playerName: null
            });
            socket.emit('session', {
                sessionID: socket.data.sessionID,
                userID: socket.data.userID,
                playerName: null
            });
        }

        console.log(sessionStore)

        socket.on('getPlayerName', () => {
            console.log("getPlayerName for sessionID: ", socket.data.sessionID);
            const session = sessionStore.get(socket.data.sessionID);
            console.log("session", session);
            console.log("session.playerName", session.playerName);
            if (session && session.playerName) {
                socket.emit('playerNameSet', { socketId: socket.id, name: session.playerName });
                console.log("playerNameSet", { socketId: socket.id, name: session.playerName });
            }
        });

        socket.on('setPlayerName', (name: string) => {
            const session = sessionStore.get(socket.data.sessionID);
            if (session) {
                session.playerName = name;
                sessionStore.set(socket.data.sessionID, session);
            }
            socket.emit('playerNameSet', { socketId: socket.id, name: name }); 
            console.log("playerNameSet", "sessionID", socket.data.sessionID, { socketId: socket.id, name: name });
            console.log('sessionStore');
            console.log(sessionStore);
        });

        socket.on('getSession', () => {
            const session = sessionStore.get(socket.data.sessionID);
            if (session) {
                socket.emit('sessionData', {
                    sessionID: socket.data.sessionID,
                    userID: session.userID,
                    playerName: session.playerName,
                    // Add any other session data you want to include
                });
            } else {
                socket.emit('sessionData', null);
            }
        });
        
        configureRoomHandlers(io, socket, sessionStore);
        configureGameHandlers(io, socket);

        socket.on('disconnect', () => {
            console.log('User disconnected', socket.data.userID);
            // Handle disconnection logic here
        });
    });
}