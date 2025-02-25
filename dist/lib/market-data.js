// CoinGecko interval mapping (days parameter)
const COINGECKO_INTERVALS = {
    '1m': 1, // 1 day with minute data
    '5m': 1, // 1 day with 5-minute data
    '15m': 1, // 1 day with 15-minute data
    '1h': 7, // 7 days with hourly data
    '4h': 30, // 30 days with 4-hour data
    '1d': 90, // 90 days with daily data
};
// Map common trading symbols to CoinGecko IDs
const SYMBOL_TO_COINGECKO_ID = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'DOGE': 'dogecoin',
    'XRP': 'ripple',
    'ADA': 'cardano',
    'DOT': 'polkadot',
    'AVAX': 'avalanche-2',
    'MATIC': 'matic-network',
    'LINK': 'chainlink',
    'UNI': 'uniswap',
    'AAVE': 'aave',
    'ATOM': 'cosmos',
    'LTC': 'litecoin',
    'BCH': 'bitcoin-cash',
    'ALGO': 'algorand',
    'FIL': 'filecoin',
    'XLM': 'stellar',
    'VET': 'vechain',
    'THETA': 'theta-token',
    'EOS': 'eos',
    'TRX': 'tron',
    'XMR': 'monero',
    'NEO': 'neo',
    'DASH': 'dash',
    'ZEC': 'zcash',
    'ETC': 'ethereum-classic',
    'XTZ': 'tezos',
    'BNB': 'binancecoin',
    'USDT': 'tether',
    'USDC': 'usd-coin',
    'BUSD': 'binance-usd',
    'DAI': 'dai',
};
// Helper function to get CoinGecko ID from symbol
export function getCoinGeckoId(symbol) {
    // Check if the symbol is already a CoinGecko ID (like "bitcoin")
    const coinGeckoIds = Object.values(SYMBOL_TO_COINGECKO_ID);
    if (coinGeckoIds.includes(symbol.toLowerCase())) {
        return symbol.toLowerCase();
    }
    // Check if it's a direct match with a symbol
    if (SYMBOL_TO_COINGECKO_ID[symbol]) {
        return SYMBOL_TO_COINGECKO_ID[symbol];
    }
    // Extract base asset from trading pair (e.g., BTCUSDT -> BTC)
    const baseAsset = symbol.replace(/USDT$|BUSD$|USD$|USDC$|DAI$/, '');
    return SYMBOL_TO_COINGECKO_ID[baseAsset] || null;
}
// Simple in-memory cache for CoinGecko responses
const cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
// Fetch historical data from CoinGecko with improved error handling and caching
async function fetchCoinGeckoKlines(symbol, interval, limit = 1000) {
    try {
        const coinId = getCoinGeckoId(symbol);
        if (!coinId) {
            throw new Error(`Unsupported symbol: ${symbol}. Please use a trading pair format (e.g., BTCUSDT) or a valid CoinGecko ID.`);
        }
        const days = COINGECKO_INTERVALS[interval] || 1;
        // Create cache key
        const cacheKey = `${coinId}-${days}-${interval}`;
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
                const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`);
                // Handle rate limiting specifically
                if (response.status === 429) {
                    const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
                    console.warn(`CoinGecko rate limit hit, retrying after ${retryAfter} seconds`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    continue;
                }
                if (!response.ok) {
                    throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                if (!Array.isArray(data) || data.length === 0) {
                    throw new Error('Empty or invalid response from CoinGecko');
                }
                // Transform and cache the data
                const transformedData = data.map((kline) => ({
                    symbol,
                    timestamp: kline[0], // Open time
                    open: kline[1],
                    high: kline[2],
                    low: kline[3],
                    close: kline[4],
                    // Calculate a fake volume based on price range
                    volume: (kline[2] - kline[3]) * (kline[1] + kline[4]) / 2 * 100,
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
                console.error(`CoinGecko attempt ${attempt + 1} failed:`, error);
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
        throw lastError || new Error('Failed to fetch data from CoinGecko');
    }
    catch (error) {
        console.error('Error fetching from CoinGecko:', error);
        throw error;
    }
}
// WebSocket connection for real-time updates
// Note: CoinGecko doesn't provide WebSocket, so we'll use polling instead
let updateInterval = null;
const activeSymbols = new Set();
const subscriptions = new Map();
// Setup polling for real-time updates (CoinGecko doesn't have WebSockets)
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
                const data = await fetchCoinGeckoKlines(symbol, '1m', 1);
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
export { fetchCoinGeckoKlines };
