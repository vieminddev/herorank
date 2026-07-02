import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Forward page console logs and errors
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
  
  // Set viewport to a nice laptop resolution
  await page.setViewportSize({ width: 1280, height: 800 });
  
  // Go to signup page
  console.log("Navigating to signup...");
  await page.goto('http://localhost:5173/auth/signup');
  
  // Wait 5 seconds for hydration and Vite connection to stabilize
  console.log("Waiting for Svelte hydration...");
  await page.waitForTimeout(5000);
  
  // Try to sign up with a unique random email
  const randomStr = Math.random().toString(36).substring(7);
  const email = `test_${randomStr}@example.com`;
  
  console.log(`Signing up with email: ${email}`);
  await page.fill('#signup-name', 'Test User');
  await page.fill('#signup-email', email);
  await page.fill('#signup-password', 'Password123');
  
  // Wait a moment after filling to ensure state is updated
  await page.waitForTimeout(1000);
  
  console.log("Submitting signup form...");
  try {
    await Promise.all([
      page.waitForURL('**/dashboard', { timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);
    console.log("Reached dashboard successfully!");
    
    // Wait for Svelte content to load
    await page.waitForTimeout(5000);
    
    // Take screenshot of dashboard
    const screenshotPath = 'C:\\Users\\huan\\.gemini\\antigravity-ide\\brain\\24db2e48-6bf1-41cf-a002-09d11d8a1ffb\\dashboard_screenshot.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log("Screenshot saved to", screenshotPath);
  } catch (err) {
    console.error("Navigation/operation failed, taking error screenshot...", err);
    const errScreenshotPath = 'C:\\Users\\huan\\.gemini\\antigravity-ide\\brain\\24db2e48-6bf1-41cf-a002-09d11d8a1ffb\\error_screenshot.png';
    await page.screenshot({ path: errScreenshotPath });
    console.log("Error screenshot saved to", errScreenshotPath);
    
    // Also print the page source or state
    const bodyText = await page.innerText('body');
    console.log("=== PAGE BODY TEXT ===");
    console.log(bodyText);
    console.log("======================");
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error("Error running script:", err);
  process.exit(1);
});
