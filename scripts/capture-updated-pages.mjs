import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const sessionPath = "playwright-session.json";
const screenshotDir = "C:/Users/huan/.gemini/antigravity-ide/brain/d4a9e2ab-cc1c-445f-8f29-bea4626e3bf0/screenshots";

// Ensure screenshots folder exists
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  
  // Set up context with cookies from session file
  let cookies = [];
  if (fs.existsSync(sessionPath)) {
    const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    cookies = session.cookies || [];
  }
  
  // Clone cookies for both 127.0.0.1 and localhost
  const contextCookies = [];
  for (const cookie of cookies) {
    contextCookies.push({
      ...cookie,
      domain: "127.0.0.1"
    });
    contextCookies.push({
      ...cookie,
      domain: "localhost"
    });
  }

  const context = await browser.newContext();
  await context.addCookies(contextCookies);
  
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 960 });

  // Helper to wait and capture
  const capture = async (url, filename, actions = null) => {
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // Wait for Svelte hydration
    await page.waitForTimeout(3000);
    
    if (actions) {
      try {
        await actions(page);
      } catch (err) {
        console.error(`Actions failed for ${filename}:`, err);
      }
    }
    
    const screenshotPath = path.join(screenshotDir, filename);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Saved screenshot to ${screenshotPath}`);
  };

  // 1. Shop Audit
  await capture("http://127.0.0.1:3001/tools/etsy/shop-audit", "updated_shop_audit.png");

  // 2. Buyer Check with Interactive Demo click
  await capture("http://127.0.0.1:3001/tools/etsy/buyer-check", "updated_buyer_check_demo.png", async (p) => {
    // Click on "View Interactive Demo" button
    console.log("Clicking Interactive Demo button...");
    await p.click("button:has-text('View Interactive Demo')");
    await p.waitForTimeout(1000);
  });

  // 3. Listing Editor Loader
  await capture("http://127.0.0.1:3001/tools/etsy/listing-editor", "updated_listing_editor_loader.png");

  // 4. Listing Builder Stepper
  await capture("http://127.0.0.1:3001/tools/etsy/listing-builder", "updated_listing_builder.png");

  // 5. Connections Stepper
  await capture("http://127.0.0.1:3001/settings/connections", "updated_connections.png");

  await browser.close();
  console.log("Screenshot run finished.");
}

run().catch(console.error);
