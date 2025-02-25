import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { MarketData, SocketEvents } from './types.js';
import { addSubscription, removeSubscription, getTokenAddress } from './lib/market-data.js';

import healthRouter from './routes/health.js';
import marketDataRouter from './routes/market-data.js';

const app = express();
const httpServer = createServer(app);

// Allow multiple origins for CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:4000',
  'https://hyperbore.vercel.app',
  'https://hyperbore-terminal.vercel.app',
  'https://hyperbore-market-data.fly.dev',
  process.env.CLIENT_URL,
].filter(Boolean) as string[];

// Configure CORS for both Express and Socket.IO
const corsOptions = {
  origin: function(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
      return;
    }
    
    // In production, check against allowed origins
    if (allowedOrigins.some(allowedOrigin => 
        allowedOrigin === '*' || 
        origin.startsWith(allowedOrigin) || 
        allowedOrigin === origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

const io = new Server(httpServer, {
  cors: corsOptions,
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Add a simple route to help with debugging WebSocket connections
app.get('/socket-status', (req, res) => {
  const status = {
    server: 'online',
    socketServer: io ? 'initialized' : 'not initialized',
    connections: Object.keys(io.sockets.sockets).length,
    timestamp: Date.now()
  };
  res.json(status);
});

// Routes
app.use('/health', healthRouter);
app.use('/api/market-data', marketDataRouter);

// Simple in-memory cache for Birdseye proxy
const proxyCache: Record<string, { data: any; timestamp: number }> = {};
const PROXY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Add a route for Birdseye proxy with improved caching and rate limit handling
app.get('/api/birdseye/:endpoint(*)', async (req, res) => {
  try {
    const endpoint = req.params.endpoint;
    const queryParams = req.query as Record<string, string>;
    
    const queryString = new URLSearchParams(queryParams).toString();
    const url = `https://public-api.birdeye.so/${endpoint}${queryString ? `?${queryString}` : ''}`;
    
    // Create cache key from full URL
    const cacheKey = url;
    
    // Check cache first
    if (proxyCache[cacheKey] && (Date.now() - proxyCache[cacheKey].timestamp) < PROXY_CACHE_TTL) {
      console.log(`Using cached data for Birdseye proxy: ${endpoint}`);
      return res.json(proxyCache[cacheKey].data);
    }
    
    console.log(`Proxying request to Birdseye: ${url}`);
    
    // Implement retry logic with exponential backoff
    let retries = 3;
    let lastError;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'X-API-KEY': process.env.BIRDSEYE_API_KEY || '',
            'Accept': 'application/json',
          }
        });
        
        // Handle rate limiting specifically
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
          console.warn(`Birdseye rate limit hit, retrying after ${retryAfter} seconds`);
          
          if (attempt < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
          } else {
            // If we're out of retries, check for expired cache as fallback
            if (proxyCache[cacheKey]) {
              console.warn(`Using expired cache as fallback for ${endpoint}`);
              return res.json(proxyCache[cacheKey].data);
            }
            throw new Error('Rate limit exceeded and no cache available');
          }
        }
        
        if (!response.ok) {
          throw new Error(`Birdseye API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Update cache
        proxyCache[cacheKey] = {
          data,
          timestamp: Date.now()
        };
        
        return res.json(data);
      } catch (error) {
        lastError = error;
        console.error(`Birdseye proxy attempt ${attempt + 1} failed:`, error);
        
        if (attempt < retries - 1) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If we have cached data, return it even if expired as fallback
    if (proxyCache[cacheKey]) {
      console.warn(`Using expired cache as fallback for ${endpoint}`);
      return res.json(proxyCache[cacheKey].data);
    }
    
    throw lastError || new Error('Failed to fetch data from Birdseye');
  } catch (error) {
    console.error('Error proxying to Birdseye:', error);
    res.status(500).json({ error: 'Failed to fetch data from Birdseye' });
  }
});

// Add a new route for token search to support searching for tickers directly from chart windows
app.get('/api/token-search', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter' });
    }
    
    // Create cache key
    const cacheKey = `token-search-${query}`;
    
    // Check cache first
    if (proxyCache[cacheKey] && (Date.now() - proxyCache[cacheKey].timestamp) < PROXY_CACHE_TTL) {
      console.log(`Using cached data for token search: ${query}`);
      return res.json(proxyCache[cacheKey].data);
    }
    
    // Construct the Birdseye API URL for token search
    const url = `https://public-api.birdeye.so/public/search_token?query=${query}`;
    
    console.log(`Searching tokens via Birdseye: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'X-API-KEY': process.env.BIRDSEYE_API_KEY || '',
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(`Birdseye API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Update cache
    proxyCache[cacheKey] = {
      data,
      timestamp: Date.now()
    };
    
    return res.json(data);
  } catch (error) {
    console.error('Error searching tokens:', error);
    res.status(500).json({ error: 'Failed to search tokens', message: error instanceof Error ? error.message : 'Unknown error' });
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