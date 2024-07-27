import { Server, Socket } from 'socket.io';
import { sessionStore } from './middleware';

const playerNames: Record<string, string> = {};

export function configureConnectionHandlers(io: Server, socket: Socket) {
    sessionStore.set(socket.data.sessionID, {
        userID: socket.data.userID,
    });

    socket.emit('session', {
        sessionID: socket.data.sessionID,
        userID: socket.data.userID,
    });

    socket.on('getPlayerName', () => {
        const storedName = playerNames[socket.data.userID];
        if (storedName) {
            socket.emit('playerNameSet', { socketId: socket.id, name: storedName });
        }
    });

    socket.on('setPlayerName', (name: string) => {
        playerNames[socket.data.userID] = name;
        socket.emit('playerNameSet', { socketId: socket.id, name: name });
    });
}

export { playerNames };