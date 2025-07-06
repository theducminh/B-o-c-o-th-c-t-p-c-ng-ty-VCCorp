import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import routes from './routes';
import { initSocket } from './socket';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
  },
} as any);

app.use(cors());
app.use(express.json());
app.use('/api', routes);

initSocket(io);

// Connect to MongoDB
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  throw new Error('Missing MONGO_URI in environment variables');
}
mongoose.connect(mongoUri)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });

export default server;