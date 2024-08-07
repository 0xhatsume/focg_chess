import { Server, Socket } from 'socket.io';
import { GameResult } from '../types';
import { rooms } from './roomHandlers';
import { Chess } from 'chess.js';

export function configureGameHandlers(io: Server, socket: Socket) {
    socket.on('move', ({ roomId, move }) => {
        console.log("MOVINGGGGG!!! ", move)
        const room = rooms[roomId];
        if (room && room.gameStarted) { // only if game started
            const chess = new Chess(room.gameFen);
            
            try {
                const result = chess.move(move);
                if (result) {
                    room.moveHistory.push(move);
                    room.gameFen = chess.fen();

                    const gameState = {
                        roomId: roomId,
                        fen: room.gameFen,
                        history: room.moveHistory,
                        status: room.gameStatus,
                        white: room.players.find(p => p.color === 'white')!.name, 
                        black: room.players.find(p => p.color === 'black')!.name, 
                        lastMove: move
                    };

                    io.to(roomId).emit('gameState', gameState);

                    // Check for game over conditions
                    if (chess.isGameOver()) {
                        let gameResult: GameResult;
                        if (chess.isCheckmate()) {
                            gameResult = {
                                winner: chess.turn() === 'w' ? 'black' : 'white',
                                reason: 'checkmate'
                            };
                        } else if (chess.isStalemate()) {
                            gameResult = { winner: 'draw', reason: 'stalemate' };
                        } else if (chess.isInsufficientMaterial()) {
                            gameResult = { winner: 'draw', reason: 'insufficient material' };
                        } else if (chess.isThreefoldRepetition()) {
                            gameResult = { winner: 'draw', reason: 'threefold repetition' };
                        } else {
                            gameResult = { winner: 'draw', reason: 'draw' };
                        }
                        room.gameStatus = 'ended';
                        io.to(roomId).emit('gameOver', gameResult);
                    }
                }
            } catch (error) {
                console.error('Invalid move:', move);
                socket.emit('invalidMove', { error: 'Invalid move' });
            }
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

    socket.on('resign', ({ roomId, result }: { roomId: string, result: GameResult }) => {
        const room = rooms[roomId];
        if (room) {
            room.gameStatus = 'ended';
            io.to(roomId).emit('gameOver', result);
        }
    });

    socket.on('getGameState', (roomId: string) => {
        const room = rooms[roomId];
        if (room) {
            io.to(roomId).emit('gameState', {
                ...room,
                fen: room.gameFen,
                history: room.moveHistory,
                status: room.gameStatus,
            });

            console.log("getGameState:")
            console.log({
                ...room,
                fen: room.gameFen,
                history: room.moveHistory,
                status: room.gameStatus,
            })
        }
    });
}