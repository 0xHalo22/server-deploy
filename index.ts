import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { MarketData, SocketEvents } from './types.js';
import { addSubscription, removeSubscription, getCoinGeckoId } from './lib/market-data.js';

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
  cors: corsOptions
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/health', healthRouter);
app.use('/api/market-data', marketDataRouter);

// Simple in-memory cache for CoinGecko proxy
const proxyCache: Record<string, { data: any; timestamp: number }> = {};
const PROXY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Add a route for CoinGecko proxy with improved caching and rate limit handling
app.get('/api/coingecko/:endpoint(*)', async (req, res) => {
  try {
    let endpoint = req.params.endpoint;
    const queryParams = req.query as Record<string, string>;
    
    // Handle symbol conversion for specific endpoints
    if (endpoint.includes('coins/') && !endpoint.includes('list') && !endpoint.includes('markets')) {
      // Extract the coin ID from the endpoint (e.g., coins/bitcoin/market_chart)
      const parts = endpoint.split('/');
      const coinIdIndex = parts.indexOf('coins') + 1;
      
      if (coinIdIndex < parts.length) {
        const originalCoinId = parts[coinIdIndex];
        
        // Check if this looks like a trading pair (e.g., BTCUSDT)
        if (/^[A-Z0-9]{2,10}(USDT|BUSD|USD|USDC|DAI)$/.test(originalCoinId)) {
          // Try to convert it to a CoinGecko ID
          const coinId = getCoinGeckoId(originalCoinId);
          
          if (coinId && coinId !== originalCoinId) {
            // Replace the coin ID in the endpoint
            parts[coinIdIndex] = coinId;
            const newEndpoint = parts.join('/');
            console.log(`Converted endpoint from ${endpoint} to ${newEndpoint}`);
            endpoint = newEndpoint;
          }
        }
      }
    }
    
    const queryString = new URLSearchParams(queryParams).toString();
    const url = `https://api.coingecko.com/api/v3/${endpoint}${queryString ? `?${queryString}` : ''}`;
    
    // Create cache key from full URL
    const cacheKey = url;
    
    // Check cache first
    if (proxyCache[cacheKey] && (Date.now() - proxyCache[cacheKey].timestamp) < PROXY_CACHE_TTL) {
      console.log(`Using cached data for CoinGecko proxy: ${endpoint}`);
      return res.json(proxyCache[cacheKey].data);
    }
    
    console.log(`Proxying request to CoinGecko: ${url}`);
    
    // Implement retry logic with exponential backoff
    let retries = 3;
    let lastError;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          }
        });
        
        // Handle rate limiting specifically
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
          console.warn(`CoinGecko rate limit hit, retrying after ${retryAfter} seconds`);
          
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
          throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
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
        console.error(`CoinGecko proxy attempt ${attempt + 1} failed:`, error);
        
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
    
    throw lastError || new Error('Failed to fetch data from CoinGecko');
  } catch (error) {
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