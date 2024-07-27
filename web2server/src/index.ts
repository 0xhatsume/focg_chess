import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { configureSocket } from './socket';
import { corsOptions } from './config';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: corsOptions });

configureSocket(io);

const PORT = 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});