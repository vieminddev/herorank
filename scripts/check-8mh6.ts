/**
 * One-off keyword demand probe via the 8mh6 OAuth key (ETSY_OAUTH_CLIENT_ID:SECRET from .dev.vars).
 * Use ONLY for explicit one-off checks — background/bulk work uses the pool (scripts/pool.ts).
 *
 * NOTE: Etsy's public API has NO search-volume endpoint. This reports the observable demand PROXIES:
 * result_count (supply), listing views (median/total/top), favorers, and VieRank's demandScore index.
 *
 * Run: npx tsx scripts/check-8mh6.ts "orange cat memorial plate"
 */
import { readFileSync } from 'node:fs';
import { demandScore } from '../src/lib/server/services/estimation/index';

const KW = process.argv.slice(2).join(' ') || 'orange cat memorial plate';
const BASE = 'https://openapi.etsy.com/v3/application';

function devVar(name: string): string {
  const raw = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === name) return m[2].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}
function median(xs: number[]): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }

async function main() {
  const apiKey = `${devVar('ETSY_OAUTH_CLIENT_ID')}:${devVar('ETSY_OAUTH_CLIENT_SECRET')}`;
  const res = await fetch(`${BASE}/listings/active?keywords=${encodeURIComponent(KW)}&sort_on=score&limit=100`, { headers: { 'x-api-key': apiKey, accept: 'application/json' } });
  if (!res.ok) { console.error(`HTTP ${res.status} — ${await res.text().catch(() => '')}`); process.exit(1); }
  const j: any = await res.json();
  const L: any[] = j.results ?? [];
  const views = L.map((l) => l.views ?? 0);
  const faves = L.map((l) => l.num_favorers ?? 0);
  const cents = L.map((l) => (l.price?.divisor ? Math.round((l.price.amount / l.price.divisor) * 100) : 0)).filter((c) => c > 0);
  const top = [...L].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 5);
  const d = demandScore({ resultCount: j.count ?? L.length, aggregateReviewVelocity: Math.round(faves.reduce((a, b) => a + b, 0) / 1000), favoritesSignal: faves.reduce((a, b) => a + b, 0), aggregateViews: views.reduce((a, b) => a + b, 0) });
  console.log(`\n=== "${KW}" (via 8mh6) ===`);
  console.log(`Cung (result_count): ${(j.count ?? 0).toLocaleString()} listing`);
  console.log(`Mẫu lấy về: ${L.length} listing (trang 1, sort=score)`);
  console.log(`VIEWS/listing — trung vị ${median(views)} · p90 ${[...views].sort((a, b) => a - b)[Math.floor(views.length * 0.9)] ?? 0} · tổng ${views.reduce((a, b) => a + b, 0).toLocaleString()} · max ${Math.max(...views, 0).toLocaleString()}`);
  console.log(`FAVORITES tổng (mẫu): ${faves.reduce((a, b) => a + b, 0).toLocaleString()}`);
  console.log(`GIÁ trung vị: $${(median(cents) / 100).toFixed(2)}`);
  console.log(`demandScore index (0-100): ${d.score} (${d.label})`);
  console.log(`\nTop 5 listing theo views:`);
  for (const l of top) console.log(`  • ${(l.views ?? 0).toLocaleString()} views · ${l.num_favorers ?? 0} faves · $${l.price?.divisor ? (l.price.amount / l.price.divisor).toFixed(2) : '?'} — ${(l.title ?? '').slice(0, 70)}`);
  console.log(`\n⚠️ Etsy KHÔNG cung cấp search volume; trên là proxy cầu (views/faves/cung), không phải số lượt tìm.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
