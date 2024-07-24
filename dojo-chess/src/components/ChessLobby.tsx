import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../stores/playerStore';
import { useSocketStore } from '../stores/socketStore';

interface Player {
  id: string;
  name: string;
  color: 'white' | 'black' | null;
}

interface Room {
  id: string;
  name: string;
  players: Player[];
  spectators: string[];
}

const ChessLobby: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const playerName = usePlayerStore(state => state.playerName);
  const socket = useSocketStore(state => state.socket);

  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => {
      setIsLoading(false);
    });

    socket.on('connect_error', (err) => {
      setIsLoading(false);
      setError('Failed to connect to the server. Please try again later.');
    });

    socket.on('roomListUpdate', (roomList: Room[]) => {
      setRooms(roomList);
      setIsLoading(false);
    });

    socket.on('roomCreated', (roomId: string) => {
      navigate(`/room/${roomId}`);
    });

    // Request initial room list
    socket.emit('getRoomList');

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('roomListUpdate');
      socket.off('roomCreated');
    };
  }, [socket, navigate]);

  const createRoom = () => {
    if (socket && newRoomName && playerName) {
      socket.emit('createRoom', { roomName: newRoomName, playerName });
    }
  };

  const joinRoom = (roomId: string) => {
    if (socket && playerName) {
      console.log('Joining room', roomId);
      socket.emit('joinRoom', { roomId, playerName });
      navigate(`/room/${roomId}`);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <h1 className="text-3xl mb-4">Chess Game Lobby</h1>
      <p className="mb-4">Welcome, {playerName}!</p>
      <div className="mb-4">
        <input 
          type="text" 
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          placeholder="New Room Name" 
          className="border p-2 rounded mr-2"
        />
        <button 
          onClick={createRoom} 
          className="bg-blue-500 text-white px-4 py-2 rounded"
          disabled={!newRoomName.trim()}
        >
          Create Room
        </button>
      </div>
      <div className="w-full max-w-md">
        <h2 className="text-xl mb-2">Available Rooms:</h2>
        {rooms.length > 0 ? (
          rooms.map((room) => (
            <div key={room.id} className="bg-white p-2 mb-2 rounded shadow">
              <span>{room.name} ({room.players.length}/2 players)</span>
              <span className="ml-2 text-sm text-gray-600">
                Created by: {room.players[0]?.name} (
                {room.players[0]?.color === 'white' ? 'White' : 'Black'})
              </span>
              <button 
                onClick={() => joinRoom(room.id)} 
                className="bg-green-500 text-white px-2 py-1 rounded ml-2"
                disabled={room.players.length >= 2}
              >
                Join
              </button>
            </div>
          ))
        ) : (
          <p>No rooms available. Create a new room to start playing!</p>
        )}
      </div>
    </div>
  );
};

export default ChessLobby;