/**
 * Page-1 depth analysis for a shortlist of niches. Pulls the top ~48 active listings per keyword
 * via the 8mh6 public key and profiles the competition to find WHERE it's weak (the wedge):
 *   - shop concentration      → can a newcomer break in, or do 2-3 shops own it?
 *   - listing age / freshness  → are top rankers entrenched (2yr+) or fresh (<90d lets you in)?
 *   - views concentration      → a few dominant listings vs a beatable spread?
 *   - price ladder             → entry price + gaps to exploit
 *   - tag optimization         → avg tags of 13 used; low = out-optimize on long-tail
 *   - personalization/variations gap → offer what they don't
 *   - dominant materials/styles
 *
 * Run: npx tsx scripts/niche-depth.ts    (writes scripts/out/niche-depth.md, prints summary)
 * ~5 Etsy calls total — trivial quota, gentle.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createPool } from './pool';

const pool = createPool();

const KEYWORDS = ['diy pottery kit', 'plaster planter mold', 'slip casting bowl mold', 'mushroom planter', 'hanging planter'];
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
function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
}
function med(xs: number[]): number { return pct(xs, 0.5); }
function priceCents(l: any): number | null {
  const p = l.price; if (!p || !p.divisor) return null;
  return Math.round((p.amount / p.divisor) * 100);
}
function topN<T>(counts: Map<T, number>, n: number): [T, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function main() {
  const nowSec = Math.floor(Date.now() / 1000);
  const blocks: string[] = [];
  console.error(`Pool keys: ${pool.keyIds.join(', ')}`);

  for (const kw of KEYWORDS) {
    const r = await pool.get(`/listings/active?keywords=${encodeURIComponent(kw)}&sort_on=score&limit=48`);
    if (!r.ok) { blocks.push(`## ${kw}\nHTTP ${r.status}\n`); console.error(`${kw}: HTTP ${r.status}`); continue; }
    const json: any = r.json;
    const L: any[] = json.results ?? [];
    const total = json.count ?? L.length;

    // shop concentration
    const shopCounts = new Map<number, number>();
    for (const l of L) if (l.shop_id != null) shopCounts.set(l.shop_id, (shopCounts.get(l.shop_id) ?? 0) + 1);
    const distinctShops = shopCounts.size;
    const shopVals = [...shopCounts.values()].sort((a, b) => b - a);
    const topShopShare = Math.round((100 * (shopVals[0] ?? 0)) / L.length);
    const top3Share = Math.round((100 * shopVals.slice(0, 3).reduce((a, b) => a + b, 0)) / L.length);

    // age
    const ages = L.map((l) => l.original_creation_timestamp ?? l.created_timestamp).filter((t) => typeof t === 'number').map((t) => (nowSec - t) / 86400);
    const medAge = Math.round(med(ages));
    const pctNew90 = Math.round((100 * ages.filter((d) => d <= 90).length) / (ages.length || 1));
    const pctOld2y = Math.round((100 * ages.filter((d) => d >= 730).length) / (ages.length || 1));

    // views
    const views = L.map((l) => l.views ?? 0);
    const vMed = med(views), vP90 = pct(views, 0.9), vMax = Math.max(...views, 0);
    const vConc = vMed > 0 ? (vP90 / vMed).toFixed(1) : '—';

    // price ladder
    const cents = L.map(priceCents).filter((c): c is number => c != null);
    const pMin = cents.length ? Math.min(...cents) : 0;

    // optimization gaps
    const tagCounts = L.map((l) => (Array.isArray(l.tags) ? l.tags.length : 0));
    const tagsAvg = (tagCounts.reduce((a, b) => a + b, 0) / (L.length || 1)).toFixed(1);
    const pctFull13 = Math.round((100 * tagCounts.filter((c) => c >= 13).length) / (L.length || 1));
    const pctPersonalize = Math.round((100 * L.filter((l) => l.is_personalizable).length) / (L.length || 1));
    const pctVariations = Math.round((100 * L.filter((l) => l.has_variations).length) / (L.length || 1));
    const titleLenAvg = Math.round(L.reduce((a, l) => a + (l.title?.length ?? 0), 0) / (L.length || 1));

    // materials + styles
    const matCounts = new Map<string, number>();
    for (const l of L) for (const m of (l.materials ?? [])) matCounts.set(String(m).toLowerCase(), (matCounts.get(String(m).toLowerCase()) ?? 0) + 1);
    const styleCounts = new Map<string, number>();
    for (const l of L) for (const s of (l.style ?? [])) styleCounts.set(String(s).toLowerCase(), (styleCounts.get(String(s).toLowerCase()) ?? 0) + 1);

    const fmtMoney = (c: number) => `$${(c / 100).toFixed(0)}`;
    blocks.push([
      `## ${kw}  —  ${total.toLocaleString()} tổng listing`,
      ``,
      `- **Tập trung shop:** ${distinctShops} shop khác nhau trong top ${L.length}; shop dẫn đầu ${topShopShare}%, top-3 ${top3Share}%. ${top3Share < 25 ? '→ RẢI, dễ chen chân.' : top3Share < 50 ? '→ vừa phải.' : '→ ĐẶC, vài shop độc chiếm.'}`,
      `- **Tuổi listing top:** trung vị **${medAge} ngày**; ${pctNew90}% mới ≤90 ngày, ${pctOld2y}% già ≥2 năm. ${pctNew90 >= 25 ? '→ Cửa MỞ (listing mới vẫn lọt).' : pctOld2y >= 50 ? '→ Bị listing già chiếm, khó.' : '→ trung bình.'}`,
      `- **Phân bố view:** trung vị ${vMed}, p90 ${vP90}, max ${vMax}. Tỷ lệ p90/median = ${vConc}. ${typeof vConc === 'string' && parseFloat(vConc) >= 6 ? '→ vài listing hút hết view (khó vượt top đầu, nhưng phần đuôi yếu).' : '→ view rải đều, phần lớn listing đều yếu → dễ vượt.'}`,
      `- **Thang giá:** min ${fmtMoney(pMin)} · P25 ${fmtMoney(pct(cents, 0.25))} · trung vị ${fmtMoney(med(cents))} · P75 ${fmtMoney(pct(cents, 0.75))}.`,
      `- **Mức tối ưu SEO đối thủ:** trung bình ${tagsAvg}/13 tag; chỉ ${pctFull13}% dùng đủ 13 tag; tiêu đề dài TB ${titleLenAvg} ký tự. ${pctFull13 < 60 ? '→ NÊM: nhiều đối thủ bỏ trống tag → bạn dùng đủ 13 để chiếm long-tail.' : '→ đối thủ tối ưu tag tốt.'}`,
      `- **Khoảng trống thuộc tính:** ${pctPersonalize}% cho cá nhân hoá · ${pctVariations}% có biến thể. ${pctPersonalize < 30 ? '→ NÊM: thêm "personalized/custom".' : ''} ${pctVariations < 40 ? '→ NÊM: thêm biến thể (size/màu).' : ''}`.trim(),
      `- **Vật liệu phổ biến:** ${topN(matCounts, 5).map(([m, c]) => `${m}(${c})`).join(', ') || '—'}`,
      `- **Style phổ biến:** ${topN(styleCounts, 5).map(([s, c]) => `${s}(${c})`).join(', ') || '—'}`,
      ``,
    ].join('\n'));
    console.error(`${kw}: ${distinctShops} shops, medAge ${medAge}d, tags ${tagsAvg}/13, personalize ${pctPersonalize}%`);
  }

  const md = `# Page-1 depth — top 5 niches (${new Date().toISOString().slice(0, 10)})\n\nTop 48 listing/ngách, sort=score. "NÊM" = chỗ chèn được.\n\n${blocks.join('\n')}`;
  writeFileSync(new URL('./out/niche-depth.md', import.meta.url), md, 'utf8');
  console.error('\nWrote scripts/out/niche-depth.md');
  console.log(md);
}
main().catch((e) => { console.error(e); process.exit(1); });
