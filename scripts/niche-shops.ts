/**
 * Pull REAL lifetime sales (transaction_sold_count — public via getShop) for the shops competing in
 * each niche, to gauge how big/established the sellers are and cross-check the review-based estimate.
 *
 * CAVEAT: transaction_sold_count is SHOP-WIDE lifetime (all products, all time), not niche-specific.
 * It measures the seller's overall scale/experience, not their sales IN this niche.
 *
 * Run: npx tsx scripts/niche-shops.ts   (writes scripts/out/niche-shops.md)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createPool } from './pool';

const pool = createPool();

const NICHES = process.argv.slice(2).length ? process.argv.slice(2) : ['slip casting bowl mold', 'mushroom planter', 'plaster planter mold'];
// review-estimate top-3 shop ids from niche-concentration.md (for cross-check ★)
const REVIEW_TOP: Record<string, number[]> = {
  'slip casting bowl mold': [26346607, 53806461, 54109180],
  'mushroom planter': [41253286, 28790764, 56296530],
  'plaster planter mold': [18310223, 9779981, 11704449],
};
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
function median(xs: number[]): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }

interface Shop { id: number; name: string; sold: number; reviews: number; favorers: number; ageYears: number | null; }

async function main() {
  const nowSec = Math.floor(Date.now() / 1000);
  console.error(`Pool keys: ${pool.keyIds.join(', ')}`);

  // 1) top-N listings per niche → shop ids (preserve search rank order)
  const nicheShops: Record<string, number[]> = {};
  for (const kw of NICHES) {
    const rs = await pool.get(`/listings/active?keywords=${encodeURIComponent(kw)}&sort_on=score&limit=${TOPN}`);
    if (!rs.ok) { console.error(`${kw}: HTTP ${rs.status}`); nicheShops[kw] = []; continue; }
    const j: any = rs.json;
    const ids: number[] = [];
    for (const l of (j.results ?? []).slice(0, TOPN)) if (l.shop_id != null && !ids.includes(l.shop_id)) ids.push(l.shop_id);
    nicheShops[kw] = ids;
    console.error(`${kw}: ${ids.length} distinct shops`);
  }

  // 2) getShop for every distinct shop (deduped across niches), pooled + gentle
  const allIds = [...new Set(Object.values(nicheShops).flat())];
  const shops = new Map<number, Shop>();
  let done = 0;
  async function fetchShop(id: number) {
    try {
      const rr = await pool.get(`/shops/${id}`);
      if (!rr.ok) { shops.set(id, { id, name: `#${id}`, sold: -1, reviews: -1, favorers: -1, ageYears: null }); return; }
      const s: any = rr.json;
      const created = s.create_date ?? s.creation_tsz ?? s.created_timestamp ?? null;
      shops.set(id, {
        id,
        name: s.shop_name ?? `#${id}`,
        sold: s.transaction_sold_count ?? 0,
        reviews: s.review_count ?? 0,
        favorers: s.num_favorers ?? 0,
        ageYears: typeof created === 'number' ? Math.round((nowSec - created) / 31_536_000 * 10) / 10 : null,
      });
    } catch { shops.set(id, { id, name: `#${id}`, sold: -1, reviews: -1, favorers: -1, ageYears: null }); }
    finally { if (++done % 20 === 0) console.error(`  shops ${done}/${allIds.length}`); }
  }
  let cursor = 0;
  await Promise.all(Array.from({ length: 5 }, async () => { while (cursor < allIds.length) await fetchShop(allIds[cursor++]); }));

  // 3) per-niche report
  const blocks: string[] = [];
  for (const kw of NICHES) {
    const list = nicheShops[kw].map((id) => shops.get(id)).filter((s): s is Shop => !!s && s.sold >= 0);
    const sold = list.map((s) => s.sold);
    const bySold = [...list].sort((a, b) => b.sold - a.sold);
    const totalSold = sold.reduce((a, b) => a + b, 0);
    const big = list.filter((s) => s.sold >= 10_000).length;
    const smallNew = list.filter((s) => s.sold < 500).length;
    const top = REVIEW_TOP[kw] ?? [];
    const rowsMd = bySold.slice(0, 12).map((s) =>
      `| ${top.includes(s.id) ? '★ ' : ''}${s.name} | ${s.sold.toLocaleString()} | ${s.reviews.toLocaleString()} | ${s.ageYears ?? '—'}y |`
    );
    blocks.push([
      `## ${kw}`,
      ``,
      `- **${list.length} shop** trên trang 1. Lifetime sales: trung vị **${median(sold).toLocaleString()}**, cao nhất **${Math.max(...sold, 0).toLocaleString()}**.`,
      `- **Cỡ shop:** ${big} shop lớn (≥10k sales trọn đời) · ${smallNew} shop nhỏ/mới (<500). ${smallNew > big ? '→ chủ yếu shop nhỏ → không gian cho người mới.' : big >= list.length / 2 ? '→ nhiều shop lớn kỳ cựu → khó.' : '→ pha trộn.'}`,
      `- **★ = shop bán chạy nhất theo ước lượng review** (cross-check).`,
      ``,
      `| shop | lifetime sales | reviews | tuổi |`,
      `|---|---|---|---|`,
      ...rowsMd,
      ``,
    ].join('\n'));
    console.error(`${kw}: median ${median(sold)}, max ${Math.max(...sold, 0)}, big ${big}, small ${smallNew}`);
  }

  const md = `# Real lifetime sales of competing shops — top 3 niches (${new Date().toISOString().slice(0, 10)})\n\n` +
    `\`transaction_sold_count\` = số bán trọn đời THẬT (Etsy public), TOÀN shop (không riêng ngách). Đo cỡ/độ kỳ cựu người bán.\n\n` + blocks.join('\n');
  writeFileSync(new URL('./out/niche-shops.md', import.meta.url), md, 'utf8');
  console.error('\nWrote scripts/out/niche-shops.md');
  console.log(md);
}
main().catch((e) => { console.error(e); process.exit(1); });
