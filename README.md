# Solana Market Data API

A lightweight Express server that provides market data for Solana tokens using the Birdseye API.

## Features

- Fetch OHLCV (Open, High, Low, Close, Volume) data for Solana tokens
- Support for multiple time intervals (1m, 5m, 15m, 1h, 4h, 1d)
- Caching to reduce API calls and improve performance
- Rate limiting to prevent abuse
- Health check endpoint for monitoring

## API Endpoints

### GET /health

Health check endpoint that returns the status of the server.

```json
{
  "status": "ok",
  "timestamp": 1689123456789
}
```

### GET /market-data

Fetch market data for a specific Solana token.

**Query Parameters:**

- `symbol` (required): Token symbol (e.g., SOL, BONK, JUP) or mint address
- `interval` (optional): Time interval (1m, 5m, 15m, 1h, 4h, 1d). Default: 1h
- `limit` (optional): Number of candles to return. Default: 100

**Example Request:**

```
GET /market-data?symbol=SOL&interval=1h&limit=100
```

**Example Response:**

```json
{
  "symbol": "SOL",
  "interval": "1h",
  "data": [
    {
      "timestamp": 1689123456789,
      "open": 100.5,
      "high": 105.2,
      "low": 99.8,
      "close": 102.3,
      "volume": 1234567.89,
      "symbol": "SOL",
      "resolution": "1h"
    },
    // ...more candles
  ]
}
```

## Supported Tokens

The API supports the following Solana tokens out of the box:

- SOL (Native Solana)
- USDC
- BONK
- JTO (Jito)
- JUP (Jupiter)
- PYTH
- RNDR (Render)
- MSOL (Marinade Staked SOL)
- RAY (Raydium)
- ORCA

You can also use any valid Solana mint address directly as the symbol parameter.

## Development

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

4. Update the `.env` file with your Birdseye API key

### Running Locally

```bash
# Development mode with hot reloading
npm run dev

# Build and run in production mode
npm run build
npm start
```

## Deployment

The API is designed to be deployed to Fly.io:

```bash
fly deploy
```

## Environment Variables

- `PORT`: Server port (default: 8080)
- `NODE_ENV`: Environment (development, production)
- `BIRDSEYE_API_KEY`: Your Birdseye API key
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS

## License

MIT 