import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { usePlayerStore } from '../stores/playerStore';
import { useSocketStore } from '../stores/socketStore';

const GameRoom: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState(new Chess());
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [gameStatus, setGameStatus] = useState<'waiting' | 'playing' | 'ended'>('waiting');
  const [drawOffered, setDrawOffered] = useState(false);
  const [players, setPlayers] = useState<{ white: string | null; black: string | null }>({ white: null, black: null });
  const [spectators, setSpectators] = useState<string[]>([]);
  
  const playerName = usePlayerStore(state => state.playerName);
  const socket = useSocketStore(state => state.socket);

  useEffect(() => {
    if (!socket || !roomId) return;

    socket.emit('joinRoom', { roomId, playerName });

    socket.on('joinedRoom', ({ color, players: roomPlayers, spectators: roomSpectators }) => {
      setPlayerColor(color);
      setPlayers(roomPlayers);
      setSpectators(roomSpectators);
      if (Object.values(roomPlayers).filter(Boolean).length === 2) {
        setGameStatus('playing');
      }
    });

    socket.on('gameStart', ({ white, black }) => {
      setPlayers({ white, black });
      setGameStatus('playing');
    });

    socket.on('move', (move: string) => {
      const gameCopy = new Chess(game.fen());
      gameCopy.move(move);
      setGame(gameCopy);
      setMoveHistory(prev => [...prev, move]);
    });

    socket.on('gameOver', ({ reason, winner }) => {
      setGameStatus('ended');
      alert(`Game over. ${reason === 'resignation' ? `${winner} won by resignation.` : reason === 'checkmate' ? `${winner} won by checkmate.` : "It's a draw."}`);
    });

    socket.on('drawOffered', () => setDrawOffered(true));
    socket.on('drawDeclined', () => {
      alert('Draw offer declined.');
      setDrawOffered(false);
    });

    socket.on('playerJoined', ({ color, name }) => {
      setPlayers(prev => ({ ...prev, [color]: name }));
    });

    socket.on('playerLeft', ({ color }) => {
      setPlayers(prev => ({ ...prev, [color]: null }));
      if (gameStatus === 'playing') {
        setGameStatus('ended');
        alert(`${color === 'white' ? 'White' : 'Black'} player left the game.`);
      }
    });

    socket.on('spectatorJoined', (name: string) => {
      setSpectators(prev => [...prev, name]);
    });

    socket.on('spectatorLeft', (name: string) => {
      setSpectators(prev => prev.filter(spec => spec !== name));
    });

    return () => {
      socket.off('joinedRoom');
      socket.off('gameStart');
      socket.off('move');
      socket.off('gameOver');
      socket.off('drawOffered');
      socket.off('drawDeclined');
      socket.off('playerJoined');
      socket.off('playerLeft');
      socket.off('spectatorJoined');
      socket.off('spectatorLeft');
    };
  }, [socket, roomId, playerName, game]);

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (gameStatus !== 'playing' || !playerColor || (game.turn() === 'w' && playerColor !== 'white') || (game.turn() === 'b' && playerColor !== 'black')) {
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

    if (game.isGameOver()) {
      const gameOverReason = game.isCheckmate() ? 'checkmate' : game.isDraw() ? 'draw' : 'stalemate';
      socket?.emit('gameOver', { roomId, reason: gameOverReason, winner: game.turn() === 'w' ? 'black' : 'white' });
    }

    return true;
  };

  const resignGame = () => {
    if (socket && roomId && playerColor) {
      socket.emit('resignGame', { roomId, color: playerColor });
    }
  };

  const offerDraw = () => {
    if (socket && roomId && playerColor) {
      socket.emit('offerDraw', { roomId, color: playerColor });
    }
  };

  const acceptDraw = () => {
    if (socket && roomId && playerColor) {
      socket.emit('acceptDraw', { roomId, color: playerColor });
    }
  };

  const declineDraw = () => {
    if (socket && roomId && playerColor) {
      socket.emit('declineDraw', { roomId, color: playerColor });
      setDrawOffered(false);
    }
  };

  const leaveRoom = () => {
    if (socket && roomId) {
      socket.emit('leaveRoom', roomId);
      navigate('/');
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
        {drawOffered && playerColor && (
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
        <button onClick={leaveRoom} className="mt-4 bg-gray-500 text-white px-4 py-2 rounded">
          Leave Room
        </button>
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
          <div className="mb-1">White: {players.white || 'Waiting...'}</div>
          <div className="mb-1">Black: {players.black || 'Waiting...'}</div>
        </div>
        <h3 className="text-xl mt-4 mb-2">Spectators</h3>
        <div className="bg-white p-4 rounded shadow">
          {spectators.length > 0 ? (
            spectators.map((spectator, index) => (
              <div key={index} className="mb-1">{spectator}</div>
            ))
          ) : (
            <div>No spectators</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameRoom;