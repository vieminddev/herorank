import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:5173';
const OUT = path.join(process.cwd(), 'screenshots', 'dashboard-review');

const PAGES = [
  ['01_dashboard', '/dashboard'],
  ['02_history', '/history'],
  ['03_notifications', '/notifications'],
  ['04_settings-connections', '/settings/connections'],
  ['05_settings-extension', '/settings/extension'],
  // tools/etsy
  ['06_etsy-ads-calculator', '/tools/etsy/ads-calculator'],
  ['07_etsy-best-sellers', '/tools/etsy/best-sellers'],
  ['08_etsy-buyer-check', '/tools/etsy/buyer-check'],
  ['09_etsy-chatgpt-optimizer', '/tools/etsy/chatgpt-optimizer'],
  ['10_etsy-compare', '/tools/etsy/compare'],
  ['11_etsy-description-generator', '/tools/etsy/description-generator'],
  ['12_etsy-trends', '/tools/etsy/etsy-trends'],
  ['13_etsy-image-studio', '/tools/etsy/image-studio'],
  ['14_etsy-listing-analyzer', '/tools/etsy/listing-analyzer'],
  ['15_etsy-listing-builder', '/tools/etsy/listing-builder'],
  ['16_etsy-listing-editor', '/tools/etsy/listing-editor'],
  ['17_etsy-listing-studio', '/tools/etsy/listing-studio'],
  ['18_etsy-my-shop', '/tools/etsy/my-shop'],
  ['19_etsy-niche-finder', '/tools/etsy/niche-finder'],
  ['20_etsy-profit-calculator', '/tools/etsy/profit-calculator'],
  ['21_etsy-rank-check', '/tools/etsy/rank-check'],
  ['22_etsy-rank-tracker', '/tools/etsy/rank-tracker'],
  ['23_etsy-review-requests', '/tools/etsy/review-requests'],
  ['24_etsy-seasonal-calendar', '/tools/etsy/seasonal-calendar'],
  ['25_etsy-shop-analyzer', '/tools/etsy/shop-analyzer'],
  ['26_etsy-shop-audit', '/tools/etsy/shop-audit'],
  ['27_etsy-tag-gap', '/tools/etsy/tag-gap'],
  ['28_etsy-tag-generator', '/tools/etsy/tag-generator'],
  ['29_etsy-title-experiment', '/tools/etsy/title-experiment'],
  ['30_etsy-title-generator', '/tools/etsy/title-generator'],
  ['31_etsy-video-generator', '/tools/etsy/video-generator'],
  ['32_etsy-watchlist', '/tools/etsy/watchlist'],
  // tools (non-etsy)
  ['33_keyword-bulk', '/tools/keyword-bulk'],
  ['34_keyword-generator', '/tools/keyword-generator'],
  ['35_keyword-lists', '/tools/keyword-lists'],
  ['36_rankhero-ai', '/tools/rankhero-ai'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`); });

  // ---- Signup fresh user ----
  const email = `review_${Date.now()}@example.com`;
  console.log('Signup:', email);
  await page.goto(`${BASE}/auth/signup`, { waitUntil: 'networkidle' });
  await sleep(2500);
  await page.fill('#signup-name', 'Review Bot');
  await page.fill('#signup-email', email);
  await page.fill('#signup-password', 'Password123');
  await sleep(500);
  try {
    await Promise.all([
      page.waitForURL('**/dashboard', { timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);
    console.log('Signed up, on dashboard.');
  } catch (e) {
    console.log('Signup did not redirect to /dashboard:', e.message, '— current URL:', page.url());
  }
  await sleep(1500);

  const report = [];
  for (const [name, route] of PAGES) {
    errors.length = 0;
    let status = 'ok';
    let finalUrl = '';
    try {
      const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(1200);
      finalUrl = page.url();
      if (finalUrl.includes('/auth/login')) status = 'REDIRECT_LOGIN';
      const httpStatus = resp ? resp.status() : '?';
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
      report.push({ name, route, httpStatus, status, finalUrl, errors: [...errors] });
      console.log(`✓ ${name} (${httpStatus}) ${status}${errors.length ? ' ⚠ ' + errors.length + ' err' : ''}`);
    } catch (e) {
      report.push({ name, route, status: 'NAV_FAIL', error: e.message, errors: [...errors] });
      console.log(`✗ ${name} FAILED: ${e.message}`);
    }
  }

  fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify({ email, pages: report }, null, 2));
  console.log('\nReport written to', path.join(OUT, '_report.json'));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
