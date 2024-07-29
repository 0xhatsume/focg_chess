import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../stores/playerStore';
import { useSocketStore } from '../stores/socketStore';
import Modal from './Modal';

interface Room {
  id: string;
  name: string;
  players: { id: string; name: string; color: 'white' | 'black' }[];
}

interface Invitation {
  from: string;
  roomId: string;
}


const ChessLobby: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [myRooms, setMyRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [invitePlayerName, setInvitePlayerName] = useState('');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
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

    const handleInvitation = ({ from, roomId }: { from: string, roomId: string }) => {
      setInvitation({ from, roomId });
      // if (window.confirm(`${from} has invited you to play chess. Do you accept?`)) {
      //   socket.emit('acceptInvitation', { roomId });
      //   navigate(`/room/${roomId}`);
      // } else {
      //   socket.emit('declineInvitation', { from });
      // }
    };

    const handleInviteAccepted = ({ roomId }: { roomId: string }) => {
      navigate(`/room/${roomId}`);
    };

    const handleReconnect = () => {
      console.log('Reconnected, fetching room list');
      socket.emit('getRoomList');
    };

    socket.on('connect', handleReconnect);
    socket.on('roomListUpdate', handleRoomListUpdate);
    socket.on('roomCreated', handleRoomCreated);
    socket.on('invitation', handleInvitation);
    socket.on('inviteAccepted', handleInviteAccepted);

    socket.on('invitationSent', ({ message, roomId, roomName }) => {
      console.log(message);
      console.log(`You are now in room: ${roomName} (ID: ${roomId})`);
      // You can update the UI here, perhaps navigating to the room
      // or showing a notification
    });

    // Request initial room list
    socket.emit('getRoomList');

    return () => {
      socket.off('connect', handleReconnect);
      socket.off('roomListUpdate', handleRoomListUpdate);
      socket.off('roomCreated', handleRoomCreated);
      socket.off('invitation', handleInvitation);
      socket.off('inviteAccepted', handleInviteAccepted);
      socket.off('invitationSent');
    };
  }, [socket, navigate, connect, rooms]);

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

  const invitePlayer = () => {
    if (socket && playerName && invitePlayerName) {
      socket.emit('invitePlayer', { invitee: invitePlayerName });
      setIsInviteModalOpen(false);
      setInvitePlayerName('');
    }
  };
  
  const handleAcceptInvitation = () => {
    if (socket && invitation) {
      socket.emit('acceptInvitation', { roomId: invitation.roomId });
      navigate(`/room/${invitation.roomId}`);
    }
    setInvitation(null);
  };

  const handleDeclineInvitation = () => {
    if (socket && invitation) {
      socket.emit('declineInvitation', { from: invitation.from });
    }
    setInvitation(null);
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
        <button 
          onClick={() => setIsInviteModalOpen(true)} 
          className="bg-green-500 text-white px-4 py-2 rounded"
        >
          Invite Player
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
              >
                Join
              </button>
            </div>
          ))
        ) : (
          <p>No rooms available. Create a new room to start playing!</p>
        )}
      </div>
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite Player"
      >
        <input 
          type="text" 
          value={invitePlayerName}
          onChange={(e) => setInvitePlayerName(e.target.value)}
          placeholder="Player Name" 
          className="border p-2 rounded w-full mb-4"
        />
        <button 
          onClick={invitePlayer} 
          className="bg-blue-500 text-white px-4 py-2 rounded w-full"
          disabled={!invitePlayerName.trim()}
        >
          Send Invitation
        </button>
      </Modal>

      <Modal
        isOpen={invitation !== null}
        onClose={handleDeclineInvitation}
        title="Game Invitation"
      >
        <p className="mb-4">{invitation?.from} has invited you to play chess. Do you accept?</p>
        <div className="flex justify-end">
          <button 
            onClick={handleDeclineInvitation} 
            className="bg-red-500 text-white px-4 py-2 rounded mr-2"
          >
            Decline
          </button>
          <button 
            onClick={handleAcceptInvitation} 
            className="bg-green-500 text-white px-4 py-2 rounded"
          >
            Accept
          </button>
        </div>
      </Modal>

    </div>
  );
};

export default ChessLobby;