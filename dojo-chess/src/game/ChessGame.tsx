import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { io, Socket } from 'socket.io-client';

const ChessGame: React.FC = () => {
    const [game, setGame] = useState(new Chess());
    const [socket, setSocket] = useState<Socket | null>(null);

    // load socket to connect to server once
    useEffect(() => {
        const newSocket = io('http://localhost:3001');
        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, []);

    // listener for move events
    useEffect(() => {
        if (!socket) return;

        // change game state with a copy of the game
        socket.on('move', (move: string) => {
            const gameCopy = new Chess(game.fen());
            gameCopy.move(move);
            setGame(gameCopy);
        });

        return () => {
            socket.off('move');
        };
    }, [socket, game]);


    const onDrop = (sourceSquare: string, targetSquare: string) => {
        
        //make move by continuing on previous game state
        const move = game.move({
            from: sourceSquare,
            to: targetSquare,
            promotion: 'q', //auto promote queen
        });

        // if the move is not valid, return false
        if (move === null) return false;

        // get the resultant game state and produce a new game state object
        setGame(new Chess(game.fen()));

        // emit move event
        if (socket) {
            socket.emit('move', move);
        }
        return true;
    };

    return (
        <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="w-96 h-96">
            <Chessboard position={game.fen()} onPieceDrop={onDrop} />
        </div>
        </div>
    );
};

export default ChessGame;