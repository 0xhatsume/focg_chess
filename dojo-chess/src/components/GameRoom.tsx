import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { usePlayerStore } from '../stores/playerStore';
import { useSocketStore } from '../stores/socketStore';

interface Player {
  id: string;
  name: string;
  color: 'white' | 'black';
}

interface GameResult {
  winner: 'white' | 'black' | 'draw';
  reason: 'checkmate' | 'stalemate' | 'insufficient material' | 'threefold repetition' | 'draw' | 'resignation' | 'timeout';
}

const GameRoom: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState(new Chess());
  const [playerRole, setPlayerRole] = useState<'white' | 'black' | 'spectator'>('spectator');
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [gameStatus, setGameStatus] = useState<'waiting' | 'playing' | 'ended'>('waiting');
  const [drawOffered, setDrawOffered] = useState<'white' | 'black' | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [canSwitchSides, setCanSwitchSides] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  
  const playerName = usePlayerStore(state => state.playerName);
  const socket = useSocketStore(state => state.socket);

  useEffect(() => {
    if (!socket || !roomId) return;

    socket.emit('joinRoom', { roomId, playerName });

    socket.on('joinedRoom', ({ color, players: roomPlayers }) => {
      setPlayers(roomPlayers);
      const playerInGame = roomPlayers.find(p => p.name === playerName);
      setPlayerRole(playerInGame ? playerInGame.color : 'spectator');
      setCanSwitchSides(roomPlayers.length === 2 && moveHistory.length === 0);
      if (roomPlayers.length === 2) {
        setGameStatus('playing');
      }
    });

    socket.on('gameStart', ({ white, black }) => {
      setPlayers([
        { id: '1', name: white, color: 'white' },
        { id: '2', name: black, color: 'black' }
      ]);
      setGameStatus('playing');
    });

    socket.on('move', (move: string) => {
      const gameCopy = new Chess(game.fen());
      gameCopy.move(move);
      setGame(gameCopy);
      setMoveHistory(prev => [...prev, move]);
      setCanSwitchSides(false);
      setDrawOffered(null);  // Reset draw offer after a move

      if (gameCopy.isGameOver()) {
        let result: GameResult;
        if (gameCopy.isCheckmate()) {
          result = {
            winner: gameCopy.turn() === 'w' ? 'black' : 'white',
            reason: 'checkmate'
          };
        } else if (gameCopy.isStalemate()) {
          result = { winner: 'draw', reason: 'stalemate' };
        } else if (gameCopy.isInsufficientMaterial()) {
          result = { winner: 'draw', reason: 'insufficient material' };
        } else if (gameCopy.isThreefoldRepetition()) {
          result = { winner: 'draw', reason: 'threefold repetition' };
        } else {
          result = { winner: 'draw', reason: 'draw' };
        }
        setGameResult(result);
        setGameStatus('ended');
      }
    });

    socket.on('drawOffered', (color: 'white' | 'black') => {
      setDrawOffered(color);
    });

    socket.on('drawDeclined', () => {
      setDrawOffered(null);
    });

    socket.on('gameOver', (result: GameResult) => {
      setGameResult(result);
      setGameStatus('ended');
    });

    socket.on('sidesSwitched', (updatedPlayers: Player[]) => {
      setPlayers(updatedPlayers);
      const playerInGame = updatedPlayers.find(p => p.name === playerName);
      setPlayerRole(playerInGame ? playerInGame.color : 'spectator');
    });

    // ... (other event listeners remain the same)

    return () => {
      socket.off('joinedRoom');
      socket.off('gameStart');
      socket.off('move');
      socket.off('drawOffered');
      socket.off('drawDeclined');
      socket.off('gameOver');
      socket.off('sidesSwitched');
      // ... (other event listeners off)
    };
  }, [socket, roomId, playerName, game]);

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (gameStatus !== 'playing' || playerRole === 'spectator' || (game.turn() === 'w' && playerRole !== 'white') || (game.turn() === 'b' && playerRole !== 'black')) {
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
    setCanSwitchSides(false);
    setDrawOffered(null);  // Reset draw offer after a move
    if (socket && roomId) {
      socket.emit('move', { roomId, move: move.san });
    }

    if (game.isGameOver()) {
      let result: GameResult;
      if (game.isCheckmate()) {
        result = {
          winner: game.turn() === 'w' ? 'black' : 'white',
          reason: 'checkmate'
        };
      } else if (game.isStalemate()) {
        result = { winner: 'draw', reason: 'stalemate' };
      } else if (game.isInsufficientMaterial()) {
        result = { winner: 'draw', reason: 'insufficient material' };
      } else if (game.isThreefoldRepetition()) {
        result = { winner: 'draw', reason: 'threefold repetition' };
      } else {
        result = { winner: 'draw', reason: 'draw' };
      }
      socket?.emit('gameOver', { roomId, result });
      setGameResult(result);
      setGameStatus('ended');
    }

    return true;
  };

  const switchSides = () => {
    if (socket && roomId && canSwitchSides) {
      socket.emit('switchSides', roomId);
    }
  };

  const resignGame = () => {
    if (socket && roomId && playerRole !== 'spectator') {
      const result: GameResult = {
        winner: playerRole === 'white' ? 'black' : 'white',
        reason: 'resignation'
      };
      socket.emit('gameOver', { roomId, result });
      setGameResult(result);
      setGameStatus('ended');
    }
  };

  const offerDraw = () => {
    if (socket && roomId && playerRole !== 'spectator') {
      socket.emit('offerDraw', { roomId, color: playerRole });
      setDrawOffered(playerRole);
    }
  };

  const acceptDraw = () => {
    if (socket && roomId && playerRole !== 'spectator') {
      const result: GameResult = { winner: 'draw', reason: 'draw' };
      socket.emit('acceptDraw', { roomId });
      setGameResult(result);
      setGameStatus('ended');
    }
  };

  const declineDraw = () => {
    if (socket && roomId && playerRole !== 'spectator') {
      socket.emit('declineDraw', { roomId });
      setDrawOffered(null);
    }
  };

  const leaveRoom = () => {
    if (socket && roomId) {
      socket.emit('leaveRoom', roomId);
      navigate('/');
    }
  };

  const renderGameResult = () => {
    if (!gameResult) return null;

    let resultMessage = '';
    if (gameResult.winner === 'draw') {
      resultMessage = `Game ended in a draw due to ${gameResult.reason}.`;
    } else {
      const winnerName = players.find(p => p.color === gameResult.winner)?.name;
      resultMessage = `${winnerName} (${gameResult.winner}) wins by ${gameResult.reason}!`;
    }

    return (
      <div className="mt-4 p-4 bg-blue-100 text-blue-800 rounded-lg">
        <h3 className="text-xl font-bold mb-2">Game Over</h3>
        <p>{resultMessage}</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="md:mr-8">
        <h2 className="text-2xl mb-4">Room: {roomId}</h2>
        <div className="w-80 h-80 md:w-96 md:h-96">
          <Chessboard 
            position={game.fen()} 
            onPieceDrop={onDrop}
            boardOrientation={playerRole === 'black' ? 'black' : 'white'}
          />
        </div>
        <p className="mt-4">
          {playerRole === 'spectator' 
            ? "You are a spectator" 
            : `You are playing as ${playerRole}`}
        </p>
        {canSwitchSides && playerRole !== 'spectator' && (
          <button 
            onClick={switchSides} 
            className="mt-4 bg-blue-500 text-white px-4 py-2 rounded mr-2"
          >
            Switch Sides
          </button>
        )}
        {gameStatus === 'playing' && playerRole !== 'spectator' && (
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
          <div className="mt-4 p-2 bg-yellow-100 text-yellow-800 rounded">
            {drawOffered === playerRole 
              ? "You offered a draw. Waiting for opponent's response." 
              : (
                <>
                  <p>Your opponent offered a draw.</p>
                  <button onClick={acceptDraw} className="bg-green-500 text-white px-4 py-2 rounded mr-2">
                    Accept
                  </button>
                  <button onClick={declineDraw} className="bg-red-500 text-white px-4 py-2 rounded">
                    Decline
                  </button>
                </>
              )
            }
          </div>
        )}
        <button onClick={leaveRoom} className="mt-4 bg-gray-500 text-white px-4 py-2 rounded">
          Leave Room
        </button>
        {renderGameResult()}
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
              {player.color === 'white' ? 'White' : 'Black'}: {player.name}
            </div>
          ))}
          {players.length < 2 && (
            <div className="mb-1">Waiting for opponent...</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameRoom;