import { Socket } from 'socket.io';

export interface MarketData {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  resolution: string;
}

export interface MarketDataQuery {
  symbol: string;
  resolution: string;
  from?: number;
  to?: number;
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