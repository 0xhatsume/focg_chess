import React, { useState, useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useSocketStore } from '../stores/socketStore';

interface PlayerNameFormProps {
  onSubmit: () => void;
}

const PlayerNameForm: React.FC<PlayerNameFormProps> = ({ onSubmit }) => {
    const [name, setName] = useState('');
    const setPlayerName = usePlayerStore(state => state.setPlayerName);
    const playerName = usePlayerStore(state => state.playerName);
    const socket = useSocketStore(state => state.socket);

    useEffect(() => {
        if (socket) {
            socket.on('nameRestored', (restoredName: string) => {
                setPlayerName(restoredName);
                onSubmit();
            });

            return () => {
                socket.off('nameRestored');
            };
        }
    }, [socket, setPlayerName, onSubmit]);

    useEffect(() => {
        if (playerName) {
            onSubmit();
        }
    }, [playerName, onSubmit]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim() && socket) {
            setPlayerName(name.trim());
            socket.emit('setPlayerName', name.trim());
            onSubmit();
        }
    };

    if (playerName) {
        return null; // Don't render the form if we already have a player name
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
            <h1 className="text-3xl mb-4">Enter Your Name</h1>
            <form onSubmit={handleSubmit} className="flex flex-col items-center">
                <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your Name" 
                    className="border p-2 rounded mr-2 mb-2"
                />
                <button 
                    type="submit" 
                    className="bg-blue-500 text-white px-4 py-2 rounded"
                    disabled={!name.trim()}
                >
                    Enter Lobby
                </button>
            </form>
        </div>
    );
};

export default PlayerNameForm;