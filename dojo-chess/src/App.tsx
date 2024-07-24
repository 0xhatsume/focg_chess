// import { useComponentValue } from "@dojoengine/react";
// import { Entity } from "@dojoengine/recs";
import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
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
    const [isNameSet, setIsNameSet] = useState(false);
    const playerName = usePlayerStore(state => state.playerName);
    const { socket, connect, disconnect } = useSocketStore();

    useEffect(() => {
        connect();
        return () => {
            disconnect();
        };
    }, [connect, disconnect]);

    useEffect(() => {
        if (playerName) {
            setIsNameSet(true);
        }
    }, [playerName]);

    if (!isNameSet) {
        return <PlayerNameForm onSubmit={() => setIsNameSet(true)} />;
    }

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
