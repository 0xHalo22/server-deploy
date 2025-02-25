// Market data types
export interface MarketData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
  resolution: string;
}

export interface MarketDataResponse {
  symbol: string;
  interval: string;
  data: MarketData[];
}

// Birdseye API response types
export interface BirdseyeOHLCVResponse {
  success: boolean;
  data: {
    items: BirdseyeOHLCVData[];
  };
}

export interface BirdseyeOHLCVData {
  unixTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

// Subscription types
export interface MarketDataSubscription {
  symbol: string;
  resolution: string;
  callback: (data: MarketData) => void;
} 