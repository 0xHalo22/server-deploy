// Simple script to test Birdseye API key
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const API_KEY = process.env.BIRDSEYE_API_KEY;

if (!API_KEY) {
  console.error('Error: BIRDSEYE_API_KEY not found in environment variables');
  process.exit(1);
}

async function testBirdseyeApi() {
  try {
    console.log('Testing Birdseye API with key:', API_KEY);
    
    // Test endpoint - get OHLCV data for SOL
    const url = 'https://public-api.birdeye.so/defi/ohlcv?address=So11111111111111111111111111111111111111112&type=1h&limit=5';
    
    const response = await fetch(url, {
      headers: {
        'X-API-KEY': API_KEY,
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log('API Response Status:', response.status);
    console.log('Success:', data.success);
    console.log('Data sample:', data.data.slice(0, 1));
    console.log('Total data points:', data.data.length);
    
    console.log('\nAPI key is working correctly! ✅');
  } catch (error) {
    console.error('Error testing Birdseye API:', error);
    process.exit(1);
  }
}

testBirdseyeApi(); 