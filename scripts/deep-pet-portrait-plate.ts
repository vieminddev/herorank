/**
 * Deep-dive ONE niche: "custom pet portrait plate" — where are competitors weak, price ladder,
 * design/attribute gaps to exploit. Uses the background pool. Probes cheaply first: if the pool is
 * still rolling-window exhausted it exits 2 (so a wrapper can retry later without burning ~80 calls).
 *
 * Run: npx tsx scripts/deep-pet-portrait-plate.ts
 * Exit 0 = report written (scripts/out/deep-pet-portrait-plate.md); 2 = pool not ready (retry later).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { salesEstimate } from '../src/lib/server/services/estimation/index';
import { createPool } from './pool';

const KW = 'custom pet portrait plate';
const pool = createPool();

function median(xs: number[]): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }
function pctl(xs: number[], p: number): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]; }
function priceC(l: any): number | null { const p = l.price; return p && p.divisor ? Math.round((p.amount / p.divisor) * 100) : null; }
function reviews90dFromSample(t: number[], nowSec: number, lim = 100): number {
  const ts = t.filter((x) => Number.isFinite(x)).sort((a, b) => b - a); if (!ts.length) return 0;
  const c = nowSec - 90 * 86_400; const w = ts.filter((x) => x >= c).length;
  if (ts.length < lim || w < ts.length) return w;
  const span = Math.max(1, (ts[0] - ts[ts.length - 1]) / 86_400); return Math.round((ts.length / span) * 90);
}
function hhi(sh: number[]): number { return Math.round(sh.reduce((a, s) => a + s * s, 0) * 10000); }
function topN<T>(m: Map<T, number>, n: number): [T, number][] { return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n); }

async function main() {
  const nowSec = Math.floor(Date.now() / 1000);
  // ---- cheap probe: 1 call. If pool is exhausted, bail fast (exit 2) so a wrapper retries later.
  let probe;
  try { probe = await pool.get(`/listings/active?keywords=${encodeURIComponent(KW)}&sort_on=score&limit=1`); }
  catch { console.error('POOL_NOT_READY (all keys exhausted)'); process.exit(2); }
  if (!probe.ok) { console.error(`POOL_NOT_READY (probe HTTP ${probe.status})`); process.exit(2); }
  console.error(`Pool ready [${pool.keyIds.join(', ')}] — deep-diving "${KW}"`);

  // ---- page-1 pull (100) for depth/tags/materials/price/shops ----
  const r = await pool.get(`/listings/active?keywords=${encodeURIComponent(KW)}&sort_on=score&limit=100`);
  const L: any[] = r.json?.results ?? []; const total = r.json?.count ?? L.length;

  const cents = L.map(priceC).filter((c): c is number => c != null);
  const ages = L.map((l) => l.original_creation_timestamp ?? l.created_timestamp).filter((t) => typeof t === 'number').map((t: number) => (nowSec - t) / 86400);
  const views = L.map((l) => l.views ?? 0);
  const pctPersonalize = Math.round(100 * L.filter((l) => l.is_personalizable).length / (L.length || 1));
  const pctVariations = Math.round(100 * L.filter((l) => l.has_variations).length / (L.length || 1));
  const tagsAvg = Math.round(10 * L.reduce((a, l) => a + (l.tags?.length ?? 0), 0) / (L.length || 1)) / 10;
  const pctFull13 = Math.round(100 * L.filter((l) => (l.tags?.length ?? 0) >= 13).length / (L.length || 1));
  const titleLenAvg = Math.round(L.reduce((a, l) => a + (l.title?.length ?? 0), 0) / (L.length || 1));

  const tagC = new Map<string, number>(); for (const l of L) for (const t of (l.tags ?? [])) tagC.set(String(t).toLowerCase(), (tagC.get(String(t).toLowerCase()) ?? 0) + 1);
  const matC = new Map<string, number>(); for (const l of L) for (const m of (l.materials ?? [])) matC.set(String(m).toLowerCase(), (matC.get(String(m).toLowerCase()) ?? 0) + 1);
  // material split: ceramic/porcelain vs printed/other
  const ceramicish = /(ceramic|porcelain|stoneware|clay|earthenware)/i;
  const printish = /(print|canvas|paper|acrylic|aluminum|aluminium|metal|poster|digital|vinyl)/i;
  const nCeramic = L.filter((l) => (l.materials ?? []).some((m: string) => ceramicish.test(m)) || ceramicish.test(l.title ?? '')).length;
  const nPrint = L.filter((l) => (l.materials ?? []).some((m: string) => printish.test(m)) || printish.test(l.title ?? '')).length;

  // ---- concentration: per-listing review→sales on top 40 ----
  const top = L.slice(0, 40).map((l) => ({ id: l.listing_id, shop: l.shop_id, price: (l.price?.amount ?? 0) / (l.price?.divisor || 1), tax: l.taxonomy_id ?? null }));
  const est = new Map<number, { m: number; r90: number }>(); let cur = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (cur < top.length) { const t = top[cur++];
      const rr = await pool.get(`/listings/${t.id}/reviews?limit=100`);
      if (!rr.ok) { est.set(t.id, { m: 0, r90: 0 }); continue; }
      const ts = (rr.json?.results ?? []).map((x: any) => x.created_timestamp).filter((x: any) => typeof x === 'number');
      const r90 = reviews90dFromSample(ts, nowSec, 100);
      est.set(t.id, { m: salesEstimate({ reviewsLast90d: r90, categoryId: t.tax, avgPrice: t.price }).monthlySales, r90 });
    }
  }));
  const monthly = top.map((t) => est.get(t.id)?.m ?? 0); const totalM = monthly.reduce((a, b) => a + b, 0);
  const sortedT = [...top].sort((a, b) => (est.get(b.id)?.m ?? 0) - (est.get(a.id)?.m ?? 0));
  const share = (n: number) => totalM > 0 ? Math.round(100 * sortedT.slice(0, n).reduce((a, b) => a + (est.get(b.id)?.m ?? 0), 0) / totalM) : 0;
  const dead = Math.round(100 * top.filter((t) => (est.get(t.id)?.r90 ?? 0) === 0).length / (top.length || 1));
  const H = totalM > 0 ? hhi(monthly.map((m) => m / totalM)) : 0;

  // ---- shop lifetime (distinct shops in top 48) ----
  const shopIds = [...new Set(L.slice(0, 48).map((l) => l.shop_id))]; const shops = new Map<number, any>(); let sc = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (sc < shopIds.length) { const id = shopIds[sc++];
      const rr = await pool.get(`/shops/${id}`);
      if (!rr.ok) { shops.set(id, null); continue; }
      const s = rr.json; shops.set(id, { name: s.shop_name ?? `#${id}`, sold: s.transaction_sold_count ?? 0, reviews: s.review_count ?? 0 });
    }
  }));
  const svals = [...shops.values()].filter(Boolean); const soldArr = svals.map((s) => s.sold);
  const big = svals.filter((s) => s.sold >= 10_000).length; const small = svals.filter((s) => s.sold < 500).length;
  const topShops = svals.sort((a, b) => b.sold - a.sold).slice(0, 10);

  const money = (c: number) => `$${(c / 100).toFixed(0)}`;
  const md = [
    `# Đào sâu: custom pet portrait plate (${new Date().toISOString().slice(0, 10)})`,
    ``, `Top ${L.length}/${total.toLocaleString()} listing. Nguồn: Etsy public API qua pool [${pool.keyIds.join(', ')}]. Sales là ước lượng review; lifetime là số thật (toàn shop).`, ``,
    `## Thị trường`,
    `- Tổng cung: **${total.toLocaleString()}** listing. Giá: min ${money(Math.min(...cents))} · P25 ${money(pctl(cents, .25))} · **trung vị ${money(median(cents))}** · P75 ${money(pctl(cents, .75))} · P90 ${money(pctl(cents, .9))}.`,
    `- Doanh số ước tính top 40: **~${totalM}/tháng**; top-1 ${share(1)}% · top-3 ${share(3)}% · HHI ${H} (${H >= 2500 ? 'đặc' : H >= 1500 ? 'vừa' : 'rải'}) · listing ~0 sales ${dead}%.`,
    `- Tuổi listing top: trung vị ${Math.round(median(ages))} ngày; ${Math.round(100 * ages.filter((a) => a <= 90).length / (ages.length || 1))}% mới ≤90d, ${Math.round(100 * ages.filter((a) => a >= 730).length / (ages.length || 1))}% già ≥2y.`,
    `- View: trung vị ${median(views)}, p90 ${pctl(views, .9)}, max ${Math.max(...views, 0)}.`,
    ``,
    `## Khoảng trống để chen (điểm yếu đối thủ)`,
    `- **Vật liệu:** ~${nCeramic}/${L.length} listing là gốm/sứ, ~${nPrint}/${L.length} là in/canvas/kim loại. ${nPrint >= nCeramic ? '→ NÊM: phần lớn KHÔNG phải gốm thật → đĩa gốm vẽ tay tạo khác biệt chất liệu rõ.' : '→ đa số đã là gốm.'}`,
    `- **Cá nhân hoá:** ${pctPersonalize}% · **biến thể:** ${pctVariations}%. ${pctPersonalize < 60 ? '→ NÊM personalization.' : ''} ${pctVariations < 50 ? '→ NÊM biến thể (size/khung/màu nền).' : ''}`.trim(),
    `- **SEO đối thủ:** ${tagsAvg}/13 tag TB, ${pctFull13}% dùng đủ 13; tiêu đề TB ${titleLenAvg} ký tự. ${pctFull13 < 70 ? '→ NÊM: dùng đủ 13 tag.' : ''}`.trim(),
    `- **Giá:** dải ${money(pctl(cents, .25))}–${money(pctl(cents, .75))}; chỗ định giá premium ở > ${money(pctl(cents, .75))} nếu chất vẽ vượt trội.`,
    ``,
    `## Tag đối thủ hay dùng (top 15 — để bạn cover + tìm long-tail còn trống)`,
    topN(tagC, 15).map(([t, c]) => `\`${t}\`(${c})`).join(' · '),
    ``,
    `## Vật liệu khai báo (top 8)`,
    topN(matC, 8).map(([m, c]) => `${m}(${c})`).join(' · '),
    ``,
    `## Shop cạnh tranh (lifetime sales — maker gốm hay generalist?)`,
    `- ${svals.length} shop; trung vị **${median(soldArr).toLocaleString()}**, cao nhất **${Math.max(...soldArr, 0).toLocaleString()}**; ${big} shop ≥10k · ${small} shop <500 (nhỏ/mới).`,
    ``, `| shop | lifetime sales | reviews |`, `|---|---|---|`,
    ...topShops.map((s) => `| ${s.name} | ${s.sold.toLocaleString()} | ${s.reviews.toLocaleString()} |`),
  ].join('\n');
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./out/deep-pet-portrait-plate.md', import.meta.url), md + '\n', 'utf8');
  console.error(`\nWrote scripts/out/deep-pet-portrait-plate.md${pool.exhaustedIds().length ? ` (keys hit limit mid-run: ${pool.exhaustedIds().join(', ')})` : ''}`);
  console.log(md);
}
main().catch((e) => { console.error(`ERROR ${(e as Error).message}`); process.exit((e as Error).message.includes('exhausted') ? 2 : 1); });
