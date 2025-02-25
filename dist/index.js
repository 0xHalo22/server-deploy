"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const market_data_js_1 = require("./lib/market-data.js");
const health_js_1 = __importDefault(require("./routes/health.js"));
const market_data_js_2 = __importDefault(require("./routes/market-data.js"));
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
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
const io = new socket_io_1.Server(httpServer, {
    cors: corsOptions
});
// Middleware
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
// Routes
app.use('/health', health_js_1.default);
app.use('/api/market-data', market_data_js_2.default);
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
        (0, market_data_js_1.addSubscription)(symbol, subscription);
        socket.on('market:unsubscribe', () => {
            (0, market_data_js_1.removeSubscription)(symbol, subscription);
        });
        socket.on('disconnect', () => {
            (0, market_data_js_1.removeSubscription)(symbol, subscription);
        });
    });
});
// Start server
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
