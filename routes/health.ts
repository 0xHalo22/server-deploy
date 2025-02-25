import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'solana-market-data',
    timestamp: Date.now()
  });
});

export default router; 