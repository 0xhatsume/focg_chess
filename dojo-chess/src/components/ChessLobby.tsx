import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { io, Socket } from 'socket.io-client';

const ChessLobby: React.FC = () => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [roomId, setRoomId] = useState<string | null>(null);
    const [game, setGame] = useState(new Chess());
    const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);

    // load socket to connect to server once
    // then various event "subscribers" are added
    useEffect(() => {
        const newSocket = io('http://localhost:3001');
        setSocket(newSocket);

        newSocket.on('roomCreated', (id: string) => {
            // this is assuming u are the only listener
            setRoomId(id);
        });

        newSocket.on('joinedRoom', (id: string) => {
        setRoomId(id);
        });

        newSocket.on('joinedAsSpectator', (id: string) => {
            setRoomId(id);
            // Spectators can't move pieces
            setPlayerColor(null);
        });

        newSocket.on('gameStart', ({ white, black }) => {
        
            if (newSocket.id === white) setPlayerColor('white');
            else if (newSocket.id === black) setPlayerColor('black');
        });

        newSocket.on('move', (move: string) => {
            const gameCopy = new Chess(game.fen());
            gameCopy.move(move);
            setGame(gameCopy);
        });

        return () => {
            newSocket.disconnect();
        };
    }, []);

    const createRoom = () => {
        if (socket) socket.emit('createRoom');
    };

    const joinRoom = (id: string) => {
        if (socket) socket.emit('joinRoom', id);
    };

    const onDrop = (sourceSquare: string, targetSquare: string) => {
        if (!playerColor || (game.turn() === 'w' && playerColor !== 'white') || (game.turn() === 'b' && playerColor !== 'black')) {
        return false;
        }

        const move = game.move({
            from: sourceSquare,
            to: targetSquare,
            promotion: 'q', //auto promote to Queen for simplicity
        });

        if (move === null) return false;

        setGame(new Chess(game.fen()));
        
        if (socket && roomId) {
            socket.emit('move', { roomId, move: move.san });
        }
        return true;
    };

    if (!roomId) {
        return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
            <h1 className="text-3xl mb-4">Chess Game Lobby</h1>
            <button onClick={createRoom} className="bg-blue-500 text-white px-4 py-2 rounded mb-2">Create Room</button>
            <div>
            <input 
                type="text" 
                placeholder="Room ID" 
                className="border p-2 rounded mr-2"
                onChange={(e) => setRoomId(e.target.value)}
            />
            <button onClick={() => joinRoom(roomId!)} className="bg-green-500 text-white px-4 py-2 rounded">Join Room</button>
            </div>
        </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
        <h2 className="text-2xl mb-4">Room: {roomId}</h2>
        <div className="w-96 h-96">
            <Chessboard 
                position={game.fen()} 
                onPieceDrop={onDrop}
                boardOrientation={playerColor || 'white'}
            />
        </div>
        {playerColor ? (
            <p className="mt-4">You are playing as {playerColor}</p>
        ) : (
            <p className="mt-4">You are a spectator</p>
        )}
        </div>
    );
};

export default ChessLobby;