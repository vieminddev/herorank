/**
 * One-off niche scan for the ceramics / pottery-mold vertical (branches A + B).
 *
 * Uses the 8mh6 OAuth app key (ETSY_OAUTH_CLIENT_ID:SECRET from .dev.vars) for PUBLIC
 * `/listings/active` search only — no seller token, no pool, gentle throttle. Reuses the REAL
 * `demandScore` + `keywordTrendPoints` so persisted metrics match the cron exactly (zero drift).
 *
 * Outputs:
 *   scripts/out/niche-scan.sql   — metric_series UPSERTs (source='scan-pool'), run via wrangler --remote
 *   scripts/out/niche-report.md  — Opportunity Score v2 ranking + page-1 depth
 *
 * Run:  npx tsx scripts/niche-scan.ts
 * This does NOT write to any DB itself; you apply the SQL separately.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { demandScore } from '../src/lib/server/services/estimation/index';
import { keywordTrendPoints } from '../src/lib/server/services/history/cronSeries';
import { createPool } from './pool';

const pool = createPool();

// ---- exact copies of the cron's pure helpers (avoid importing refresh.ts's heavy chain) ----
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
function whitespaceScore(input: { demandIndex: number; resultCount: number; newListings7d: number }): number {
  const SUPPLY_SCALE = 200_000;
  const supplyPenalty =
    input.resultCount > 0 ? (25 * Math.log10(1 + input.resultCount)) / Math.log10(1 + SUPPLY_SCALE) : 0;
  const entryVelocityPenalty = Math.min(25, Math.max(0, input.newListings7d) * 2);
  const raw = input.demandIndex - supplyPenalty - entryVelocityPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
function priceCents(l: any): number | null {
  const p = l.price;
  if (!p || !p.divisor) return null;
  return Math.round((p.amount / p.divisor) * 100);
}


// ---- combo generation (branches A + B) ----
function buildKeywords(): string[] {
  const forms = [
    'bud vase', 'planter', 'trinket dish', 'ring dish', 'jewelry dish', 'spoon rest', 'soap dish',
    'incense holder', 'oil burner', 'matcha bowl', 'espresso cup', 'tumbler', 'mug', 'creamer',
    'butter dish', 'catchall tray', 'candle holder', 'ornament', 'berry bowl', 'ramekin',
  ];
  const styles = [
    'wabi sabi', 'brutalist', 'cottagecore', 'minimalist', 'japandi', 'scalloped', 'fluted',
    'ribbed', 'speckled', 'organic modern', 'mushroom', 'checkerboard', 'scandinavian', 'coquette',
  ];
  const set = new Set<string>();
  // A: style × form
  for (const s of styles) for (const f of forms) set.add(`${s} ${f}`);
  // A: ceramic × form + function combos
  for (const f of forms) set.add(`ceramic ${f}`);
  for (const p of ['planter', 'bud vase']) {
    for (const fn of ['propagation', 'self watering', 'hanging', 'wall']) set.add(`${fn} ${p}`);
  }
  // B: mold type × output
  const moldTypes = [
    'slip casting mold', 'plaster mold', 'silicone mold', 'press mold', 'hump mold', 'slump mold',
    'sprig mold', 'drape mold', 'bisque mold',
  ];
  const outputs = ['mug', 'bowl', 'planter', 'vase', 'dish', 'ornament'];
  for (const m of moldTypes) set.add(`${m} pottery`);
  for (const m of ['slip casting', 'press', 'plaster', 'silicone']) for (const o of outputs) set.add(`${m} ${o} mold`);
  // B: tools / stamps
  for (const t of [
    'pottery stamp', 'clay stamp', 'clay texture roller', 'texture mat pottery', 'pottery rib tool',
    'clay cutter', 'pottery trimming tool', 'sgraffito tool', 'clay texture stamp',
    'diy pottery kit', 'pottery mold for beginners', 'reusable slip casting mold', 'clay mold kit',
  ]) set.add(t);
  return [...set];
}

const BASE = 'https://openapi.etsy.com/v3/application';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row {
  keyword: string;
  demand: number;
  resultCount: number;
  medianViews: number;
  priceMedianCents: number;
  newListings7d: number;
  whitespace: number;
  pctNew90d: number;
  top3ShopShare: number;
  sampleSize: number;
}

async function main() {

  const keywords = buildKeywords();
  const nowSec = Math.floor(Date.now() / 1000);
  const weekAgoSec = nowSec - 7 * 86_400;
  const day90Sec = nowSec - 90 * 86_400;
  console.error(`Scanning ${keywords.length} keywords via pool [${pool.keyIds.join(', ')}]…`);

  const rows: Row[] = [];
  const sqlLines: string[] = [];
  let done = 0;
  let firstDump = true;

  const CONCURRENCY = 6; // pool.get() paces globally; workers just overlap network latency

  async function processKeyword(kw: string): Promise<void> {
    try {
      const r = await pool.get(`/listings/active?keywords=${encodeURIComponent(kw)}&sort_on=score&limit=100`);
      if (!r.ok) {
        console.error(`  [${++done}/${keywords.length}] ${kw} → HTTP ${r.status}`);
        if (r.status === 401 || r.status === 403) throw new Error(`key rejected (${r.status})`);
        return;
      }
      const json: any = r.json;
      const results: any[] = json.results ?? [];
      const resultCount: number = json.count ?? results.length;
      if (firstDump) {
        firstDump = false;
        console.error(`  (field check on "${kw}": keys = ${Object.keys(results[0] ?? {}).join(', ')})`);
      }
      // Persisted metrics computed over the first 25 (matches cron's limit:25 sample) for consistency.
      const sample = results.slice(0, 25);
      const faves = sample.reduce((a, l) => a + (l.num_favorers ?? 0), 0);
      const views = sample.reduce((a, l) => a + (l.views ?? 0), 0);
      const demand = demandScore({
        resultCount,
        aggregateReviewVelocity: Math.round(faves / 1000),
        favoritesSignal: faves,
        aggregateViews: views,
      });
      const cents = sample.map(priceCents).filter((c): c is number => c != null);
      const priceMedian = cents.length ? median(cents) : 0;
      const medianViews = sample.length ? median(sample.map((l) => l.views ?? 0)) : 0;
      const newListings7d = sample.filter(
        (l) => typeof l.created_timestamp === 'number' && l.created_timestamp >= weekAgoSec
      ).length;
      const whitespace = whitespaceScore({ demandIndex: demand.score, resultCount, newListings7d });

      // Report-only depth over the FULL page-1 sample (up to 100).
      const withTs = results.filter((l) => typeof l.created_timestamp === 'number');
      const pctNew90d = withTs.length ? Math.round((100 * withTs.filter((l) => l.created_timestamp >= day90Sec).length) / withTs.length) : 0;
      const shopCounts = new Map<number, number>();
      for (const l of results) if (l.shop_id != null) shopCounts.set(l.shop_id, (shopCounts.get(l.shop_id) ?? 0) + 1);
      const top3 = [...shopCounts.values()].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
      const top3ShopShare = results.length ? Math.round((100 * top3) / results.length) : 0;

      rows.push({ keyword: kw, demand: demand.score, resultCount, medianViews, priceMedianCents: priceMedian, newListings7d, whitespace, pctNew90d, top3ShopShare, sampleSize: results.length });

      // metric_series UPSERTs — reuse the exact cron mapper, then re-tag source for provenance.
      const pts = keywordTrendPoints(kw, {
        demandScore: demand.score,
        resultCount,
        priceMedian: priceMedian || undefined,
        medianViews: medianViews || undefined,
        newListings7d,
        whitespace,
        categoryId: null,
      }, nowSec);
      for (const p of pts) {
        const kwEsc = p.entityId.replace(/'/g, "''");
        sqlLines.push(
          `INSERT INTO metric_series (entity_type,entity_id,metric,granularity,bucket,ts,value,source,meta) ` +
          `VALUES ('keyword','${kwEsc}','${p.metric}','week',${p.bucket},${p.ts},${p.value},'scan-pool',NULL) ` +
          `ON CONFLICT(entity_type,entity_id,metric,granularity,bucket) DO UPDATE SET ts=excluded.ts,value=excluded.value,source=excluded.source,meta=excluded.meta;`
        );
      }
      console.error(`  [${++done}/${keywords.length}] ${kw} → demand ${demand.score} | supply ${resultCount} | medViews ${medianViews} | ws ${whitespace}`);
    } catch (err) {
      console.error(`  [${++done}/${keywords.length}] ${kw} → ERROR ${(err as Error).message}`);
      if ((err as Error).message.includes('key rejected')) aborted = true;
    }
  }

  // ---- concurrency pool: CONCURRENCY workers pull from a shared cursor ----
  let aborted = false;
  let cursor = 0;
  async function worker() {
    while (!aborted && cursor < keywords.length) {
      const kw = keywords[cursor++];
      await processKeyword(kw);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // ---- Opportunity Score v2 (momentum omitted — no prior week yet for these combos) ----
  const scored = rows.filter((r) => r.resultCount > 0);
  const norm = (x: number, arr: number[]) => {
    const min = Math.min(...arr), max = Math.max(...arr);
    return max > min ? (x - min) / (max - min) : 0;
  };
  const dcr = (r: Row) => r.medianViews / Math.log10(1 + r.resultCount);
  const dcrArr = scored.map(dcr);
  const priceArr = scored.map((r) => r.priceMedianCents);
  const wLog = (v: number) => Math.log10(1 + v) / Math.log10(1 + 500);
  const opp = (r: Row) => {
    const dNorm = 0.5 * (r.demand / 100) + 0.5 * Math.min(1, wLog(r.medianViews));
    const compNorm = norm(dcr(r), dcrArr);
    const moneyNorm = r.priceMedianCents < 1000 ? 0 : norm(r.priceMedianCents, priceArr);
    return Math.round(100 * (0.412 * dNorm + 0.412 * compNorm + 0.176 * moneyNorm));
  };
  scored.sort((a, b) => opp(b) - opp(a));

  // ---- write outputs ----
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./out/niche-scan.sql', import.meta.url), sqlLines.join('\n') + '\n', 'utf8');

  const fmt = (r: Row) =>
    `| ${r.keyword} | ${r.demand} | ${r.resultCount.toLocaleString()} | ${r.medianViews} | $${(r.priceMedianCents / 100).toFixed(2)} | ${r.pctNew90d}% | ${r.top3ShopShare}% | ${r.whitespace} | **${opp(r)}** |`;
  const md = [
    `# Niche scan — Ceramics / Pottery molds (${new Date().toISOString().slice(0, 10)})`,
    ``,
    `Scanned ${keywords.length} combos via pool public search. Ranked by Opportunity Score v2`,
    `(Demand 41% · Competition-ratio 41% · Monetizability 18% · Momentum pending).`,
    `Depth (%new90d, top-3 shop share) from page-1 sample. Higher %new90d + lower top-3 share = easier entry.`,
    ``,
    `| keyword | demand | supply | medViews | price | %new90d | top3shop | whitespace | Opp |`,
    `|---|---|---|---|---|---|---|---|---|`,
    ...scored.map(fmt),
  ].join('\n');
  writeFileSync(new URL('./out/niche-report.md', import.meta.url), md + '\n', 'utf8');

  console.error(`\nDONE. ${scored.length} scored / ${rows.length} fetched. SQL points: ${sqlLines.length}.`);
  console.error(`Report: scripts/out/niche-report.md   SQL: scripts/out/niche-scan.sql`);
  // Print top 25 to stdout for a quick look.
  console.log(['keyword\tdemand\tsupply\tmedViews\tprice\t%new90d\ttop3\tws\tOpp',
    ...scored.slice(0, 25).map((r) => `${r.keyword}\t${r.demand}\t${r.resultCount}\t${r.medianViews}\t$${(r.priceMedianCents/100).toFixed(2)}\t${r.pctNew90d}%\t${r.top3ShopShare}%\t${r.whitespace}\t${opp(r)}`)].join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
