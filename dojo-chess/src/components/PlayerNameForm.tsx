import React, { useState } from 'react';

interface PlayerNameFormProps {
    onSubmit: (name: string) => void;
}

const PlayerNameForm: React.FC<PlayerNameFormProps> = ({ onSubmit }) => {
    const [name, setName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            onSubmit(name.trim());
        }
    };

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