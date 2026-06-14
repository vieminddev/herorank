import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const BASE_URL = 'http://localhost:5173';
const SESSION_FILE = path.join(process.cwd(), 'playwright-session.json');
const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');

const PAGES = [
  { name: '00_landing-page', path: '/' },
  { name: '01_dashboard', path: '/dashboard' },
  { name: '02_tag-generator', path: '/tools/etsy/tag-generator' },
  { name: '03_title-generator', path: '/tools/etsy/title-generator' },
  { name: '04_description-generator', path: '/tools/etsy/description-generator' },
  { name: '05_keyword-generator', path: '/tools/keyword-generator' },
  { name: '06_rankhero-ai', path: '/tools/rankhero-ai' },
  { name: '07_shop-analyzer', path: '/tools/etsy/shop-analyzer' },
  { name: '08_listing-analyzer', path: '/tools/etsy/listing-analyzer' },
  { name: '09_rank-check', path: '/tools/etsy/rank-check' },
  { name: '10_niche-finder', path: '/tools/etsy/niche-finder' },
  { name: '11_best-sellers', path: '/tools/etsy/best-sellers' },
  { name: '12_etsy-trends', path: '/tools/etsy/etsy-trends' },
  { name: '13_buyer-check', path: '/tools/etsy/buyer-check' },
  { name: '14_profit-calculator', path: '/tools/etsy/profit-calculator' },
  { name: '15_listing-studio', path: '/tools/etsy/listing-studio' },
  { name: '16_video-generator', path: '/tools/etsy/video-generator' },
  { name: '17_settings-connections', path: '/settings/connections' },
  { name: '18_pricing', path: '/pricing' },
  { name: '19_login', path: '/auth/login' },
  { name: '20_signup', path: '/auth/signup' }
];

async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

async function main() {
  const forceLogin = process.argv.includes('--login') || process.argv.includes('-l');
  let sessionExists = fs.existsSync(SESSION_FILE);

  if (forceLogin && sessionExists) {
    console.log('🔄 Force login flag detected. Deleting old session...');
    fs.unlinkSync(SESSION_FILE);
    sessionExists = false;
  }

  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  let browser;
  let context;

  if (!sessionExists) {
    console.log('\n==================================================');
    console.log('🔐 HERO RANK SCREENSHOT UTILITY - AUTO-LOGIN');
    console.log('==================================================');
    console.log('Logging in automatically with viemminddev@gmail.com...');

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/auth/login`);

    // Fill login form
    await page.fill('#login-email', 'viemminddev@gmail.com');
    await page.fill('#login-password', '@Sky09052002');
    await page.click('button[type="submit"]');

    // Wait for redirection to dashboard
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
      console.log('✅ Logged in successfully!');
    } catch (e) {
      console.error('❌ Failed to login automatically. Please verify credentials or site status.');
      await browser.close();
      process.exit(1);
    }

    // Save session
    await context.storageState({ path: SESSION_FILE });
    console.log(`✅ Session saved to ${SESSION_FILE}`);
    await browser.close();
  }

  console.log('\n📸 Starting screenshots in headless mode...');
  
  // Launch in headless mode to take screenshots
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    storageState: SESSION_FILE,
    viewport: { width: 1440, height: 900 },
    // Custom header to bypass potential rate limits if configured (matching E2E tests)
    extraHTTPHeaders: {
      'x-bypass-rate-limit': 'herorank-e2e-bypass-token'
    }
  });

  const page = await context.newPage();

  for (const item of PAGES) {
    const targetUrl = `${BASE_URL}${item.path}`;
    console.log(`📷 Capturing ${item.name} (${targetUrl})...`);
    try {
      await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
      
      // Wait for network to settle a bit (some dashboard apps make client-side requests)
      try {
        await page.waitForLoadState('networkidle', { timeout: 3000 });
      } catch (e) {
        // networkidle timeout is fine, we just wait a bit anyway
      }

      // Additional delay to ensure layout is settled and animations finished
      await page.waitForTimeout(2000);

      if (item.path === '/') {
        console.log(`  📜 Scrolling down to trigger intersection observers...`);
        await page.evaluate(async () => {
          await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 120;
            const timer = setInterval(() => {
              const scrollHeight = document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;
              if (totalHeight >= scrollHeight) {
                clearInterval(timer);
                resolve();
              }
            }, 60);
          });
        });
        // Scroll back to top to take the screenshot
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(1500);
      }

      const filePath = path.join(SCREENSHOTS_DIR, `${item.name}.png`);
      await page.screenshot({ path: filePath, fullPage: item.path === '/' });
      console.log(`  ✅ Saved: ${filePath}`);
    } catch (error) {
      console.error(`  ❌ Failed to capture ${item.name}:`, error.message);
    }
  }

  await browser.close();
  console.log('\n🎉 Done! All screenshots saved in the "screenshots" folder.');
}

main().catch(console.error);
