/**
 * Find OPEN breed-specific long-tail keywords inside the pet-portrait/memorial-plate niche.
 * For long-tail SEO targeting, "open" = low supply (few competing listings) that still gets search
 * interest → easy to rank #1. Ranks by whitespace (demand minus supply/entry penalties) and shows
 * raw supply so you can see which breed terms are wide open to put in titles/tags.
 * Background pool; degrades gracefully if a key hits its daily cap mid-run.
 *
 * Run: npx tsx scripts/hunt-breed-longtail.ts   (writes scripts/out/hunt-breed-longtail.md)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { demandScore } from '../src/lib/server/services/estimation/index';
import { createPool } from './pool';

const pool = createPool();

const ARGV = process.argv.slice(2);
const SLUG = ARGV.length ? ARGV[0].replace(/[^a-z0-9]+/gi, '-').toLowerCase() : 'breed';
const OUTFILE = ARGV.length ? `hunt-longtail-${SLUG}.md` : 'hunt-breed-longtail.md';

const DEFAULT_CLUSTER = [
  // core pet-type + product
  'custom cat memorial plate', 'custom dog memorial plate', 'cat portrait plate', 'dog portrait plate',
  'pet memorial plate', 'custom pet memorial plate', 'pet portrait dish', 'dog breed portrait plate',
  'cat breed portrait plate',
  // dog breeds × portrait/memorial plate
  'dachshund portrait plate', 'corgi portrait plate', 'french bulldog portrait plate',
  'golden retriever memorial plate', 'german shepherd portrait plate', 'labrador portrait plate',
  'poodle portrait plate', 'shih tzu portrait plate', 'pug portrait plate', 'beagle portrait plate',
  'husky portrait plate', 'chihuahua portrait plate', 'border collie portrait plate',
  'pomeranian portrait plate', 'cocker spaniel portrait plate',
  // cat variants
  'tabby cat portrait plate', 'black cat memorial plate', 'siamese cat plate', 'maine coon portrait plate',
  'orange cat memorial plate',
  // breed × memorial gift (broader intent)
  'dachshund memorial gift ceramic', 'corgi memorial gift ceramic', 'french bulldog memorial ceramic',
];
const CLUSTER = ARGV.length ? ARGV : DEFAULT_CLUSTER;

function median(xs: number[]): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }
function priceC(l: any): number | null { const p = l.price; return p && p.divisor ? Math.round((p.amount / p.divisor) * 100) : null; }
function whitespaceScore(i: { demandIndex: number; resultCount: number; newListings7d: number }): number {
  const S = 200_000; const sp = i.resultCount > 0 ? (25 * Math.log10(1 + i.resultCount)) / Math.log10(1 + S) : 0;
  return Math.max(0, Math.min(100, Math.round(i.demandIndex - sp - Math.min(25, Math.max(0, i.newListings7d) * 2))));
}

interface Row { kw: string; demand: number; supply: number; medViews: number; price: number; ws: number; }

async function main() {
  const nowSec = Math.floor(Date.now() / 1000);
  console.error(`Scanning ${CLUSTER.length} breed long-tails via pool [${pool.keyIds.join(', ')}]`);
  const rows: Row[] = [];
  for (const kw of CLUSTER) {
    try {
      const r = await pool.get(`/listings/active?keywords=${encodeURIComponent(kw)}&sort_on=score&limit=25`);
      if (!r.ok) { console.error(`${kw}: HTTP ${r.status}`); continue; }
      const L: any[] = r.json?.results ?? []; const supply = r.json?.count ?? L.length;
      const faves = L.reduce((a, l) => a + (l.num_favorers ?? 0), 0);
      const views = L.reduce((a, l) => a + (l.views ?? 0), 0);
      const d = demandScore({ resultCount: supply, aggregateReviewVelocity: Math.round(faves / 1000), favoritesSignal: faves, aggregateViews: views });
      const cents = L.map(priceC).filter((c): c is number => c != null);
      const nl7 = L.filter((l) => typeof l.created_timestamp === 'number' && l.created_timestamp >= nowSec - 7 * 86400).length;
      rows.push({ kw, demand: d.score, supply, medViews: median(L.map((l) => l.views ?? 0)), price: cents.length ? median(cents) / 100 : 0, ws: whitespaceScore({ demandIndex: d.score, resultCount: supply, newListings7d: nl7 }) });
      console.error(`${kw}: supply ${supply} demand ${d.score} medViews ${median(L.map((l: any) => l.views ?? 0))} ws ${whitespaceScore({ demandIndex: d.score, resultCount: supply, newListings7d: nl7 })}`);
    } catch (e) { console.error(`${kw}: ${(e as Error).message} (pool likely exhausted — stopping)`); break; }
  }
  rows.sort((a, b) => b.ws - a.ws);
  const bucket = (s: number) => s < 500 ? '🟢 rất trống' : s < 3000 ? '🟡 vừa' : '🔴 đông';
  const fmt = (r: Row) => `| ${r.kw} | ${r.supply.toLocaleString()} | ${bucket(r.supply)} | ${r.demand} | ${r.medViews} | $${r.price.toFixed(0)} | ${r.ws} |`;
  const open = rows.filter((r) => r.supply < 500);
  const md = [
    `# Long-tail hunt: ${CLUSTER[0]} … (${new Date().toISOString().slice(0, 10)})`,
    ``, `Cung thấp + có view = long-tail dễ chiếm top. Nguồn: Etsy public API qua pool. Scan ${rows.length}/${CLUSTER.length} kw.`, ``,
    `## 🟢 Trống nhất (cung <500 — nhắm ngay vào title/tag)`, ``,
    `| keyword | cung | độ trống | demand | medViews | giá | whitespace |`, `|---|---|---|---|---|---|---|`,
    ...open.map(fmt), ``,
    `## Toàn bộ (xếp theo whitespace)`, ``,
    `| keyword | cung | độ trống | demand | medViews | giá | whitespace |`, `|---|---|---|---|---|---|---|`,
    ...rows.map(fmt),
  ].join('\n');
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  writeFileSync(new URL(`./out/${OUTFILE}`, import.meta.url), md + '\n', 'utf8');
  console.error(`\nWrote scripts/out/hunt-breed-longtail.md · ${open.length} wide-open / ${rows.length} scanned`);
  console.log(md);
}
main().catch((e) => { console.error(`ERROR ${(e as Error).message}`); process.exit(1); });
