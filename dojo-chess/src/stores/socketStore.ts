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
    const storedSessionID = localStorage.getItem('sessionID');
    const newSocket = io('http://localhost:3001', {
      auth: { sessionID: storedSessionID },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    newSocket.on('session', ({ sessionID, userID }) => {
      // Store the sessionID in the localStorage
      localStorage.setItem('sessionID', sessionID);
      // Attach the sessionID to the socket object
      newSocket.auth = { sessionID };
    });

    set({ socket: newSocket });
  },
  disconnect: () => {
    set((state) => {
      state.socket?.disconnect();
      return { socket: null };
    });
  },
}));