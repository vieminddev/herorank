/**
 * Evaluate ONE product idea end-to-end. Runs the full VieRank niche pipeline on a keyword cluster:
 *   scan (demand/supply/views/price/whitespace) + page-1 depth (age, tags, personalization,
 *   materials, view concentration) for every keyword; then for the top-2 keywords by demand,
 *   per-listing review→sales concentration + competing-shop lifetime sales.
 * Reuses real demandScore + salesEstimate (no drift); whitespace/reviews90d copied verbatim.
 * Etsy access via the BACKGROUND key pool (scripts/pool.ts), NOT the 8mh6 seller key.
 *
 * Configure the cluster via CLI: npx tsx scripts/eval-product.ts "kw one" "kw two" ...
 * Default cluster = the first-birthday-plate idea. Writes scripts/out/eval-<slug>.md
 */
import { writeFileSync } from 'node:fs';
import { demandScore, salesEstimate } from '../src/lib/server/services/estimation/index';
import { createPool } from './pool';

const DEFAULT_CLUSTER = [
  'first birthday plate', '1st birthday plate', 'cake smash plate', 'first birthday keepsake',
  'personalized birthday plate kids', 'happy birthday plate', 'one plate first birthday',
  'ceramic birthday plate personalized', 'baby first birthday gift', 'birthday plate for kids',
];
const CLUSTER = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_CLUSTER;
const SLUG = (CLUSTER[0] || 'product').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const pool = createPool();

function median(xs: number[]): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }
function pctl(xs: number[], p: number): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]; }
function whitespaceScore(i: { demandIndex: number; resultCount: number; newListings7d: number }): number {
  const S = 200_000; const sp = i.resultCount > 0 ? (25 * Math.log10(1 + i.resultCount)) / Math.log10(1 + S) : 0;
  const ev = Math.min(25, Math.max(0, i.newListings7d) * 2); return Math.max(0, Math.min(100, Math.round(i.demandIndex - sp - ev)));
}
function reviews90dFromSample(t: number[], nowSec: number, lim = 100): number {
  const ts = t.filter((x) => Number.isFinite(x)).sort((a, b) => b - a); if (!ts.length) return 0;
  const c = nowSec - 90 * 86_400; const w = ts.filter((x) => x >= c).length;
  if (ts.length < lim || w < ts.length) return w;
  const span = Math.max(1, (ts[0] - ts[ts.length - 1]) / 86_400); return Math.round((ts.length / span) * 90);
}
function priceD(l: any): number { const p = l.price; return p && p.divisor ? p.amount / p.divisor : 0; }
function hhi(sh: number[]): number { return Math.round(sh.reduce((a, s) => a + s * s, 0) * 10000); }

async function search(kw: string, limit: number): Promise<{ count: number; results: any[] }> {
  const r = await pool.get(`/listings/active?keywords=${encodeURIComponent(kw)}&sort_on=score&limit=${limit}`);
  if (!r.ok) throw new Error(`search ${kw} HTTP ${r.status}`);
  return r.json as any;
}

async function main() {
  const nowSec = Math.floor(Date.now() / 1000);
  console.error(`Pool keys: ${pool.keyIds.join(', ')} | cluster: ${CLUSTER.length} kw`);

  interface Scan { kw: string; demand: number; supply: number; medViews: number; price: number; ws: number; medAgeDays: number; pctNew90: number; pctOld2y: number; tagsAvg: number; pctPersonalize: number; pctVariations: number; mats: string; vConc: string; }
  const scans: Scan[] = [];
  for (const kw of CLUSTER) {
    try {
      const j = await search(kw, 48);
      const L = j.results ?? []; const supply = j.count ?? L.length;
      const sample = L.slice(0, 25);
      const faves = sample.reduce((a: number, l: any) => a + (l.num_favorers ?? 0), 0);
      const views = sample.reduce((a: number, l: any) => a + (l.views ?? 0), 0);
      const d = demandScore({ resultCount: supply, aggregateReviewVelocity: Math.round(faves / 1000), favoritesSignal: faves, aggregateViews: views });
      const medViews = median(sample.map((l: any) => l.views ?? 0));
      const weekAgo = nowSec - 7 * 86_400;
      const nl7 = sample.filter((l: any) => typeof l.created_timestamp === 'number' && l.created_timestamp >= weekAgo).length;
      const ws = whitespaceScore({ demandIndex: d.score, resultCount: supply, newListings7d: nl7 });
      const ages = L.map((l: any) => l.original_creation_timestamp ?? l.created_timestamp).filter((t: any) => typeof t === 'number').map((t: number) => (nowSec - t) / 86400);
      const vAll = L.map((l: any) => l.views ?? 0);
      const matC = new Map<string, number>(); for (const l of L) for (const m of (l.materials ?? [])) matC.set(String(m).toLowerCase(), (matC.get(String(m).toLowerCase()) ?? 0) + 1);
      scans.push({
        kw, demand: d.score, supply, medViews, price: median(L.map(priceD).filter((x: number) => x > 0).map((x: number) => Math.round(x * 100))) / 100, ws,
        medAgeDays: Math.round(median(ages)), pctNew90: Math.round(100 * ages.filter((x: number) => x <= 90).length / (ages.length || 1)), pctOld2y: Math.round(100 * ages.filter((x: number) => x >= 730).length / (ages.length || 1)),
        tagsAvg: Math.round(10 * L.reduce((a: number, l: any) => a + (l.tags?.length ?? 0), 0) / (L.length || 1)) / 10,
        pctPersonalize: Math.round(100 * L.filter((l: any) => l.is_personalizable).length / (L.length || 1)),
        pctVariations: Math.round(100 * L.filter((l: any) => l.has_variations).length / (L.length || 1)),
        mats: [...matC.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m, c]) => `${m}(${c})`).join(', '),
        vConc: median(vAll) > 0 ? (pctl(vAll, 0.9) / median(vAll)).toFixed(1) : '—',
      });
      console.error(`${kw}: demand ${d.score} supply ${supply} medViews ${medViews} ws ${ws}`);
    } catch (e) { console.error(`${kw}: ${(e as Error).message}`); }
  }

  const primaries = scans.filter((s) => s.supply >= 150).sort((a, b) => b.demand - a.demand).slice(0, 2);
  const deep: string[] = [];
  for (const p of primaries) {
    const j = await search(p.kw, 40); const L = (j.results ?? []).slice(0, 40);
    const listings = L.map((l: any) => ({ id: l.listing_id, shop: l.shop_id, price: priceD(l), tax: l.taxonomy_id ?? null }));
    const est = new Map<number, { monthly: number; r90: number }>();
    let cur = 0;
    await Promise.all(Array.from({ length: 5 }, async () => {
      while (cur < listings.length) {
        const t = listings[cur++];
        const r = await pool.get(`/listings/${t.id}/reviews?limit=100`);
        if (!r.ok) { est.set(t.id, { monthly: 0, r90: 0 }); continue; }
        const ts = (r.json?.results ?? []).map((x: any) => x.created_timestamp).filter((x: any) => typeof x === 'number');
        const r90 = reviews90dFromSample(ts, nowSec, 100);
        est.set(t.id, { monthly: salesEstimate({ reviewsLast90d: r90, categoryId: t.tax, avgPrice: t.price }).monthlySales, r90 });
      }
    }));
    const monthly = listings.map((l) => est.get(l.id)?.monthly ?? 0); const total = monthly.reduce((a, b) => a + b, 0);
    const sorted = [...listings].sort((a, b) => (est.get(b.id)?.monthly ?? 0) - (est.get(a.id)?.monthly ?? 0));
    const share = (n: number) => total > 0 ? Math.round(100 * sorted.slice(0, n).reduce((a, b) => a + (est.get(b.id)?.monthly ?? 0), 0) / total) : 0;
    const dead = Math.round(100 * listings.filter((l) => (est.get(l.id)?.r90 ?? 0) === 0).length / (listings.length || 1));
    const H = total > 0 ? hhi(monthly.map((m) => m / total)) : 0;
    const shopIds = [...new Set(listings.map((l) => l.shop))]; const shops = new Map<number, any>(); let sc = 0;
    await Promise.all(Array.from({ length: 5 }, async () => {
      while (sc < shopIds.length) {
        const id = shopIds[sc++];
        const r = await pool.get(`/shops/${id}`);
        if (!r.ok) { shops.set(id, null); continue; }
        const s = r.json; shops.set(id, { name: s.shop_name ?? `#${id}`, sold: s.transaction_sold_count ?? 0, reviews: s.review_count ?? 0 });
      }
    }));
    const svals = [...shops.values()].filter(Boolean); const soldArr = svals.map((s) => s.sold);
    const big = svals.filter((s) => s.sold >= 10_000).length; const small = svals.filter((s) => s.sold < 500).length;
    const topShops = svals.sort((a, b) => b.sold - a.sold).slice(0, 8);
    deep.push([
      `### 🔎 ${p.kw}  (${p.supply.toLocaleString()} listing tổng)`,
      `- Doanh số ước tính top 40: **~${total}/tháng** cộng lại · top-1 ${share(1)}% · top-3 ${share(3)}% · HHI ${H} · listing ~0 sales ${dead}%`,
      `- Shop trọn đời (THẬT, toàn shop): trung vị **${median(soldArr).toLocaleString()}**, cao nhất **${Math.max(...soldArr, 0).toLocaleString()}**; ${big} shop ≥10k · ${small} shop <500`,
      `- Top shop (lifetime sales / reviews): ${topShops.map((s) => `${s.name} ${s.sold.toLocaleString()}/${s.reviews}`).join(' · ')}`,
      ``,
    ].join('\n'));
    console.error(`DEEP ${p.kw}: est ${total}/mo, top3 ${share(3)}%, shopMax ${Math.max(...soldArr, 0)}, big ${big}`);
  }

  const tbl = scans.sort((a, b) => b.demand - a.demand).map((s) =>
    `| ${s.kw} | ${s.demand} | ${s.supply.toLocaleString()} | ${s.medViews} | $${s.price.toFixed(2)} | ${s.ws} | ${s.medAgeDays}d | ${s.pctNew90}% | ${s.pctOld2y}% | ${s.tagsAvg} | ${s.pctPersonalize}% | ${s.pctVariations}% | ${s.vConc}× | ${s.mats} |`
  );
  const md = [
    `# Đánh giá sản phẩm: ${CLUSTER[0]} (${new Date().toISOString().slice(0, 10)})`,
    ``, `Nguồn: Etsy public API qua pool [${pool.keyIds.join(', ')}]. Sales/tháng là ƯỚC LƯỢNG theo review; lifetime sales là số THẬT (toàn shop).`, ``,
    `## Cụm từ khoá — scan + độ sâu trang 1`, ``,
    `| keyword | demand | supply | medViews | giá | ws | tuổiTV | %mới90d | %già2y | tag/13 | %cá nhân hoá | %biến thể | view p90/med | vật liệu |`,
    `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`,
    ...tbl, ``, `## Đào sâu 2 từ khoá cầu cao nhất`, ``, ...deep,
  ].join('\n');
  writeFileSync(new URL(`./out/eval-${SLUG}.md`, import.meta.url), md, 'utf8');
  console.error(`\nWrote scripts/out/eval-${SLUG}.md${pool.exhaustedIds().length ? ` (keys exhausted mid-run: ${pool.exhaustedIds().join(', ')})` : ''}`);
  console.log(md);
}
main().catch((e) => { console.error(e); process.exit(1); });
