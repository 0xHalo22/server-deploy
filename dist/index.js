import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { addSubscription, removeSubscription } from './lib/market-data.js';
import healthRouter from './routes/health.js';
import marketDataRouter from './routes/market-data.js';
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
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
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
// Add a route for CoinGecko proxy
app.get('/api/coingecko/:endpoint(*)', async (req, res) => {
    try {
        const endpoint = req.params.endpoint;
        const queryString = new URLSearchParams(req.query).toString();
        const url = `https://api.coingecko.com/api/v3/${endpoint}${queryString ? `?${queryString}` : ''}`;
        console.log(`Proxying request to CoinGecko: ${url}`);
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
            }
        });
        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        res.json(data);
    }
    catch (error) {
        console.error('Error proxying to CoinGecko:', error);
        res.status(500).json({ error: 'Failed to fetch data from CoinGecko' });
    }
});
// WebSocket setup
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('market:subscribe', ({ symbol, resolution }) => {
        console.log(`Client ${socket.id} subscribed to ${symbol} @ ${resolution}`);
        const subscription = {
            socket,
            symbol,
            resolution,
            callback: (data) => {
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
