import express from 'express';
import { fetchBirdseyeKlines } from '../lib/market-data.js';
const router = express.Router();
// GET /market-data?symbol=SOL&resolution=1m&limit=1000
router.get('/', async (req, res) => {
    try {
        const { symbol, resolution, limit } = req.query;
        if (!symbol || !resolution) {
            return res.status(400).json({
                error: 'Missing required parameters: symbol, resolution',
                message: 'Please provide both symbol (e.g., SOL, BONK) and resolution (e.g., 1m, 1h, 1d)'
            });
        }
        const data = await fetchBirdseyeKlines(symbol, resolution, limit ? parseInt(limit) : 1000);
        // Transform data for lightweight-charts
        const transformedData = {
            candles: data.map((d) => ({
                time: d.timestamp / 1000, // Convert to seconds for lightweight-charts
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close
            })),
            volume: data.map((d) => ({
                time: d.timestamp / 1000, // Convert to seconds for lightweight-charts
                value: d.volume,
                color: d.close >= d.open ? '#22c55e44' : '#ef444444' // Green for up, red for down
            }))
        };
        // Add cache headers
        res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
        res.json(transformedData);
    }
    catch (error) {
        console.error('Error fetching market data:', error);
        // Check if it's a known error type
        if (error instanceof Error && error.message.includes('Unsupported symbol')) {
            return res.status(400).json({
                error: error.message,
                supportedFormats: [
                    'Solana token symbols (e.g., SOL, BONK, JUP)',
                    'Solana token addresses (e.g., So11111111111111111111111111111111111111112)'
                ]
            });
        }
        res.status(500).json({ error: 'Failed to fetch market data', message: error instanceof Error ? error.message : 'Unknown error' });
    }
});
export default router;
