import { MarketData, MarketDataSubscription } from '../types';

// Binance kline interval mapping
const BINANCE_INTERVALS: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d'
};

// Fetch historical klines from Binance
async function fetchBinanceKlines(symbol: string, interval: string, limit: number = 1000): Promise<MarketData[]> {
  try {
    const binanceInterval = BINANCE_INTERVALS[interval] || '1m';
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    return data.map((kline: any) => ({
      symbol,
      timestamp: kline[0], // Open time
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      resolution: interval
    }));
  } catch (error) {
    console.error('Error fetching from Binance:', error);
    throw error;
  }
}

// WebSocket connection for real-time updates
let binanceWs: WebSocket | null = null;
const activeSymbols = new Set<string>();

function connectBinanceWebSocket() {
  if (binanceWs?.readyState === WebSocket.OPEN) return;

  const symbols = Array.from(activeSymbols);
  if (symbols.length === 0) return;

  const streams = symbols.map(s => `${s.toLowerCase()}@kline_1m`).join('/');
  binanceWs = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);

  binanceWs.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.e === 'kline') {
      const kline = data.k;
      const marketData: MarketData = {
        symbol: data.s,
        timestamp: data.T,
        open: parseFloat(kline.o),
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: parseFloat(kline.c),
        volume: parseFloat(kline.v),
        resolution: '1m' // Real-time updates are always 1m
      };
      emitMarketData(data.s, marketData);
    }
  };

  binanceWs.onerror = (error) => {
    console.error('Binance WebSocket error:', error);
    reconnectWebSocket();
  };

  binanceWs.onclose = () => {
    console.log('Binance WebSocket closed');
    reconnectWebSocket();
  };
}

function reconnectWebSocket() {
  if (binanceWs) {
    binanceWs.close();
    binanceWs = null;
  }
  setTimeout(connectBinanceWebSocket, 5000);
}

// Subscription management
const subscriptions = new Map<string, Set<MarketDataSubscription>>();

export function addSubscription(symbol: string, subscription: MarketDataSubscription): void {
  if (!subscriptions.has(symbol)) {
    subscriptions.set(symbol, new Set());
  }
  subscriptions.get(symbol)?.add(subscription);
  
  // Add to active symbols and reconnect WebSocket
  activeSymbols.add(symbol);
  connectBinanceWebSocket();
}

export function removeSubscription(symbol: string, subscription: MarketDataSubscription): void {
  subscriptions.get(symbol)?.delete(subscription);
  if (subscriptions.get(symbol)?.size === 0) {
    subscriptions.delete(symbol);
    activeSymbols.delete(symbol);
    
    // Reconnect WebSocket with updated symbols
    if (binanceWs) {
      binanceWs.close();
      binanceWs = null;
    }
    connectBinanceWebSocket();
  }
}

function getSubscriptions(symbol: string): Set<MarketDataSubscription> {
  return subscriptions.get(symbol) || new Set();
}

// Data emitter
function emitMarketData(symbol: string, data: MarketData): void {
  const subs = getSubscriptions(symbol);
  subs.forEach(sub => {
    if (sub.callback) {
      sub.callback(data);
    }
  });
}

export { fetchBinanceKlines }; 