import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../stores/playerStore';
import { useSocketStore } from '../stores/socketStore';

interface Room {
  id: string;
  name: string;
  players: { id: string; name: string; color: 'white' | 'black' }[];
}

const ChessLobby: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [myRooms, setMyRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const playerName = usePlayerStore(state => state.playerName);
  const { socket, connect } = useSocketStore();

  useEffect(() => {
    if (!socket) {
      connect();
      return;
    }

    const handleRoomListUpdate = (roomList: Room[]) => {
      setRooms(roomList);
      setMyRooms(roomList.filter(room => 
        room.players.some(player => player.id === socket.id)
      ));
      setIsLoading(false);
    };

    const handleRoomCreated = ({ roomId }: { roomId: string }) => {
      navigate(`/room/${roomId}`);
    };

    const handleReconnect = () => {
      console.log('Reconnected, fetching room list');
      socket.emit('getRoomList');
    };

    socket.on('connect', handleReconnect);
    socket.on('roomListUpdate', handleRoomListUpdate);
    socket.on('roomCreated', handleRoomCreated);

    // Request initial room list
    socket.emit('getRoomList');

    // Set up interval to periodically request room list updates
    const interval = setInterval(() => {
      socket.emit('getRoomList');
    }, 5000); // Update every 5 seconds

    return () => {
      socket.off('connect', handleReconnect);
      socket.off('roomListUpdate', handleRoomListUpdate);
      socket.off('roomCreated', handleRoomCreated);
      clearInterval(interval);
    };
  }, [socket, navigate, connect]);

  const createRoom = () => {
    if (socket && newRoomName && playerName) {
      socket.emit('createRoom', { roomName: newRoomName, playerName });
    }
  };

  const joinRoom = (roomId: string) => {
    if (socket && playerName) {
      socket.emit('joinRoom', { roomId, playerName });
      navigate(`/room/${roomId}`);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen">Loading lobby...</div>;
  }

  if (error) {
    return <div className="flex justify-center items-center h-screen text-red-500">{error}</div>;
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
      {myRooms.length > 0 && (
        <div className="w-full max-w-md mb-4">
          <h2 className="text-xl mb-2">Your Active Rooms:</h2>
          {myRooms.map((room) => (
            <div key={room.id} className="bg-white p-2 mb-2 rounded shadow">
              <span>{room.name} ({room.players.length}/2 players)</span>
              <button 
                onClick={() => joinRoom(room.id)} 
                className="bg-yellow-500 text-white px-2 py-1 rounded ml-2"
              >
                Rejoin
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="w-full max-w-md">
        <h2 className="text-xl mb-2">Available Rooms:</h2>
        {rooms.length > 0 ? (
          rooms.map((room) => (
            <div key={room.id} className="bg-white p-2 mb-2 rounded shadow">
              <span>{room.name} ({room.players.length}/2 players)</span>
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