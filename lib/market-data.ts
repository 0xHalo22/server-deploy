import { MarketData, MarketDataResponse, MarketDataSubscription } from '../types.js';
import NodeCache from 'node-cache';

// Create a cache for market data with TTL of 5 minutes
const marketDataCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Birdseye API interval mapping
const BIRDSEYE_INTERVALS: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
};

// Map common Solana token symbols to their mint addresses
const SYMBOL_TO_MINT_ADDRESS: Record<string, string> = {
  'SOL': 'So11111111111111111111111111111111111111112', // Native SOL
  'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  'JTO': 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', // Jito
  'JUP': 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // Jupiter
  'PYTH': 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', // Pyth
  'RNDR': 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T6rJJaLvQKkJ', // Render
  'MSOL': 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // Marinade Staked SOL
  'RAY': '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // Raydium
  'ORCA': 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', // Orca
};

// Helper function to get mint address from symbol
export function getMintAddress(symbol: string): string | null {
  // If it's already a mint address, return it
  if (symbol.length === 44 || symbol.length === 43) {
    return symbol;
  }
  
  // Remove USDT suffix if present (e.g., SOLUSDT -> SOL)
  const baseSymbol = symbol.replace(/USDT$/, '');
  
  // Check if we have a mapping for this symbol
  if (SYMBOL_TO_MINT_ADDRESS[baseSymbol]) {
    return SYMBOL_TO_MINT_ADDRESS[baseSymbol];
  }
  
  return null;
}

// Simple in-memory cache for responses
const responseCache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_TTL = 60 * 1000; // 1 minute

// Fetch historical data with error handling and caching
export async function fetchMarketData(symbol: string, interval: string, limit: number = 100): Promise<any[]> {
  try {
    const mintAddress = getMintAddress(symbol);
    
    if (!mintAddress) {
      throw new Error(`Unsupported symbol: ${symbol}. Please use a valid Solana token symbol or mint address.`);
    }
    
    // Create cache key
    const cacheKey = `${mintAddress}-${interval}-${limit}`;
    
    // Check cache
    if (responseCache[cacheKey] && (Date.now() - responseCache[cacheKey].timestamp) < CACHE_TTL) {
      console.log(`Using cached data for ${symbol} (${mintAddress})`);
      return responseCache[cacheKey].data;
    }
    
    try {
      // Try to fetch from Birdseye API first
      const birdseyeData = await fetchBirdseyeData(mintAddress, interval, limit, symbol);
      
      // Update cache
      responseCache[cacheKey] = {
        data: birdseyeData,
        timestamp: Date.now()
      };
      
      return birdseyeData;
    } catch (error) {
      console.error('Error fetching from Birdseye, falling back to mock data:', error);
      
      // Fall back to mock data
      const mockData = generateMockData(symbol, interval, limit);
      
      // Update cache
      responseCache[cacheKey] = {
        data: mockData,
        timestamp: Date.now()
      };
      
      return mockData;
    }
  } catch (error) {
    console.error('Error fetching market data:', error);
    throw error;
  }
}

// Fetch data from Birdseye API
async function fetchBirdseyeData(mintAddress: string, interval: string, limit: number, symbolName: string): Promise<any[]> {
  const birdseyeInterval = BIRDSEYE_INTERVALS[interval] || '1h';
  
  // Birdseye API endpoint for OHLC data
  const url = `https://public-api.birdeye.so/defi/ohlcv?address=${mintAddress}&type=${birdseyeInterval.toUpperCase()}&limit=${limit}`;
  
  console.log(`Fetching data from Birdseye API: ${url}`);
  console.log(`Using API key: ${process.env.BIRDSEYE_API_KEY?.substring(0, 5)}...`);
  
  // Implement retry logic with exponential backoff
  let retries = 3;
  let lastError;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(`Attempt ${attempt + 1} to fetch data from Birdseye API`);
      
      const response = await fetch(url, {
        headers: {
          'X-API-KEY': process.env.BIRDSEYE_API_KEY || '',
          'Accept': 'application/json',
        }
      });
      
      console.log(`Response status: ${response.status}`);
      
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
        console.warn(`Birdseye rate limit hit, retrying after ${retryAfter} seconds`);
        
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Birdseye API error response: ${errorText}`);
        throw new Error(`Birdseye API error: ${response.status} ${response.statusText}`);
      }
      
      const responseData = await response.json();
      console.log(`Response data: ${JSON.stringify(responseData).substring(0, 200)}...`);
      
      if (!responseData.success) {
        console.error(`Birdseye API returned success=false: ${JSON.stringify(responseData)}`);
        throw new Error(`Birdseye API returned success=false: ${responseData.message || 'No error message'}`);
      }
      
      if (!responseData.data || !responseData.data.items || !Array.isArray(responseData.data.items)) {
        console.error(`Invalid response structure: ${JSON.stringify(responseData)}`);
        throw new Error('Empty or invalid response from Birdseye');
      }
      
      console.log(`Got ${responseData.data.items.length} data points from Birdseye API`);
      
      // Transform the data to our format
      const transformedData = responseData.data.items.map((item: any) => ({
        timestamp: item.unixTime * 1000, // Convert to milliseconds
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: parseFloat(item.close),
        volume: parseFloat(item.volume),
        symbol: symbolName,
        resolution: interval
      }));
      
      return transformedData;
    } catch (error) {
      lastError = error;
      console.error(`Birdseye attempt ${attempt + 1} failed:`, error);
      
      if (attempt < retries - 1) {
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error('All attempts to fetch data from Birdseye failed, falling back to mock data');
  throw lastError || new Error('Failed to fetch data from Birdseye');
}

// Generate mock data for testing or when API is unavailable
function generateMockData(symbol: string, interval: string, limit: number): MarketData[] {
  console.log(`Generating mock data for ${symbol} (${interval})`);
  
  const now = Date.now();
  const mockData: MarketData[] = [];
  
  // Determine time interval in milliseconds
  let timeStep: number;
  switch (interval) {
    case '1m': timeStep = 60 * 1000; break;
    case '5m': timeStep = 5 * 60 * 1000; break;
    case '15m': timeStep = 15 * 60 * 1000; break;
    case '1h': timeStep = 60 * 60 * 1000; break;
    case '4h': timeStep = 4 * 60 * 60 * 1000; break;
    case '1d': timeStep = 24 * 60 * 60 * 1000; break;
    default: timeStep = 60 * 60 * 1000; // Default to 1h
  }
  
  // Base price depends on the symbol
  let basePrice: number;
  switch (symbol.toUpperCase()) {
    case 'SOL': basePrice = 150; break;
    case 'USDC': basePrice = 1; break;
    case 'BONK': basePrice = 0.00002; break;
    case 'JTO': basePrice = 2.5; break;
    case 'JUP': basePrice = 1.2; break;
    case 'PYTH': basePrice = 0.5; break;
    case 'RNDR': basePrice = 7; break;
    case 'MSOL': basePrice = 160; break;
    case 'RAY': basePrice = 0.8; break;
    case 'ORCA': basePrice = 0.6; break;
    default: basePrice = 10; // Default price
  }
  
  // Generate mock data points
  for (let i = 0; i < limit; i++) {
    const timestamp = now - (limit - i - 1) * timeStep;
    
    // Add some randomness to the price
    const volatility = 0.02; // 2% volatility
    const randomFactor = 1 + (Math.random() * volatility * 2 - volatility);
    const price = basePrice * randomFactor;
    
    // Generate OHLC data with some variation
    const open = price;
    const high = price * (1 + Math.random() * 0.01); // Up to 1% higher
    const low = price * (1 - Math.random() * 0.01); // Up to 1% lower
    const close = price * (1 + (Math.random() * 0.02 - 0.01)); // +/- 1%
    
    // Generate volume
    const volume = basePrice * 1000000 * (Math.random() + 0.5); // Random volume
    
    mockData.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      symbol,
      resolution: interval
    });
  }
  
  return mockData;
}

// Subscription management for real-time updates
const subscriptions = new Map<string, Set<any>>();
const activePolling = new Set<string>();

export function addSubscription(symbol: string, subscription: any): void {
  if (!subscriptions.has(symbol)) {
    subscriptions.set(symbol, new Set());
  }
  subscriptions.get(symbol)?.add(subscription);
  
  // Start polling if not already active
  if (!activePolling.has(symbol)) {
    activePolling.add(symbol);
    startPolling(symbol);
  }
}

export function removeSubscription(symbol: string, subscription: any): void {
  subscriptions.get(symbol)?.delete(subscription);
  if (subscriptions.get(symbol)?.size === 0) {
    subscriptions.delete(symbol);
    activePolling.delete(symbol);
  }
}

// Setup polling for real-time updates
function startPolling(symbol: string) {
  const POLL_INTERVAL = 30000; // 30 seconds
  
  const poll = async () => {
    try {
      // Only poll if we still have active subscriptions
      if (subscriptions.has(symbol)) {
        const data = await fetchMarketData(symbol, '1m', 1);
        if (data && data.length > 0) {
          emitMarketData(symbol, data[0]);
        }
        
        // Schedule next poll
        setTimeout(poll, POLL_INTERVAL);
      }
    } catch (error) {
      console.error(`Error polling ${symbol}:`, error);
      // Retry after a delay even if there was an error
      setTimeout(poll, POLL_INTERVAL);
    }
  };
  
  // Start polling
  poll();
}

function emitMarketData(symbol: string, data: any): void {
  const subs = subscriptions.get(symbol) || new Set();
  subs.forEach(sub => {
    if (sub.callback) {
      sub.callback(data);
    }
  });
}

// Get market data for a symbol
export async function getMarketData(symbol: string, interval: string = '1h', limit: number = 100): Promise<MarketDataResponse> {
  console.log(`Getting market data for symbol: ${symbol}, interval: ${interval}, limit: ${limit}`);
  
  try {
    // Normalize symbol
    const normalizedSymbol = symbol.toUpperCase();
    console.log(`Normalized symbol: ${normalizedSymbol}`);
    
    // Get mint address for the symbol
    let mintAddress: string;
    
    // Hardcoded mint addresses for common tokens
    const MINT_ADDRESSES: Record<string, string> = {
      'SOL': 'So11111111111111111111111111111111111111112', // Native SOL token
      'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK token
      'JTO': 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',   // JTO token
      // Add more tokens as needed
    };
    
    if (MINT_ADDRESSES[normalizedSymbol]) {
      mintAddress = MINT_ADDRESSES[normalizedSymbol];
      console.log(`Using hardcoded mint address for ${normalizedSymbol}: ${mintAddress}`);
    } else {
      console.log(`No hardcoded mint address for ${normalizedSymbol}, attempting to look up`);
      // Here you would implement a lookup service for other tokens
      // For now, we'll just throw an error
      throw new Error(`Unsupported token: ${normalizedSymbol}`);
    }
    
    // Try to get data from cache first
    const cacheKey = `${normalizedSymbol}-${interval}-${limit}`;
    const cachedData = marketDataCache.get<MarketData[]>(cacheKey);
    
    if (cachedData) {
      console.log(`Returning cached data for ${cacheKey}`);
      return {
        symbol: normalizedSymbol,
        interval,
        data: cachedData
      };
    }
    
    console.log(`No cached data found for ${cacheKey}, fetching from API`);
    
    // Fetch data from Birdseye API
    const data = await fetchBirdseyeData(mintAddress, interval, limit, normalizedSymbol);
    
    // Cache the data
    marketDataCache.set(cacheKey, data);
    console.log(`Cached ${data.length} data points for ${cacheKey}`);
    
    return {
      symbol: normalizedSymbol,
      interval,
      data
    };
  } catch (error) {
    console.error(`Error getting market data for ${symbol}:`, error);
    
    // Return empty data on error
    return {
      symbol,
      interval,
      data: []
    };
  }
} 