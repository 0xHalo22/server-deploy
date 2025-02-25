// Birdseye interval mapping
const BIRDSEYE_INTERVALS = {
    '1m': '1M',
    '5m': '5M',
    '15m': '15M',
    '1h': '1H',
    '4h': '4H',
    '1d': '1D',
    '1w': '1W',
};
// Map common trading symbols to Solana token addresses
const SYMBOL_TO_ADDRESS = {
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
// Helper function to get token address from symbol
export function getTokenAddress(symbol) {
    // If it's already an address, return it
    if (symbol.length === 44 || symbol.length === 43) {
        return symbol;
    }
    // Check if it's a direct match with a symbol
    if (SYMBOL_TO_ADDRESS[symbol]) {
        return SYMBOL_TO_ADDRESS[symbol];
    }
    return null;
}
// Simple in-memory cache for Birdseye responses
const cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
// Fetch historical data from Birdseye with improved error handling and caching
async function fetchBirdseyeKlines(symbol, interval, limit = 1000) {
    try {
        const tokenAddress = getTokenAddress(symbol);
        if (!tokenAddress) {
            throw new Error(`Unsupported symbol: ${symbol}. Please use a valid token symbol or address.`);
        }
        // Create cache key
        const cacheKey = `${tokenAddress}-${interval}-${limit}`;
        // Check cache first
        if (cache[cacheKey] && (Date.now() - cache[cacheKey].timestamp) < CACHE_TTL) {
            console.log(`Using cached data for ${symbol} (${interval})`);
            return cache[cacheKey].data;
        }
        // Implement retry logic with exponential backoff
        let retries = 3;
        let lastError;
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                // Convert interval to uppercase format for Birdseye API
                const birdseyeInterval = BIRDSEYE_INTERVALS[interval] || interval.toUpperCase();
                // Construct the Birdseye API URL - using the OHLCV endpoint with 'type' parameter
                const birdseyeUrl = `https://public-api.birdeye.so/defi/ohlcv?address=${tokenAddress}&type=${birdseyeInterval}&limit=${limit}`;
                console.log(`Fetching from Birdseye: ${birdseyeUrl}`);
                const response = await fetch(birdseyeUrl, {
                    headers: {
                        'X-API-KEY': process.env.BIRDSEYE_API_KEY || '',
                        'Accept': 'application/json',
                    }
                });
                // Handle rate limiting specifically
                if (response.status === 429) {
                    const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
                    console.warn(`Birdseye rate limit hit, retrying after ${retryAfter} seconds`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    continue;
                }
                if (!response.ok) {
                    throw new Error(`Birdseye API error: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                if (!data.data || !Array.isArray(data.data.items)) {
                    throw new Error('Empty or invalid response from Birdseye');
                }
                // Transform the data to our standard format
                const transformedData = data.data.items.map((item) => ({
                    symbol,
                    timestamp: item.unixTime * 1000, // Convert to milliseconds
                    open: parseFloat(item.open),
                    high: parseFloat(item.high),
                    low: parseFloat(item.low),
                    close: parseFloat(item.close),
                    volume: parseFloat(item.volume),
                    resolution: interval
                }));
                // Update cache
                cache[cacheKey] = {
                    data: transformedData,
                    timestamp: Date.now()
                };
                return transformedData;
            }
            catch (error) {
                lastError = error;
                console.error(`Birdseye attempt ${attempt + 1} failed:`, error);
                if (attempt < retries - 1) {
                    // Exponential backoff
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        // If we have cached data, return it even if expired as fallback
        if (cache[cacheKey]) {
            console.warn(`Using expired cache as fallback for ${symbol}`);
            return cache[cacheKey].data;
        }
        throw lastError || new Error('Failed to fetch data from Birdseye');
    }
    catch (error) {
        console.error('Error fetching from Birdseye:', error);
        throw error;
    }
}
// WebSocket connection for real-time updates
// Note: Birdseye doesn't provide WebSocket, so we'll use polling instead
let updateInterval = null;
const activeSymbols = new Set();
const subscriptions = new Map();
// Setup polling for real-time updates (Birdseye doesn't have WebSockets)
function setupPolling() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    const symbols = Array.from(activeSymbols);
    if (symbols.length === 0)
        return;
    // Poll every 30 seconds (to avoid rate limiting)
    updateInterval = setInterval(async () => {
        for (const symbol of symbols) {
            try {
                const data = await fetchBirdseyeKlines(symbol, '1m', 1);
                if (data.length > 0) {
                    emitMarketData(symbol, data[data.length - 1]);
                }
            }
            catch (error) {
                console.error(`Error polling ${symbol}:`, error);
            }
        }
    }, 30000); // 30 seconds
}
function reconnectPolling() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
    setTimeout(setupPolling, 5000);
}
export function addSubscription(symbol, subscription) {
    var _a;
    if (!subscriptions.has(symbol)) {
        subscriptions.set(symbol, new Set());
    }
    (_a = subscriptions.get(symbol)) === null || _a === void 0 ? void 0 : _a.add(subscription);
    // Add to active symbols and setup polling
    activeSymbols.add(symbol);
    setupPolling();
}
export function removeSubscription(symbol, subscription) {
    var _a, _b;
    (_a = subscriptions.get(symbol)) === null || _a === void 0 ? void 0 : _a.delete(subscription);
    if (((_b = subscriptions.get(symbol)) === null || _b === void 0 ? void 0 : _b.size) === 0) {
        subscriptions.delete(symbol);
        activeSymbols.delete(symbol);
        // Restart polling with updated symbols
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
        setupPolling();
    }
}
function getSubscriptions(symbol) {
    return subscriptions.get(symbol) || new Set();
}
// Data emitter
function emitMarketData(symbol, data) {
    const subs = getSubscriptions(symbol);
    subs.forEach(sub => {
        if (sub.callback) {
            sub.callback(data);
        }
    });
}
export { fetchBirdseyeKlines };
