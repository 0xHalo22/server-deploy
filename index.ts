import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { MarketData, SocketEvents } from './types';
import { addSubscription, removeSubscription } from './lib/market-data';

import healthRouter from './routes/health';
import marketDataRouter from './routes/market-data';

const app = express();
const httpServer = createServer(app);

// Allow multiple origins for CORS
const allowedOrigins = [
  'http://localhost:3000',
  'https://hyperbore.vercel.app', // Add your Vercel deployment URL
  process.env.CLIENT_URL,
].filter(Boolean);

// Configure CORS for both Express and Socket.IO
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  credentials: true
};

const io = new Server(httpServer, {
  cors: corsOptions
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/health', healthRouter);
app.use('/api/market-data', marketDataRouter);

// WebSocket setup
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('market:subscribe', ({ symbol, resolution }) => {
    console.log(`Client ${socket.id} subscribed to ${symbol} @ ${resolution}`);
    
    const subscription = {
      socket,
      symbol,
      resolution,
      callback: (data: MarketData) => {
        socket.emit('market:data', data);
      }
    };

    addSubscription(symbol, subscription);
    
    socket.on('market:unsubscribe', () => {
      removeSubscription(symbol, subscription);
    });

    socket.on('disconnect', () => {
      removeSubscription(symbol, subscription);
    });
  });
});

// Start server
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 