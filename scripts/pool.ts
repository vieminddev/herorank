/**
 * Shared Etsy fetch helper for investigation/data-gathering scripts.
 *
 * Uses the CRON/BACKGROUND key pool (from .env/.etsy.env), NOT the 8mh6 seller-facing OAuth key —
 * this keeps analytics-harvesting off the irreplaceable seller key (compliance boundary; see
 * memory etsy-oauth-apikey-fix / etsy-commercial-api-compliance).
 *
 * Defaults to the 2 keys confirmed alive on 2026-07-02 (72cw8z2w, yb9gwm64). 63pjadbm was still
 * rolling-window 429 that morning — omitted; add its prefix back once it recovers. Round-robins,
 * paces globally, and on a DAILY-limit 429 drops that key for the run and rotates (mirrors keyPool).
 */
import { readFileSync } from 'node:fs';

const BASE = 'https://openapi.etsy.com/v3/application';
export const RECOVERED_KEYS = ['72cw8z2w', 'yb9gwm64'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function loadPoolKeys(prefixes: string[] = RECOVERED_KEYS): { id: string; apiKey: string }[] {
  const raw = readFileSync(new URL('../.env/.etsy.env', import.meta.url), 'utf8');
  const ids: Record<string, string> = {};
  const secs: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*ETSY_CLIENT_(ID|SECRET)_(\d+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const v = m[3].trim().replace(/^["']|["']$/g, '');
    (m[1] === 'ID' ? ids : secs)[m[2]] = v;
  }
  const out: { id: string; apiKey: string }[] = [];
  const seen = new Set<string>();
  for (const n of Object.keys(ids)) {
    const id = ids[n], sec = secs[n];
    if (!id || !sec) continue;
    const prefix = id.slice(0, 8);
    if (prefixes.length && !prefixes.includes(prefix)) continue;
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    out.push({ id: prefix, apiKey: `${id}:${sec}` });
  }
  return out;
}

export interface Pool {
  get(path: string): Promise<{ ok: boolean; status: number; json: any }>;
  keyIds: string[];
  exhaustedIds(): string[];
}

/** rps = TOTAL requests/sec across all keys (each key's share stays well under Etsy's 5/key). */
export function createPool(opts: { prefixes?: string[]; rps?: number; timeoutMs?: number } = {}): Pool {
  const keys = loadPoolKeys(opts.prefixes);
  if (!keys.length) throw new Error('No pool keys loaded from .env/.etsy.env');
  const minGap = 1000 / (opts.rps ?? 6);
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const exhausted = new Set<string>();
  let rr = 0, gateNext = 0;

  async function gate() {
    const now = Date.now();
    const s = Math.max(now, gateNext);
    gateNext = s + minGap;
    if (s > now) await sleep(s - now);
  }

  async function get(path: string) {
    const avail = keys.filter((k) => !exhausted.has(k.id));
    if (!avail.length) throw new Error('All pool keys exhausted (daily limit) — stop and resume later');
    for (let i = 0; i < avail.length; i++) {
      const key = avail[(rr + i) % avail.length];
      await gate();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${BASE}${path}`, { headers: { 'x-api-key': key.apiKey, accept: 'application/json' }, signal: controller.signal });
        if (res.status === 429) {
          const body = await res.text().catch(() => '');
          if (/daily/i.test(body)) { exhausted.add(key.id); continue; }  // daily-limit → drop key, rotate
          await sleep(800); continue;                                     // transient per-sec → next key
        }
        rr = (rr + i + 1) % avail.length;
        const json = res.ok ? await res.json().catch(() => null) : null;
        return { ok: res.ok, status: res.status, json };
      } catch { /* timeout/network → try next key */ }
      finally { clearTimeout(timer); }
    }
    return { ok: false, status: 0, json: null };
  }

  return { get, keyIds: keys.map((k) => k.id), exhaustedIds: () => [...exhausted] };
}
