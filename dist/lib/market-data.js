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
function getCoinGeckoId(symbol) {
    // Extract base asset from trading pair (e.g., BTCUSDT -> BTC)
    const baseAsset = symbol.replace(/USDT$|BUSD$|USD$|USDC$/, '');
    return SYMBOL_TO_COINGECKO_ID[baseAsset] || null;
}
// Fetch historical data from CoinGecko
async function fetchCoinGeckoKlines(symbol, interval, limit = 1000) {
    try {
        const coinId = getCoinGeckoId(symbol);
        if (!coinId) {
            throw new Error(`Unsupported symbol: ${symbol}`);
        }
        const days = COINGECKO_INTERVALS[interval] || 1;
        const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`);
        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.statusText}`);
        }
        const data = await response.json();
        // CoinGecko OHLC format: [timestamp, open, high, low, close]
        return data.map((kline) => ({
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
    if (!subscriptions.has(symbol)) {
        subscriptions.set(symbol, new Set());
    }
    subscriptions.get(symbol)?.add(subscription);
    // Add to active symbols and setup polling
    activeSymbols.add(symbol);
    setupPolling();
}
export function removeSubscription(symbol, subscription) {
    subscriptions.get(symbol)?.delete(subscription);
    if (subscriptions.get(symbol)?.size === 0) {
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
