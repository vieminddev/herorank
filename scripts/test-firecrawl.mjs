/**
 * Debug Firecrawl — test single page with full error logging
 */
import FirecrawlApp from '@mendable/firecrawl-js';

const API_KEY = process.env.FIRECRAWL_API_KEY;

if (!API_KEY) {
  console.error('Error: FIRECRAWL_API_KEY environment variable is not set.');
  console.error('Set it before running, e.g. FIRECRAWL_API_KEY=fc-... node scripts/test-firecrawl.mjs');
  process.exit(1);
}

const app = new FirecrawlApp({ apiKey: API_KEY });

async function main() {
  console.log('Testing Firecrawl API...');
  console.log('SDK version info:', typeof app.scrapeUrl);
  
  try {
    const result = await app.scrapeUrl('https://www.rankhero.com/pricing', {
      formats: ['markdown'],
    });
    
    console.log('\n--- Full Result ---');
    console.log(JSON.stringify(result, null, 2).substring(0, 3000));
  } catch (err) {
    console.error('\n--- Error Details ---');
    console.error('Message:', err.message);
    console.error('Status:', err.statusCode || err.status);
    console.error('Response:', err.response?.data || err.response?.body);
    console.error('Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2).substring(0, 2000));
  }
}

main();
