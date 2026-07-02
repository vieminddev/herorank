/**
 * Hunt HIGH-VALUE, easy-to-enter, artistry-rewarding ceramic niches for a Vietnam-based handmade
 * shop whose edge is fine hand-painting / intricate clay & mold work. High price matters because
 * international shipping is costly → the product must carry it.
 *
 * Scans a curated cluster via the background pool and ranks by a Fit score tuned to the goal:
 *   Fit = 0.42·price + 0.33·ease + 0.25·demand
 *   ease = 0.45·(low supply) + 0.30·(fresh listings rank) + 0.25·(low view-concentration)
 * Reuses real demandScore (no drift); whitespace/helpers copied. No DB write (report only).
 *
 * Run: npx tsx scripts/hunt-niches.ts   (writes scripts/out/hunt-highvalue-ceramics.md)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { demandScore } from '../src/lib/server/services/estimation/index';
import { createPool } from './pool';

const pool = createPool();

const ARGV = process.argv.slice(2);
const SLUG = ARGV.length ? ARGV[0].replace(/[^a-z0-9]+/gi, '-').toLowerCase() : 'highvalue-ceramics';
const OUTFILE = `hunt-${SLUG}.md`;

const DEFAULT_CLUSTER = [
  // hand-painted decorative (painting = the edge)
  'hand painted ceramic vase', 'hand painted vase', 'hand painted ceramic bowl', 'hand painted plate',
  'hand painted ceramic ornament', 'hand painted mug', 'hand painted ceramic tile', 'hand painted trinket box',
  'hand painted teapot', 'hand painted ceramic jewelry',
  // art / sculpture / high-value forms
  'ceramic sculpture', 'ceramic figurine', 'ceramic wall art', 'decorative ceramic plate', 'art vase',
  'statement vase', 'large ceramic vase', 'ceramic teapot', 'ceramic tea set', 'matcha tea set',
  'ceramic urn', 'ceramic jewelry box', 'ceramic trinket box', 'ceramic music box', 'ceramic lamp base',
  'ceramic incense burner', 'ceramic sake set', 'ceramic chess set',
  // porcelain / intricate / delicate
  'porcelain vase', 'porcelain ornament', 'porcelain flowers', 'porcelain jewelry', 'porcelain figurine',
  'porcelain trinket box', 'bone china teacup', 'porcelain teacup set',
  // ceramic jewelry (light + high value + painting)
  'ceramic pendant', 'hand painted earrings', 'porcelain pendant', 'ceramic statement earrings', 'ceramic brooch',
  // personalized high-value
  'custom pet portrait plate', 'personalized ceramic ornament', 'custom ceramic vase', 'hand painted pet portrait',
  // style-led premium
  'chinoiserie vase', 'delft pottery', 'majolica pottery', 'raku pottery', 'celadon ceramic', 'kintsugi',
];
const CLUSTER = ARGV.length ? ARGV : DEFAULT_CLUSTER;

function median(xs: number[]): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }
function pctl(xs: number[], p: number): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]; }
function priceCents(l: any): number | null { const p = l.price; return p && p.divisor ? Math.round((p.amount / p.divisor) * 100) : null; }
function whitespaceScore(i: { demandIndex: number; resultCount: number; newListings7d: number }): number {
  const S = 200_000; const sp = i.resultCount > 0 ? (25 * Math.log10(1 + i.resultCount)) / Math.log10(1 + S) : 0;
  return Math.max(0, Math.min(100, Math.round(i.demandIndex - sp - Math.min(25, Math.max(0, i.newListings7d) * 2))));
}
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

interface Row { kw: string; demand: number; supply: number; medViews: number; price: number; ws: number; pctNew90: number; vConc: number; tagsAvg: number; pctPersonalize: number; mats: string; fit: number; }

async function main() {
  const nowSec = Math.floor(Date.now() / 1000);
  const day90 = nowSec - 90 * 86_400;
  console.error(`Hunting ${CLUSTER.length} keywords via pool [${pool.keyIds.join(', ')}]`);
  // cheap probe: if the pool is rolling-window exhausted, bail fast (exit 2) so a wrapper can retry
  // later WITHOUT firing the whole cluster (which would keep the window full and delay recovery).
  const probe = await pool.get(`/listings/active?keywords=ceramic%20mug&limit=1`).catch(() => ({ ok: false, status: 0, json: null }));
  if (!probe.ok) { console.error(`POOL_NOT_READY (probe HTTP ${probe.status})`); process.exit(2); }
  const rows: Row[] = [];
  for (const kw of CLUSTER) {
    try {
      const r = await pool.get(`/listings/active?keywords=${encodeURIComponent(kw)}&sort_on=score&limit=48`);
      if (!r.ok) { console.error(`${kw}: HTTP ${r.status}`); continue; }
      const L: any[] = r.json?.results ?? []; const supply = r.json?.count ?? L.length;
      const sample = L.slice(0, 25);
      const faves = sample.reduce((a, l) => a + (l.num_favorers ?? 0), 0);
      const views = sample.reduce((a, l) => a + (l.views ?? 0), 0);
      const d = demandScore({ resultCount: supply, aggregateReviewVelocity: Math.round(faves / 1000), favoritesSignal: faves, aggregateViews: views });
      const cents = sample.map(priceCents).filter((c): c is number => c != null);
      const price = cents.length ? median(cents) / 100 : 0;
      const medViews = median(sample.map((l) => l.views ?? 0));
      const vAll = L.map((l) => l.views ?? 0); const vConc = median(vAll) > 0 ? pctl(vAll, 0.9) / median(vAll) : 0;
      const withTs = L.filter((l) => typeof l.created_timestamp === 'number');
      const pctNew90 = withTs.length ? Math.round(100 * withTs.filter((l) => l.created_timestamp >= day90).length / withTs.length) : 0;
      const nl7 = sample.filter((l) => typeof l.created_timestamp === 'number' && l.created_timestamp >= nowSec - 7 * 86400).length;
      const ws = whitespaceScore({ demandIndex: d.score, resultCount: supply, newListings7d: nl7 });
      const tagsAvg = Math.round(10 * L.reduce((a, l) => a + (l.tags?.length ?? 0), 0) / (L.length || 1)) / 10;
      const pctPersonalize = Math.round(100 * L.filter((l) => l.is_personalizable).length / (L.length || 1));
      const matC = new Map<string, number>(); for (const l of L) for (const m of (l.materials ?? [])) matC.set(String(m).toLowerCase(), (matC.get(String(m).toLowerCase()) ?? 0) + 1);
      const mats = [...matC.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, c]) => `${m}(${c})`).join(', ');
      rows.push({ kw, demand: d.score, supply, medViews, price, ws, pctNew90, vConc: Math.round(vConc * 10) / 10, tagsAvg, pctPersonalize, mats, fit: 0 });
      console.error(`${kw}: demand ${d.score} supply ${supply} price $${price} ws ${ws}`);
    } catch (e) { console.error(`${kw}: ${(e as Error).message}`); }
  }

  // Fit score
  for (const r of rows) {
    const priceNorm = clamp((r.price - 20) / (180 - 20), 0, 1);
    const easeSupply = 1 - clamp(Math.log10(1 + r.supply) / Math.log10(1 + 80_000), 0, 1);
    const easeVC = 1 - clamp((r.vConc - 1) / (40 - 1), 0, 1);
    const ease = 0.45 * easeSupply + 0.30 * (r.pctNew90 / 100) + 0.25 * easeVC;
    const demandNorm = clamp(r.demand / 100, 0, 1) * (r.demand < 40 ? 0.5 : 1);
    r.fit = Math.round(100 * (0.42 * priceNorm + 0.33 * ease + 0.25 * demandNorm));
  }
  rows.sort((a, b) => b.fit - a.fit);
  // shortlist filter: real market + high price + not saturated
  const short = rows.filter((r) => r.supply >= 150 && r.supply <= 80_000 && r.demand >= 42 && r.price >= 35);

  const fmt = (r: Row) => `| ${r.kw} | **${r.fit}** | $${r.price.toFixed(0)} | ${r.demand} | ${r.supply.toLocaleString()} | ${r.medViews} | ${r.pctNew90}% | ${r.vConc}× | ${r.ws} | ${r.tagsAvg} | ${r.pctPersonalize}% | ${r.mats} |`;
  const head = `| keyword | Fit | giá | demand | supply | medViews | %mới90d | view p90/med | ws | tag/13 | %cá nhân | vật liệu |\n|---|---|---|---|---|---|---|---|---|---|---|---|`;
  const md = [
    `# Săn ngách: ${CLUSTER[0]} … (${new Date().toISOString().slice(0, 10)})`,
    ``, `Fit = 0.42·giá + 0.33·dễ-vào + 0.25·cầu. Giá cao ưu tiên (bù ship VN). Nguồn: Etsy public API qua pool.`, ``,
    `## SHORTLIST (supply 150–80k · demand ≥42 · giá ≥$35)`, ``, head, ...short.map(fmt), ``,
    `## Toàn bộ (xếp theo Fit)`, ``, head, ...rows.map(fmt),
  ].join('\n');
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  writeFileSync(new URL(`./out/${OUTFILE}`, import.meta.url), md + '\n', 'utf8');
  console.error(`\nWrote scripts/out/${OUTFILE} · shortlist ${short.length}/${rows.length}`);
  console.log(['SHORTLIST (Fit | giá | demand | supply | medViews | %new90 | vConc | ws):',
    ...short.slice(0, 20).map((r) => `${r.fit}\t$${r.price.toFixed(0)}\t${r.kw}\t d${r.demand} s${r.supply} v${r.medViews} n${r.pctNew90}% ${r.vConc}× ws${r.ws}`)].join('\n'));
}
main().catch((e) => { console.error(e); process.exit(1); });
