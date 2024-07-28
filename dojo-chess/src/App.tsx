// import { useComponentValue } from "@dojoengine/react";
// import { Entity } from "@dojoengine/recs";
import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
//import ChessGame from "./game/ChessGame";
import ChessLobby from "./components/ChessLobby";
import GameRoom from './components/GameRoom';
// import { Direction } from "./utils";
// import { getEntityIdFromKeys } from "@dojoengine/utils";
// import { useDojo } from "./dojo/useDojo";
import PlayerNameForm from './components/PlayerNameForm';
import { usePlayerStore } from './stores/playerStore';
import { useSocketStore } from './stores/socketStore';


const App: React.FC = () => {
    const [isLoading, setIsLoading] = useState(false);
    const { playerName, setPlayerName } = usePlayerStore();
    const { socket, connect, disconnect } = useSocketStore();

    useEffect(() => {
        connect();
        return () => {
            disconnect();
        };
    }, [connect, disconnect]);

    useEffect(() => {
        if (!socket) return;

        const handlePlayerNameSet = ({ socketId, name }: { socketId: string, name: string | null }) => {
            console.log("player name retrieved.")
            if (socketId === socket.id) {
                setPlayerName(name);
                setIsLoading(false);
            }
        };

        const handleConnect = () => {
            // When (re)connected, fetch the player name
            socket.emit('getPlayerName');
        };

        socket.on('connect', handleConnect);
        socket.on('playerNameSet', handlePlayerNameSet);

        // Initial connection
        if (socket.connected) {
            handleConnect();
        }

        return () => {
            socket.off('connect', handleConnect);
            socket.off('playerNameSet', handlePlayerNameSet);
        };
    }, [socket, setPlayerName, playerName]);

    const handleNameSubmit = (name: string) => {
        setIsLoading(true);
        socket?.emit('setPlayerName', name);
    };

    if (!socket) {
        return <div>Connecting to server...</div>;
    }

    if (!playerName) {
        return <PlayerNameForm onSubmit={handleNameSubmit} />;
    }

    // if (isLoading) {
    //     return <div>Loading game lobby...</div>;
    // }

    return (
        <Router>
            <Routes>
                <Route path="/" element={<ChessLobby />} />
                <Route path="/room/:roomId" element={<GameRoom />} />
            </Routes>
        </Router>
    );
};

export default App;
