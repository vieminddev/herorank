import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Forward console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('PAGE LOG ERROR:', msg.text());
  });
  page.on('pageerror', err => console.error('PAGE EXCEPTION:', err.message));

  console.log("=== STEP 1: AUTHENTICATION ===");
  await page.goto('http://localhost:5173/auth/signup');
  await page.waitForTimeout(4000); // Wait for Svelte hydration

  const randomStr = Math.random().toString(36).substring(7);
  const email = `audit_${randomStr}@example.com`;
  console.log(`Signing up test user with email: ${email}`);
  await page.fill('#signup-name', 'Audit Tester');
  await page.fill('#signup-email', email);
  await page.fill('#signup-password', 'Password123');
  await page.waitForTimeout(500);

  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button[type="submit"]')
  ]);
  console.log("Logged in and reached dashboard.");
  await page.waitForTimeout(3000); // Wait for dashboard load

  const pagesToCapture = [
    { name: 'dashboard', url: 'http://localhost:5173/dashboard' },
    { name: 'history', url: 'http://localhost:5173/history' },
    { name: 'notifications', url: 'http://localhost:5173/notifications' },
    { name: 'settings_connections', url: 'http://localhost:5173/settings/connections' },
    { name: 'settings_extension', url: 'http://localhost:5173/settings/extension' },
    { name: 'tool_shop_audit', url: 'http://localhost:5173/tools/etsy/shop-audit' },
    { name: 'tool_rank_tracker', url: 'http://localhost:5173/tools/etsy/rank-tracker' },
    { name: 'tool_title_gen', url: 'http://localhost:5173/tools/etsy/title-generator' },
    { name: 'tool_tag_gen', url: 'http://localhost:5173/tools/etsy/tag-generator' },
    { name: 'tool_desc_gen', url: 'http://localhost:5173/tools/etsy/description-generator' }
  ];

  const brainDir = 'C:\\Users\\huan\\.gemini\\antigravity-ide\\brain\\24db2e48-6bf1-41cf-a002-09d11d8a1ffb';

  for (const item of pagesToCapture) {
    console.log(`\n=== CAPTURING PAGE: ${item.name} ===`);
    
    // 1. Desktop view
    console.log(`Setting desktop viewport for ${item.name}...`);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(item.url, { waitUntil: 'networkidle', timeout: 15000 }).catch(e => console.log(`Timeout navigation to ${item.url}:`, e.message));
    await page.waitForTimeout(2000); // stable wait
    
    const deskPath = path.join(brainDir, `audit_desktop_${item.name}.png`);
    await page.screenshot({ path: deskPath });
    console.log(`Saved desktop screenshot: ${deskPath}`);

    // 2. Mobile view
    console.log(`Setting mobile viewport for ${item.name}...`);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    
    const mobPath = path.join(brainDir, `audit_mobile_${item.name}.png`);
    await page.screenshot({ path: mobPath });
    console.log(`Saved mobile screenshot: ${mobPath}`);
  }

  await browser.close();
  console.log("\n=== ALL SCREENSHOTS CAPTURED SUCCESSFULY! ===");
}

main().catch(err => {
  console.error("Layout verification failed:", err);
  process.exit(1);
});
