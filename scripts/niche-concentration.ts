/**
 * TRUE sales concentration for a niche — measures whether estimated sales are owned by a few
 * listings/shops (entrenched, hard to enter) or spread across many (beatable).
 *
 * Search dedups ~1 listing/shop, so page-1 shop counts are meaningless (see niche-depth caveat).
 * Instead we estimate NICHE-SPECIFIC sales per listing the way VieRank does — per-listing review
 * velocity (reviews in trailing 90d) ÷ category review-rate → monthly sales — then compute the
 * distribution (top-share, HHI, Gini) across the top listings. Reuses the real `salesEstimate`
 * (zero drift) and the cron's `reviews90dFromSample` extrapolation (copied verbatim).
 *
 * Run: npx tsx scripts/niche-concentration.ts   (writes scripts/out/niche-concentration.md)
 * ~3 searches + 3×40 listing-review calls ≈ 123 calls via 8mh6 (gentle, ~30s).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { salesEstimate } from '../src/lib/server/services/estimation/index';
import { createPool } from './pool';

const pool = createPool();

const NICHES = process.argv.slice(2).length ? process.argv.slice(2) : ['slip casting bowl mold', 'mushroom planter', 'plaster planter mold'];
const TOPN = 40;
const BASE = 'https://openapi.etsy.com/v3/application';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadDevVars(): Record<string, string> {
  const raw = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
// verbatim copy of cron's reviews90dFromSample (refresh.ts) — cadence extrapolation when saturated.
function reviews90dFromSample(timestamps: number[], nowSec: number, sampleLimit = 100): number {
  const ts = timestamps.filter((t) => Number.isFinite(t)).sort((a, b) => b - a);
  if (ts.length === 0) return 0;
  const cutoff = nowSec - 90 * 86_400;
  const within90 = ts.filter((t) => t >= cutoff).length;
  if (ts.length < sampleLimit || within90 < ts.length) return within90;
  const spanDays = Math.max(1, (ts[0] - ts[ts.length - 1]) / 86_400);
  return Math.round((ts.length / spanDays) * 90);
}
function priceDollars(l: any): number {
  const p = l.price; if (!p || !p.divisor) return 0;
  return p.amount / p.divisor;
}
function hhi(shares: number[]): number { return Math.round(shares.reduce((a, s) => a + s * s, 0) * 10000); }
function gini(values: number[]): number {
  const x = [...values].filter((v) => v >= 0).sort((a, b) => a - b);
  const n = x.length; const sum = x.reduce((a, b) => a + b, 0);
  if (n === 0 || sum === 0) return 0;
  let cum = 0; for (let i = 0; i < n; i++) cum += (i + 1) * x[i];
  return Math.round(((2 * cum) / (n * sum) - (n + 1) / n) * 100) / 100;
}

interface Ls { niche: string; listingId: number; shopId: number; price: number; taxonomyId: number | null; favorers: number; }

async function main() {
  const nowSec = Math.floor(Date.now() / 1000);
  console.error(`Pool keys: ${pool.keyIds.join(', ')}`);

  // 1) gather top-N listings per niche
  const tasks: Ls[] = [];
  const totalCount: Record<string, number> = {};
  for (const kw of NICHES) {
    const rs = await pool.get(`/listings/active?keywords=${encodeURIComponent(kw)}&sort_on=score&limit=${TOPN}`);
    if (!rs.ok) { console.error(`${kw}: search HTTP ${rs.status}`); continue; }
    const j: any = rs.json;
    totalCount[kw] = j.count ?? 0;
    for (const l of (j.results ?? []).slice(0, TOPN)) {
      tasks.push({ niche: kw, listingId: l.listing_id, shopId: l.shop_id, price: priceDollars(l), taxonomyId: l.taxonomy_id ?? null, favorers: l.num_favorers ?? 0 });
    }
    console.error(`${kw}: ${j.count} total, pulled ${Math.min(TOPN, (j.results ?? []).length)} listings`);
  }

  // 2) per-listing review velocity → monthly sales (pooled, gentle)
  const sales = new Map<number, { monthly: number; reviews90: number }>();
  let done = 0;
  async function fetchOne(t: Ls) {
    try {
      const rr = await pool.get(`/listings/${t.listingId}/reviews?limit=100`);
      if (!rr.ok) { sales.set(t.listingId, { monthly: 0, reviews90: 0 }); return; }
      const ts = (rr.json?.results ?? []).map((r: any) => r.created_timestamp).filter((x: any) => typeof x === 'number');
      const r90 = reviews90dFromSample(ts, nowSec, 100);
      const est = salesEstimate({ reviewsLast90d: r90, categoryId: t.taxonomyId, avgPrice: t.price });
      sales.set(t.listingId, { monthly: est.monthlySales, reviews90: r90 });
    } catch { sales.set(t.listingId, { monthly: 0, reviews90: 0 }); }
    finally { if (++done % 20 === 0) console.error(`  reviews ${done}/${tasks.length}`); }
  }
  let cursor = 0;
  await Promise.all(Array.from({ length: 5 }, async () => { while (cursor < tasks.length) await fetchOne(tasks[cursor++]); }));

  // 3) concentration per niche
  const blocks: string[] = [];
  for (const kw of NICHES) {
    const items = tasks.filter((t) => t.niche === kw).map((t) => ({ ...t, ...(sales.get(t.listingId) ?? { monthly: 0, reviews90: 0 }) }));
    const monthly = items.map((i) => i.monthly);
    const total = monthly.reduce((a, b) => a + b, 0);
    const sorted = [...items].sort((a, b) => b.monthly - a.monthly);
    const share = (n: number) => total > 0 ? Math.round((100 * sorted.slice(0, n).reduce((a, b) => a + b.monthly, 0)) / total) : 0;
    const deadPct = Math.round((100 * items.filter((i) => i.reviews90 === 0).length) / (items.length || 1));
    // by shop
    const byShop = new Map<number, number>();
    for (const i of items) byShop.set(i.shopId, (byShop.get(i.shopId) ?? 0) + i.monthly);
    const shopShares = [...byShop.values()].map((v) => total > 0 ? v / total : 0);
    const topShop = total > 0 ? Math.round(100 * Math.max(...byShop.values()) / total) : 0;
    const h = total > 0 ? hhi(monthly.map((m) => m / total)) : 0;
    const g = gini(monthly);
    const verdict = deadPct >= 60
      ? 'CẦU MỎNG (đa số listing ~0 sales — ngách nhỏ, cẩn trọng)'
      : (share(3) >= 60 || h >= 2500)
        ? 'ĐẶC — vài listing/shop nuốt doanh số (khó chen)'
        : (share(3) <= 40 && h < 1500)
          ? 'RẢI — doanh số trải đều, dễ chen chân'
          : 'VỪA';
    blocks.push([
      `## ${kw}  (${(totalCount[kw] ?? 0).toLocaleString()} listing tổng)`,
      ``,
      `- **Doanh số ước tính top ${items.length} listing:** ~**${total.toLocaleString()} đơn/tháng** cộng lại.`,
      `- **Tập trung:** top-1 ${share(1)}% · top-3 ${share(3)}% · top-5 ${share(5)}% tổng doanh số.`,
      `- **HHI ${h}** (${h >= 2500 ? 'đặc' : h >= 1500 ? 'vừa' : 'rải'}) · **Gini ${g}** (${g >= 0.6 ? 'lệch mạnh' : g >= 0.4 ? 'lệch vừa' : 'đều'}).`,
      `- **Listing ~0 sales (reviews 90d = 0):** ${deadPct}% ${deadPct >= 50 ? '→ phần lớn đối thủ thực chất KHÔNG bán được' : ''}`,
      `- **Theo shop:** ${byShop.size} shop; shop mạnh nhất giữ ${topShop}% doanh số.`,
      `- **Top 3 listing (đơn/tháng ước tính):** ${sorted.slice(0, 3).map((i) => `shop#${i.shopId}=${i.monthly}`).join(' · ')}`,
      `- **⇒ ${verdict}**`,
      ``,
    ].join('\n'));
    console.error(`${kw}: total ${total}/mo, top3 ${share(3)}%, HHI ${h}, dead ${deadPct}% → ${verdict}`);
  }

  const md = `# True sales concentration — top 3 niches (${new Date().toISOString().slice(0, 10)})\n\n` +
    `Doanh số/tháng ước tính per-listing = (reviews 90d ÷ 3) ÷ category review-rate, đúng công thức salesEstimate của VieRank (là ƯỚC LƯỢNG). Chỉ số tập trung tính trên top ${TOPN} listing/ngách.\n\n` + blocks.join('\n');
  writeFileSync(new URL('./out/niche-concentration.md', import.meta.url), md, 'utf8');
  console.error('\nWrote scripts/out/niche-concentration.md');
  console.log(md);
}
main().catch((e) => { console.error(e); process.exit(1); });
