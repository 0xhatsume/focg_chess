import { Server, Socket } from 'socket.io';

export function configureChatHandlers(io: Server, socket: Socket) {
    socket.on('sendMessage', ({ roomId, message }) => {
        io.to(roomId).emit('newMessage', {
            userId: socket.data.userID,
            message
        });
    });

    // Add other chat-related handlers
}