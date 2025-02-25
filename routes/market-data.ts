import express from 'express';
import { fetchMarketData } from '../lib/market-data.js';

const router = express.Router();

// GET /market-data?symbol=SOL&interval=1h&limit=100
router.get('/', async (req, res) => {
  try {
    const { symbol, interval, limit } = req.query;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }
    
    // Default to 1h interval if not specified
    const timeInterval = (interval as string) || '1h';
    // Default to 100 candles if not specified
    const dataLimit = limit ? parseInt(limit as string, 10) : 100;
    
    // Validate limit
    if (isNaN(dataLimit) || dataLimit <= 0 || dataLimit > 1000) {
      return res.status(400).json({ error: 'Limit must be a number between 1 and 1000' });
    }
    
    const data = await fetchMarketData(symbol as string, timeInterval, dataLimit);
    
    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
    
    return res.json({
      symbol,
      interval: timeInterval,
      data
    });
  } catch (error: any) {
    console.error('Error fetching market data:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch market data',
      message: error.message
    });
  }
});

export default router; 