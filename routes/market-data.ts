import { Router } from 'express';
import { MarketDataQuery } from '../types';
import { fetchBinanceKlines } from '../lib/market-data';

const router = Router();

// GET /api/market-data?symbol=BTCUSDT&resolution=1m
router.get('/', async (req, res) => {
  try {
    const { symbol, resolution } = req.query as unknown as MarketDataQuery;
    
    if (!symbol || !resolution) {
      return res.status(400).json({ 
        error: 'Missing required parameters: symbol and resolution' 
      });
    }

    const data = await fetchBinanceKlines(symbol, resolution);
    
    // Transform data for lightweight-charts format
    const candles = data.map(kline => ({
      time: kline.timestamp / 1000, // Convert to seconds for lightweight-charts
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close
    }));

    const volume = data.map(kline => ({
      time: kline.timestamp / 1000,
      value: kline.volume,
      color: kline.close >= kline.open ? '#26a69a' : '#ef5350'
    }));

    res.json({ candles, volume });
  } catch (error) {
    console.error('Error in market data route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 