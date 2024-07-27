import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

const sessionStore = new Map();

export function configureMiddleware(io: Server) {
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
}

export { sessionStore };