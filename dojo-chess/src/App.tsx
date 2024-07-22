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

const App: React.FC = () => {
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        const newSocket = io('http://localhost:3001');
        setSocket(newSocket);
    
        return () => {
            newSocket.disconnect();
        };
    }, []);

    return (
        <Router>
            <Routes>
            <Route path="/" element={<ChessLobby />} />
            <Route path="/room/:roomId" element={<GameRoom socket={socket} />} />
            </Routes>
        </Router>
    );
};

export default App;
