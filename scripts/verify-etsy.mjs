/**
 * Manual Etsy API verification (Engineer F, BA spec §7.8).
 *
 * Run ONLY when a real Etsy keystring is present — NEVER in CI. It hits the real v3 API a few
 * times (one search, one shop, one shop-reviews), prints results + latency, and exits non-zero
 * with a clear message if the key is missing. It also flags response-shape drift so the fixtures
 * can be updated when Etsy approves the app.
 *
 * Usage:
 *   ETSY_API_KEY=xxxx node scripts/verify-etsy.mjs [shopName]
 *   # or put ETSY_API_KEY in .dev.vars and source it first.
 *
 * Plain JS (no $lib / TS) so it runs with bare `node`.
 */

const baseUrl = (process.env.ETSY_BASE_URL || 'https://openapi.etsy.com/v3/application').replace(/\/+$/, '');
const apiKey = process.env.ETSY_API_KEY || '';
const shopName = process.argv[2] || 'CaitlynMinimalist';

if (!apiKey) {
  console.error(
    '[verify-etsy] ETSY_API_KEY is required. This is a manual-only tool — set it in your shell or .dev.vars and re-run.'
  );
  process.exit(1);
}

const headers = { 'x-api-key': apiKey, accept: 'application/json' };

async function getJson(path) {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const ms = Date.now() - t0;
  if (!res.ok) {
    console.error(`[GET ${path}] FAILED ${res.status} in ${ms}ms`);
    return { ok: false, ms, status: res.status };
  }
  const json = await res.json();
  return { ok: true, ms, json };
}

/** Warn if expected documented fields are missing (fixture-drift detector). */
function expectFields(label, obj, fields) {
  const missing = fields.filter((f) => obj == null || obj[f] === undefined);
  if (missing.length) console.warn(`  [drift] ${label} missing fields: ${missing.join(', ')}`);
  else console.log(`  [shape] ${label} OK`);
}

async function main() {
  let ok = true;

  // 1. Search active listings.
  const search = await getJson('/listings/active?keywords=personalized%20necklace&limit=3&sort_on=score');
  if (search.ok) {
    console.log(`[findActiveListings] OK in ${search.ms}ms — count=${search.json.count}`);
    expectFields('listingPage', search.json, ['count', 'results']);
    if (search.json.results?.[0]) {
      expectFields('listing', search.json.results[0], ['listing_id', 'title', 'price', 'num_favorers']);
    }
  } else ok = false;

  // 2. Resolve shop by name + fetch shop.
  const found = await getJson(`/shops?shop_name=${encodeURIComponent(shopName)}&limit=1`);
  let shopId = null;
  if (found.ok && found.json.results?.[0]) {
    shopId = found.json.results[0].shop_id;
    console.log(`[findShops] OK in ${found.ms}ms — ${shopName} → shop_id=${shopId}`);
    expectFields('shop', found.json.results[0], ['shop_id', 'shop_name', 'review_count', 'created_timestamp']);
  } else {
    console.error(`[findShops] could not resolve "${shopName}"`);
    ok = false;
  }

  // 3. Shop reviews (the velocity signal).
  if (shopId) {
    const reviews = await getJson(`/shops/${shopId}/reviews?limit=5`);
    if (reviews.ok) {
      console.log(`[getReviewsByShop] OK in ${reviews.ms}ms — count=${reviews.json.count}`);
      if (reviews.json.results?.[0]) {
        expectFields('review', reviews.json.results[0], ['rating', 'created_timestamp']);
      }
    } else ok = false;
  }

  console.log('\nNOTE: Etsy quota is 10,000 calls/day. This script used ~3 calls.');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('[verify-etsy] error:', e?.message || e);
  process.exit(1);
});
