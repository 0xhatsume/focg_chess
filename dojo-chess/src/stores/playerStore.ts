import create from 'zustand';
import { persist } from 'zustand/middleware';

interface PlayerState {
    playerName: string;
    setPlayerName: (name: string) => void;
}

export const usePlayerStore = create<PlayerState>()(
    persist(
        (set) => ({
            playerName: '',
            setPlayerName: (name: string) => set({ playerName: name }),
        }),
        {
            name: 'player-storage',
        }
    )
);