import create from 'zustand';
import { io, Socket } from 'socket.io-client';

interface SocketState {
  socket: Socket | null;
  connect: () => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  socket: null,
  connect: () => {
    const newSocket = io('http://localhost:3001');
    set({ socket: newSocket });
  },
  disconnect: () => {
    set((state) => {
      state.socket?.disconnect();
      return { socket: null };
    });
  },
}));