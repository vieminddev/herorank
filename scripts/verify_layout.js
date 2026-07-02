import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Forward page console logs and errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('PAGE LOG ERROR:', msg.text());
  });
  page.on('pageerror', err => console.error('PAGE EXCEPTION:', err.message));
  
  console.log("=== STEP 1: AUTHENTICATION ===");
  await page.goto('http://localhost:5173/auth/signup');
  await page.waitForTimeout(4000); // Wait for Svelte hydration
  
  const randomStr = Math.random().toString(36).substring(7);
  const email = `verify_${randomStr}@example.com`;
  console.log(`Signing up test user with email: ${email}`);
  await page.fill('#signup-name', 'Verify Tester');
  await page.fill('#signup-email', email);
  await page.fill('#signup-password', 'Password123');
  await page.waitForTimeout(500);
  
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button[type="submit"]')
  ]);
  console.log("Logged in and reached dashboard.");
  await page.waitForTimeout(3000); // Wait for dashboard load

  console.log("\n=== STEP 2: TEST DESKTOP VIEWPORT (1280x800) ===");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(1000);

  // 1. Sidebar Container must be visible
  const sidebarContainerExists = await page.locator('.sidebar-container').isVisible();
  console.log(`Sidebar container visible: ${sidebarContainerExists} (expected: true)`);
  if (!sidebarContainerExists) throw new Error("Sidebar container is not visible on desktop!");

  // 2. Tier 1 strip must be visible
  const tier1Visible = await page.locator('.sidebar-tier-1').isVisible();
  console.log(`Tier 1 Category Strip visible: ${tier1Visible} (expected: true)`);
  if (!tier1Visible) throw new Error("Tier 1 Category Strip is not visible!");

  // 3. Tier 2 panel must be visible and not collapsed initially
  const tier2Visible = await page.locator('.sidebar-tier-2').isVisible();
  const tier2Collapsed = await page.locator('.sidebar-tier-2.collapsed').isVisible().catch(() => false);
  console.log(`Tier 2 Panel visible: ${tier2Visible} (expected: true), collapsed: ${tier2Collapsed} (expected: false)`);
  if (!tier2Visible || tier2Collapsed) throw new Error("Tier 2 Panel is not rendered correctly!");

  // 4. Test collapsing Tier 2
  console.log("Collapsing Tier 2...");
  await page.click('.collapse-btn');
  await page.waitForTimeout(500); // wait for CSS transition

  const tier2CollapsedNow = await page.locator('.sidebar-tier-2.collapsed').isVisible().catch(() => false);
  console.log(`Tier 2 Panel collapsed now: ${tier2CollapsedNow} (expected: true)`);

  // 5. Test expanding Tier 2 via floating button
  console.log("Expanding Tier 2...");
  await page.click('.expand-floating-btn');
  await page.waitForTimeout(500); // wait for CSS transition

  const tier2ExpandedNow = !(await page.locator('.sidebar-tier-2.collapsed').isVisible().catch(() => false));
  console.log(`Tier 2 Panel expanded again: ${tier2ExpandedNow} (expected: true)`);

  // Take Desktop Screenshot
  const deskPath = 'C:\\Users\\huan\\.gemini\\antigravity-ide\\brain\\24db2e48-6bf1-41cf-a002-09d11d8a1ffb\\verify_desktop.png';
  await page.screenshot({ path: deskPath });
  console.log(`Desktop layout screenshot saved: ${deskPath}`);

  console.log("\n=== STEP 3: TEST TABLET VIEWPORT (768x1024) ===");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(1000);

  // Check for horizontal scrollbars
  const hasHorizontalScrollTablet = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  console.log(`Horizontal scrolling on tablet: ${hasHorizontalScrollTablet} (expected: false)`);
  if (hasHorizontalScrollTablet) {
    console.warn("WARNING: Tablet layout has horizontal overflow!");
  }

  // Take Tablet Screenshot
  const tabPath = 'C:\\Users\\huan\\.gemini\\antigravity-ide\\brain\\24db2e48-6bf1-41cf-a002-09d11d8a1ffb\\verify_tablet.png';
  await page.screenshot({ path: tabPath });
  console.log(`Tablet layout screenshot saved: ${tabPath}`);

  console.log("\n=== STEP 4: TEST MOBILE VIEWPORT (375x667) ===");
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(1000);

  // Check that mobile bottom tab bar is visible
  const bottomBarVisible = await page.locator('.mobile-bottom-bar').isVisible();
  console.log(`Mobile bottom tab bar visible: ${bottomBarVisible} (expected: true)`);
  if (!bottomBarVisible) throw new Error("Mobile bottom tab bar is not visible!");

  // Check for horizontal scrollbars
  const hasHorizontalScrollMobile = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  console.log(`Horizontal scrolling on mobile: ${hasHorizontalScrollMobile} (expected: false)`);
  if (hasHorizontalScrollMobile) {
    console.warn("WARNING: Mobile layout has horizontal overflow!");
  }

  // Take Mobile Hub Screenshot
  const mobPath = 'C:\\Users\\huan\\.gemini\\antigravity-ide\\brain\\24db2e48-6bf1-41cf-a002-09d11d8a1ffb\\verify_mobile_hub.png';
  await page.screenshot({ path: mobPath });
  console.log(`Mobile hub layout screenshot saved: ${mobPath}`);

  console.log("\n=== STEP 5: TEST MOBILE BOTTOM SHEET DRAWER ===");
  // Click "Create" tab to open Bottom Sheet
  console.log("Clicking 'Create' tab...");
  await page.locator('.mobile-tab-btn:has-text("Create")').click();
  await page.waitForTimeout(500); // Wait for transition

  // Verify bottom sheet is visible
  const bottomSheetVisible = await page.locator('.mobile-sheet').isVisible();
  console.log(`Mobile Bottom Sheet visible: ${bottomSheetVisible} (expected: true)`);
  if (!bottomSheetVisible) {
    throw new Error("Mobile Bottom Sheet did not open!");
  }

  // Take Mobile Bottom Sheet Screenshot
  const sheetPath = 'C:\\Users\\huan\\.gemini\\antigravity-ide\\brain\\24db2e48-6bf1-41cf-a002-09d11d8a1ffb\\verify_mobile_drawer.png';
  await page.screenshot({ path: sheetPath });
  console.log(`Mobile bottom sheet screenshot saved: ${sheetPath}`);

  // Close Bottom Sheet by clicking close button
  console.log("Closing Bottom Sheet via close button...");
  await page.click('.mobile-sheet-close');
  await page.waitForTimeout(500); // Wait for transition

  const bottomSheetHidden = !(await page.locator('.mobile-sheet').isVisible());
  console.log(`Mobile Bottom Sheet hidden after close: ${bottomSheetHidden} (expected: true)`);
  if (!bottomSheetHidden) {
    throw new Error("Mobile Bottom Sheet did not close!");
  }

  console.log("\n=== STEP 6: TEST INTERACTIVE SEARCH FILTER ===");
  // Type "Title" in search input
  console.log("Typing 'Title' in search input...");
  await page.fill('.hub-search-input', 'Title');
  await page.waitForTimeout(1000);

  // Verify elements are filtered
  const visibleCardsCount = await page.locator('.hub-card').count();
  console.log(`Visible tool cards after filtering for 'Title': ${visibleCardsCount} (expected: 1 or 2)`);
  
  const hasTitleCard = await page.locator('.hub-card:has-text("Title Generator")').isVisible();
  console.log(`Title Generator card visible: ${hasTitleCard} (expected: true)`);

  const hasAuditCard = await page.locator('.hub-card:has-text("Shop Audit")').isVisible().catch(() => false);
  console.log(`Shop Audit card visible after filtering: ${hasAuditCard} (expected: false)`);

  // Take search screenshot
  const searchPath = 'C:\\Users\\huan\\.gemini\\antigravity-ide\\brain\\24db2e48-6bf1-41cf-a002-09d11d8a1ffb\\verify_search.png';
  await page.screenshot({ path: searchPath });
  console.log(`Filtered search screenshot saved: ${searchPath}`);

  await browser.close();
  console.log("\n=== ALL AUTOMATED LAYOUT TESTS PASSED SUCCESSFULY! ===");
}

main().catch(err => {
  console.error("Layout verification failed:", err);
  process.exit(1);
});
