import { describe, it, expect } from 'vitest';
import { makeSqliteD1 } from './helpers/sqliteD1';
import { createEtsyKeyPool } from '../src/lib/server/services/etsy/keyPool';
import { createEtsyClient, EtsyDailyLimitError, QuotaExceededError } from '../src/lib/server/services/etsy/client';
import { etsyApiKeys } from '../src/lib/server/env';
import type { Env } from '../src/lib/server/env';

const KEYS = [
  { id: 'aaaaaaaa', apiKey: 'aaaaaaaa1:s1' },
  { id: 'bbbbbbbb', apiKey: 'bbbbbbbb2:s2' },
  { id: 'cccccccc', apiKey: 'cccccccc3:s3' },
];

function poolCfg(db: ReturnType<typeof makeSqliteD1>['db'], over = {}) {
  return { db, rpsPerKey: 0, rpdPerKey: 1000, sleepImpl: async () => {}, nowImpl: () => 1_800_000_000_000, ...over };
}

describe('etsyApiKeys (env parsing)', () => {
  it('parses ETSY_API_KEYS list (comma/newline) and drops secret-less entries + dups', () => {
    const env = { ETSY_API_KEYS: 'k1aaaaaa:s1, k2bbbbbb:s2\nk1aaaaaa:s1\nnosecret' } as unknown as Env;
    const keys = etsyApiKeys(env);
    expect(keys.map((k) => k.apiKey)).toEqual(['k1aaaaaa:s1', 'k2bbbbbb:s2']); // dedup + drop "nosecret"
  });

  it('falls back to the single ETSY_API_KEY/SECRET pair', () => {
    const env = { ETSY_API_KEY: 'single12', ETSY_API_SECRET: 'sec' } as unknown as Env;
    expect(etsyApiKeys(env)).toEqual([{ id: 'single12', apiKey: 'single12:sec' }]);
  });
});

describe('EtsyKeyPool rotation', () => {
  it('round-robins across keys (spreads load)', async () => {
    const { db, keyUsage } = makeSqliteD1();
    const pool = createEtsyKeyPool(KEYS, poolCfg(db));
    const used: string[] = [];
    for (let i = 0; i < 6; i++) await pool.execute(async (apiKey) => { used.push(apiKey); return 'ok'; });
    // 6 calls over 3 keys → each key used twice.
    const counts = KEYS.map((k) => used.filter((u) => u === k.apiKey).length);
    expect(counts).toEqual([2, 2, 2]);
    expect(keyUsage.size).toBe(3);
  });

  it('rotates to the next key on a DAILY-limit 429 and exhausts the offender', async () => {
    const { db } = makeSqliteD1();
    const pool = createEtsyKeyPool(KEYS, poolCfg(db, { startIndex: 0 }));
    // Key A (first in order) always daily-429s; the pool should fall through to key B and succeed.
    const seen: string[] = [];
    const res = await pool.execute(async (apiKey) => {
      seen.push(apiKey);
      if (apiKey === KEYS[0].apiKey) throw new EtsyDailyLimitError();
      return 'served-by-' + apiKey;
    });
    expect(res).toBe('served-by-' + KEYS[1].apiKey);
    expect(seen).toEqual([KEYS[0].apiKey, KEYS[1].apiKey]);

    // Key A is now exhausted for the day → next call skips it entirely (round-robin over B,C).
    const seen2: string[] = [];
    await pool.execute(async (apiKey) => { seen2.push(apiKey); return 'ok'; });
    expect(seen2).not.toContain(KEYS[0].apiKey);
  });

  it('skips a key whose local daily cap is reached, then throws when all are exhausted', async () => {
    const { db } = makeSqliteD1();
    const pool = createEtsyKeyPool([KEYS[0]], poolCfg(db, { rpdPerKey: 2 }));
    await pool.execute(async () => 'a'); // count 1
    await pool.execute(async () => 'b'); // count 2 (= cap)
    await expect(pool.execute(async () => 'c')).rejects.toBeInstanceOf(QuotaExceededError); // cap hit
  });
});

describe('client + pool integration', () => {
  it('routes requests through the pool and rotates off a daily-limited key', async () => {
    const { db } = makeSqliteD1();
    // fetch: key A → 429 daily; key B → 200.
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const key = (init.headers as Record<string, string>)['x-api-key'];
      if (key === KEYS[0].apiKey) {
        return new Response(JSON.stringify({ error: 'Exceeded daily rate limit' }), { status: 429 });
      }
      return new Response(JSON.stringify({ count: 42, results: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const pool = createEtsyKeyPool(KEYS, poolCfg(db, { startIndex: 0 }));
    const client = createEtsyClient({ apiKey: '', keyPool: pool, fetchImpl, sleepImpl: async () => {} });

    const page = await client.findActiveListings({ keywords: 'mug', limit: 1 });
    expect(page.count).toBe(42); // served by a healthy key after rotating off the daily-limited one
  });
});
