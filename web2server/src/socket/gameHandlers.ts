import { Server, Socket } from 'socket.io';
import { GameResult } from '../types';
import { rooms } from './roomHandlers';

export function configureGameHandlers(io: Server, socket: Socket) {
    socket.on('move', ({ roomId, move }) => {
        const room = rooms[roomId];
        if (room) {
            room.gameStarted = true;
            room.moveHistory.push(move);
            // Update FEN here based on the move
            // room.gameFen = ...
            io.to(roomId).emit('move', move);
        }
    });

    socket.on('offerDraw', ({ roomId, color }) => {
        io.to(roomId).emit('drawOffered', color);
    });

    socket.on('acceptDraw', ({ roomId }) => {
        const room = rooms[roomId];
        if (room) {
            room.gameStatus = 'ended';
            const result: GameResult = { winner: 'draw', reason: 'draw' };
            io.to(roomId).emit('gameOver', result);
        }
    });

    socket.on('declineDraw', ({ roomId }) => {
        socket.to(roomId).emit('drawDeclined');
    });

    socket.on('gameOver', ({ roomId, result }: { roomId: string, result: GameResult }) => {
        const room = rooms[roomId];
        if (room) {
            room.gameStatus = 'ended';
            io.to(roomId).emit('gameOver', result);
        }
    });

    socket.on('getGameState', (roomId: string) => {
        const room = rooms[roomId];
        if (room) {
            socket.emit('gameState', {
                fen: room.gameFen,
                history: room.moveHistory,
                status: room.gameStatus,
            });
        }
    });
}