import { Socket } from 'socket.io';

export type DataSource = 'binance' | 'dexscreener' | 'coingecko';

export interface MarketData {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  resolution: string;
  source?: DataSource;
}

export interface MarketDataQuery {
  symbol: string;
  resolution: string;
  from?: number;
  to?: number;
  source?: DataSource;
}

export interface MarketDataSubscription {
  socket: Socket;
  symbol: string;
  resolution: string;
  callback: (data: MarketData) => void;
}

export interface SocketEvents {
  'market:subscribe': (data: { symbol: string; resolution: string }) => void;
  'market:unsubscribe': (data: { symbol: string }) => void;
  'market:data': (data: MarketData) => void;
}

export interface ServerToClientEvents {
  'market-update': (data: {
    symbol: string;
    timestamp: number;
    price: number;
  }) => void;
}

export interface ClientToServerEvents {
  subscribe: (data: MarketDataSubscription) => void;
  unsubscribe: (data: MarketDataSubscription) => void;
}

export type MarketDataSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents
>; 