// import { useComponentValue } from "@dojoengine/react";
// import { Entity } from "@dojoengine/recs";
import { useEffect, useState } from "react";
import "./App.css";
//import ChessGame from "./game/ChessGame";
import ChessLobby from "./components/ChessLobby";
// import { Direction } from "./utils";
// import { getEntityIdFromKeys } from "@dojoengine/utils";
// import { useDojo } from "./dojo/useDojo";

function App() {
    

    return (
        <>
            {/* <ChessGame /> */}
            <ChessLobby />
        </>
    );
}

export default App;
