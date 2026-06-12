/**
 * Firecrawl Script — Crawl RankHero.com UI/UX Data (Fixed)
 * 
 * API Key: fc-d1241b9a22b94ab48b01a0c492a61166
 */

import FirecrawlApp from '@mendable/firecrawl-js';
import fs from 'fs';
import path from 'path';

const API_KEY = 'fc-d1241b9a22b94ab48b01a0c492a61166';
const app = new FirecrawlApp({ apiKey: API_KEY });

const OUTPUT_DIR = path.join(process.cwd(), 'crawl-data');

const PAGES = [
  { name: 'landing', url: 'https://www.rankhero.com/' },
  { name: 'pricing', url: 'https://www.rankhero.com/pricing' },
  { name: 'tag-generator', url: 'https://www.rankhero.com/tools/etsy/tag-generator' },
  { name: 'shop-analyzer', url: 'https://www.rankhero.com/tools/etsy/shop-analyzer' },
  { name: 'listing-analyzer', url: 'https://www.rankhero.com/tools/etsy/listing-analyzer' },
  { name: 'buyer-check', url: 'https://www.rankhero.com/tools/etsy/buyer-check' },
  { name: 'rank-check', url: 'https://www.rankhero.com/tools/etsy/rank-check' },
  { name: 'profit-calculator', url: 'https://www.rankhero.com/tools/etsy/profit-calculator' },
  { name: 'best-sellers', url: 'https://www.rankhero.com/tools/etsy/best-sellers' },
  { name: 'etsy-trends', url: 'https://www.rankhero.com/tools/etsy/etsy-trends' },
  { name: 'niche-finder', url: 'https://www.rankhero.com/tools/etsy/niche-finder' },
  { name: 'title-generator', url: 'https://www.rankhero.com/tools/etsy/title-generator' },
  { name: 'description-generator', url: 'https://www.rankhero.com/tools/etsy/description-generator' },
  { name: 'video-generator', url: 'https://www.rankhero.com/tools/etsy/video-generator' },
  { name: 'listing-studio', url: 'https://www.rankhero.com/tools/etsy/listing-studio' },
  { name: 'keyword-generator', url: 'https://www.rankhero.com/tools/keyword-generator' },
  { name: 'rankhero-ai', url: 'https://www.rankhero.com/tools/rankhero-ai' },
  { name: 'login', url: 'https://www.rankhero.com/auth/login' },
  { name: 'signup', url: 'https://www.rankhero.com/auth/signup' },
];

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function scrapePage(pageInfo) {
  const { name, url } = pageInfo;
  console.log(`\n📄 Scraping: ${name} (${url})`);
  
  try {
    const result = await app.scrapeUrl(url, {
      formats: ['markdown', 'html'],
    });
    
    // The SDK returns the result directly (not wrapped in .success)
    if (result && result.markdown) {
      // Save markdown
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${name}.md`),
        `<!-- Source: ${url} -->\n<!-- Scraped: ${new Date().toISOString()} -->\n\n${result.markdown}`
      );
      console.log(`  ✅ Markdown saved (${result.markdown.length} chars)`);
      
      // Save HTML
      if (result.html) {
        fs.writeFileSync(
          path.join(OUTPUT_DIR, `${name}.html`),
          `<!-- Source: ${url} -->\n<!-- Scraped: ${new Date().toISOString()} -->\n${result.html}`
        );
        console.log(`  ✅ HTML saved (${result.html.length} chars)`);
      }
      
      // Save metadata
      const meta = {
        url,
        name,
        scrapedAt: new Date().toISOString(),
        title: result.metadata?.title || '',
        description: result.metadata?.description || '',
        markdownLength: result.markdown?.length || 0,
        htmlLength: result.html?.length || 0,
      };
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${name}.meta.json`),
        JSON.stringify(meta, null, 2)
      );
      
      return { success: true, name, chars: result.markdown.length };
    } else {
      console.log(`  ❌ No markdown content returned`);
      console.log(`  Response keys:`, Object.keys(result || {}));
      return { success: false, name, error: 'No content' };
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    if (err.statusCode) console.log(`  Status: ${err.statusCode}`);
    return { success: false, name, error: err.message };
  }
}

async function main() {
  console.log('🔥 Firecrawl RankHero Scraper');
  console.log(`📁 Output: ${OUTPUT_DIR}`);
  console.log(`📄 Pages to scrape: ${PAGES.length}`);
  console.log('─'.repeat(50));
  
  const results = [];
  
  for (const page of PAGES) {
    const result = await scrapePage(page);
    results.push(result);
    
    // Small delay between requests
    await new Promise(r => setTimeout(r, 800));
  }
  
  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(50));
  
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Succeeded: ${succeeded.length}/${results.length}`);
  succeeded.forEach(s => console.log(`  ✓ ${s.name} (${s.chars} chars)`));
  
  if (failed.length > 0) {
    console.log(`❌ Failed: ${failed.map(f => f.name).join(', ')}`);
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '_summary.json'),
    JSON.stringify({ results, scrapedAt: new Date().toISOString() }, null, 2)
  );
  
  console.log(`\n📁 All data saved to: ${OUTPUT_DIR}`);
}

main().catch(console.error);
