import create from 'zustand';

interface PlayerState {
    playerName: string;
    setPlayerName: (name: string) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
    playerName: '',
    setPlayerName: (name: string) => set({ playerName: name }),
}));