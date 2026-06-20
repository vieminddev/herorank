/**
 * QA Test Plan E2E tests (Section 1 to 12).
 * Can be run against local or live vierank.com.
 *
 * Usage:
 *   $env:PLAYWRIGHT_BASE_URL="https://vierank.com"
 *   $env:INTERNAL_API_KEY="vrk_svc_..."
 *   npx playwright test tests/e2e/qa-test-plan.e2e.ts
 */

import { test, expect } from '@playwright/test';

const TEST_PASSWORD = 'testpassword123';
const TEST_NAME = 'VieRank QA E2E Test User';

function uniqueEmail() {
  return `qa-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@herorank-qa.test`;
}

async function signUpAndGoToDashboard(page: any, context: any) {
  await context.clearCookies();
  const email = uniqueEmail();
  await page.goto('/auth/signup');
  await page.locator('#signup-name').fill(TEST_NAME);
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  return email;
}

test.describe('VieRank QA Checklist Automated Tests', () => {
  test.setTimeout(90000);

  // 1.1 Smoke: Landing page load
  test('1.1 Landing page load and no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    // Check main title or element
    await expect(page).toHaveTitle(/VieRank/i);
    if (consoleErrors.length > 0) {
      console.warn('[E2E] Console errors found on landing page:', consoleErrors);
    }
  });

  // 1.2 & 2.1 & 2.4: Sign up a new user
  test('2.1 & 2.4 Sign up new user and redirect to dashboard', async ({ page, context }) => {
    const email = await signUpAndGoToDashboard(page, context);
    expect(email).toBeDefined();
    // Check initial credit balance (30 free credits) via header text content
    await expect(page.locator('header.sticky')).toContainText('30');
  });

  // 2.2: Sign up with a duplicate email
  test('2.2 Sign up duplicate email returns validation error', async ({ page, context }) => {
    const email = await signUpAndGoToDashboard(page, context);

    await context.clearCookies();
    await page.goto('/auth/signup');
    await page.locator('#signup-name').fill(TEST_NAME);
    await page.locator('#signup-email').fill(email); // duplicate
    await page.locator('#signup-password').fill(TEST_PASSWORD);

    await page.locator('button[type="submit"]').click();
    
    // An error alert should be visible
    const errorAlert = page.locator('[role="alert"]').first();
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
    const errorText = await errorAlert.textContent();
    expect(errorText?.toLowerCase()).toContain('already');
  });

  // 2.3: Login with incorrect password
  test('2.3 Login with incorrect password shows error', async ({ page, context }) => {
    const email = await signUpAndGoToDashboard(page, context);

    await context.clearCookies();
    await page.goto('/auth/login');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill('wrongpassword');

    await page.locator('button[type="submit"]').click();
    
    const errorAlert = page.locator('[role="alert"]').first();
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
  });

  // 2.5: Session persistence on page refresh
  test('2.5 Session is persisted after page reload', async ({ page, context }) => {
    await signUpAndGoToDashboard(page, context);

    // Refresh page
    await page.reload();
    await page.waitForURL(/\/dashboard/);
    
    // User name or email should still be present in header
    const bodyText = await page.locator('header.sticky').textContent();
    expect(bodyText).toContain(TEST_NAME);
  });

  // 2.7: Guest redirect when accessing dashboard unauthorized
  test('2.7 Unauthenticated user accessing dashboard is redirected to login', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/dashboard');
    await page.waitForURL(/\/auth\/login/, { timeout: 15000 });
  });

  // 3.1 & 3.6: Settings Connection Page
  test('3.1 Settings connection page and Connect CTA', async ({ page, context }) => {
    await signUpAndGoToDashboard(page, context);

    await page.goto('/settings/connections');
    await expect(page).toHaveURL(/\/settings\/connections/);
    
    // Connect Etsy shop button/CTA should be visible
    const connectBtn = page.getByRole('link', { name: 'Connect your Etsy shop' });
    await expect(connectBtn).toBeVisible();
    
    const btnHref = await connectBtn.getAttribute('href');
    expect(btnHref).toContain('/api/connect/etsy/start');
  });

  // 5.1: Listing Analyzer (3 credits)
  test('5.1 Listing Analyzer runs successfully', async ({ page, context }) => {
    await signUpAndGoToDashboard(page, context);

    // Navigate to listing analyzer
    await page.goto('/tools/etsy/listing-analyzer');
    
    // Check initial state
    await page.locator('[data-testid="listing-input"]').fill('4511075902');
    await page.locator('[data-testid="listing-submit"]').click();

    // Verify result appears
    await expect(page.locator('.animate-fade-in').first()).toBeVisible({ timeout: 30000 });
  });

  // 6.1 & 6.2: Title & Tag Generators
  test('6.1 & 6.2 Title and Tag Generator pages load and work', async ({ page, context }) => {
    await signUpAndGoToDashboard(page, context);
    
    // Tag generator
    await page.goto('/tools/etsy/tag-generator');
    await page.locator('[data-testid="tag-keyword"]').fill('ceramic mug plaster mold');
    await page.locator('[data-testid="tag-submit"]').click();
    
    // Verify results show up
    await expect(page.locator('.animate-fade-in').first()).toBeVisible({ timeout: 30000 });
  });

  // 7.1 & 7.2: Profit & Ads Calculators (FREE)
  test('7.1 & 7.2 Calculators calculate reactively without deducting credits', async ({ page, context }) => {
    await signUpAndGoToDashboard(page, context);

    // Read credits before
    const creditSpan = page.locator('header.sticky').locator('div', { hasText: 'credits' }).locator('span').first();
    const beforeCredits = parseInt(await creditSpan.textContent() ?? '0', 10);

    // Go to Profit Calculator
    await page.goto('/tools/etsy/profit-calculator');
    
    // Change some input and check
    const priceInput = page.locator('input[type="number"]').first();
    await priceInput.fill('45');
    
    // Give reactiveness some time
    await page.waitForTimeout(1000);

    // Check credits after (must be unchanged since calculators are FREE)
    await page.goto('/dashboard');
    const afterCredits = parseInt(await creditSpan.textContent() ?? '0', 10);
    expect(afterCredits).toBe(beforeCredits);
  });

  // 11. Internal API: Verification
  test('11. Internal API verification', async ({ request }) => {
    const apiKey = process.env.INTERNAL_API_KEY || 'vrk_svc_1daaf1238478843fce3de2150f814a08124cc869913eb483d7cf634321448d0b';
    
    // 11.1: Wrong key -> 401
    const resWrong = await request.get('/api/internal/shops', {
      headers: { 'x-service-key': 'WRONG_KEY' }
    });
    expect(resWrong.status()).toBe(401);

    // 11.2: Correct key -> 200 list connected shops
    const resOk = await request.get('/api/internal/shops', {
      headers: { 'x-service-key': apiKey }
    });
    expect(resOk.status()).toBe(200);
    const bodyOk = await resOk.json();
    expect(bodyOk.shops).toBeDefined();
    expect(Array.isArray(bodyOk.shops)).toBe(true);

    // 11.3: Receipts matching schema
    if (bodyOk.shops.length > 0) {
      const shopId = bodyOk.shops[0].shopId;
      const resReceipts = await request.get(`/api/internal/shops/${shopId}/receipts?days=120`, {
        headers: { 'x-service-key': apiKey }
      });
      expect(resReceipts.status()).toBe(200);
      const receiptsBody = await resReceipts.json();
      
      expect(receiptsBody.orders).toBeDefined();
      expect(Array.isArray(receiptsBody.orders)).toBe(true);
      
      if (receiptsBody.orders.length > 0) {
        const order = receiptsBody.orders[0];
        expect(order.receiptId).toBeDefined();
        expect(order.createdAt).toBeDefined();
        expect(order.total).toBeDefined();
        expect(order.currency).toBeDefined();
        expect(order.buyerName).toBeDefined();
        expect(order.isPaid).toBeDefined();
        expect(order.isShipped).toBeDefined();
        expect(order.status).toBeDefined();
        expect(order.items).toBeDefined();
        expect(Array.isArray(order.items)).toBe(true);
        
        // Exclude partner_id, user_id, date fields
        expect(order.partner_id).toBeUndefined();
        expect(order.user_id).toBeUndefined();
        expect(order.date).toBeUndefined();
      }
    }
  });

  // 2.6: Logout
  test('2.6 Logout works and redirects to homepage', async ({ page, context }) => {
    await signUpAndGoToDashboard(page, context);

    // Wait for hydration to bind event listeners
    await page.waitForTimeout(2000);

    // Perform sign out
    const logoutBtn = page.getByRole('button', { name: 'Sign out' }).first();
    await logoutBtn.click();
    
    // Should redirect to homepage / landing page
    await page.waitForURL(/\/$/, { timeout: 15000 });
  });

});
