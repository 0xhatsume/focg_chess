import create from 'zustand';
interface PlayerState {
    playerName: string | null;
    setPlayerName: (name: string | null) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
    playerName: null,
    setPlayerName: (name: string | null) => set({ playerName: name }),
}));