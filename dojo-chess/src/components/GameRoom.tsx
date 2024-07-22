import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Socket } from 'socket.io-client';

interface GameRoomProps {
  socket: Socket | null;
}

const GameRoom: React.FC<GameRoomProps> = ({ socket }) => {
  const { roomId } = useParams<{ roomId: string }>();
  const [game, setGame] = useState(new Chess());
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [gameStatus, setGameStatus] = useState<'playing' | 'ended'>('playing');
  const [drawOffered, setDrawOffered] = useState(false);
  const [players, setPlayers] = useState<string[]>([]);

  useEffect(() => {
    if (!socket) return;

    socket.emit('joinRoom', { roomId });

    socket.on('gameStart', ({ white, black }) => {
      if (socket.id === white) setPlayerColor('white');
      else if (socket.id === black) setPlayerColor('black');
    });

    socket.on('move', (move: string) => {
      const gameCopy = new Chess(game.fen());
      gameCopy.move(move);
      setGame(gameCopy);
      setMoveHistory(prev => [...prev, move]);
    });

    socket.on('gameOver', ({ reason, winner }) => {
      setGameStatus('ended');
      alert(`Game over. ${reason === 'resignation' ? `${winner} won by resignation.` : "It's a draw."}`);
    });

    socket.on('drawOffered', () => setDrawOffered(true));
    socket.on('drawDeclined', () => {
      alert('Draw offer declined.');
      setDrawOffered(false);
    });

    socket.on('playerJoined', (playerName: string) => {
      setPlayers(prev => [...prev, playerName]);
    });

    socket.on('playerLeft', (playerName: string) => {
      setPlayers(prev => prev.filter(name => name !== playerName));
    });

    return () => {
      socket.off('gameStart');
      socket.off('move');
      socket.off('gameOver');
      socket.off('drawOffered');
      socket.off('drawDeclined');
      socket.off('playerJoined');
      socket.off('playerLeft');
    };
  }, [socket, roomId]);

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (!playerColor || (game.turn() === 'w' && playerColor !== 'white') || (game.turn() === 'b' && playerColor !== 'black')) {
      return false;
    }

    const move = game.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    });

    if (move === null) return false;

    setGame(new Chess(game.fen()));
    setMoveHistory(prev => [...prev, move.san]);
    if (socket && roomId) {
      socket.emit('move', { roomId, move: move.san });
    }
    return true;
  };

  const resignGame = () => {
    if (socket && roomId) {
      socket.emit('resignGame', roomId);
    }
  };

  const offerDraw = () => {
    if (socket && roomId) {
      socket.emit('offerDraw', roomId);
    }
  };

  const acceptDraw = () => {
    if (socket && roomId) {
      socket.emit('acceptDraw', roomId);
    }
  };

  const declineDraw = () => {
    if (socket && roomId) {
      socket.emit('declineDraw', roomId);
      setDrawOffered(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="md:mr-8">
        <h2 className="text-2xl mb-4">Room: {roomId}</h2>
        <div className="w-80 h-80 md:w-96 md:h-96">
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
        {gameStatus === 'playing' && playerColor && (
          <div className="mt-4">
            <button onClick={resignGame} className="bg-red-500 text-white px-4 py-2 rounded mr-2">
              Resign
            </button>
            <button onClick={offerDraw} className="bg-yellow-500 text-white px-4 py-2 rounded">
              Offer Draw
            </button>
          </div>
        )}
        {drawOffered && (
          <div className="mt-4">
            <p>Draw offered</p>
            <button onClick={acceptDraw} className="bg-green-500 text-white px-4 py-2 rounded mr-2">
              Accept
            </button>
            <button onClick={declineDraw} className="bg-red-500 text-white px-4 py-2 rounded">
              Decline
            </button>
          </div>
        )}
      </div>
      <div className="mt-4 md:mt-0">
        <h3 className="text-xl mb-2">Move History</h3>
        <div className="bg-white p-4 rounded shadow max-h-80 overflow-y-auto">
          {moveHistory.map((move, index) => (
            <div key={index} className="mb-1">
              {index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ''}{move}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 md:mt-0 md:ml-8">
        <h3 className="text-xl mb-2">Players</h3>
        <div className="bg-white p-4 rounded shadow">
          {players.map((player, index) => (
            <div key={index} className="mb-1">
              {index === 0 ? 'White: ' : 'Black: '}{player}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GameRoom;