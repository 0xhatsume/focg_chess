export interface Player {
    id: string;
    name: string;
    color: 'white' | 'black';
}

export interface GameRoom {
    id: string;
    name: string;
    players: Player[];
    gameStarted: boolean;
    gameFen: string;
    moveHistory: string[];
    gameStatus: 'waiting' | 'playing' | 'ended';
}

export interface GameResult {
    winner: 'white' | 'black' | 'draw';
    reason: 'checkmate' | 'stalemate' | 'insufficient material' | 'threefold repetition' | 'draw' | 'resignation' | 'timeout';
}