"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const market_data_1 = require("../lib/market-data");
const router = express_1.default.Router();
// GET /market-data?symbol=BTCUSDT&resolution=1m&limit=1000
router.get('/', async (req, res) => {
    try {
        const { symbol, resolution, limit } = req.query;
        if (!symbol || !resolution) {
            return res.status(400).json({ error: 'Missing required parameters: symbol, resolution' });
        }
        const data = await (0, market_data_1.fetchCoinGeckoKlines)(symbol, resolution, limit ? parseInt(limit) : 1000);
        // Transform data for lightweight-charts
        const transformedData = {
            candles: data.map((d) => ({
                time: d.time,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close
            })),
            volumes: data.map((d) => ({
                time: d.time,
                value: d.volume
            }))
        };
        res.json(transformedData);
    }
    catch (error) {
        console.error('Error fetching market data:', error);
        res.status(500).json({ error: 'Failed to fetch market data' });
    }
});
exports.default = router;
