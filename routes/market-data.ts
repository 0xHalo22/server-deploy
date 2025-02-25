import express from 'express';
import { fetchCoinGeckoKlines } from '../lib/market-data.js';

const router = express.Router();

// GET /market-data?symbol=BTCUSDT&resolution=1m&limit=1000
router.get('/', async (req, res) => {
  try {
    const { symbol, resolution, limit } = req.query;
    
    if (!symbol || !resolution) {
      return res.status(400).json({ error: 'Missing required parameters: symbol, resolution' });
    }
    
    const data = await fetchCoinGeckoKlines(
      symbol as string, 
      resolution as string, 
      limit ? parseInt(limit as string) : 1000
    );
    
    // Transform data for lightweight-charts
    const transformedData = {
      candles: data.map((d: any) => ({
        time: d.timestamp / 1000, // Convert to seconds for lightweight-charts
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close
      })),
      volume: data.map((d: any) => ({
        time: d.timestamp / 1000, // Convert to seconds for lightweight-charts
        value: d.volume,
        color: d.close >= d.open ? '#22c55e44' : '#ef444444' // Green for up, red for down
      }))
    };
    
    // Add cache headers
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.json(transformedData);
  } catch (error) {
    console.error('Error fetching market data:', error);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

export default router; 