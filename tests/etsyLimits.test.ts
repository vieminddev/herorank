import { describe, it, expect } from 'vitest';
import {
  etsyLimitsFromEnv,
  DEFAULT_ETSY_RPS,
  DEFAULT_ETSY_RPD,
} from '../src/lib/server/services/etsy/limits';
import { createEtsyClient } from '../src/lib/server/services/etsy/client';

describe('etsyLimitsFromEnv', () => {
  it('defaults to the configured plan (5 RPS / 5000 RPD) with derived caps', () => {
    const l = etsyLimitsFromEnv({});
    expect(l.rps).toBe(DEFAULT_ETSY_RPS); // 5
    expect(l.rpd).toBe(DEFAULT_ETSY_RPD); // 5000
    expect(l.dailyCap).toBe(4500); // floor(5000 * 0.9)
    expect(l.cronCap).toBe(1800); // floor(4500 * 0.4)
  });

  it('derives caps from a custom RPD', () => {
    const l = etsyLimitsFromEnv({ ETSY_RPD: '10000', ETSY_RPS: '10' });
    expect(l.rps).toBe(10);
    expect(l.rpd).toBe(10000);
    expect(l.dailyCap).toBe(9000); // floor(10000 * 0.9)
    expect(l.cronCap).toBe(3600); // floor(9000 * 0.4)
  });

  it('honors legacy explicit ETSY_DAILY_CAP / ETSY_CRON_CAP overrides', () => {
    const l = etsyLimitsFromEnv({ ETSY_RPD: '5000', ETSY_DAILY_CAP: '4000', ETSY_CRON_CAP: '500' });
    expect(l.dailyCap).toBe(4000);
    expect(l.cronCap).toBe(500);
  });

  it('clamps a mis-set cron override to never exceed the daily cap', () => {
    const l = etsyLimitsFromEnv({ ETSY_DAILY_CAP: '1000', ETSY_CRON_CAP: '9999' });
    expect(l.cronCap).toBe(1000);
  });

  it('falls back to defaults on invalid (non-numeric / negative) values', () => {
    const l = etsyLimitsFromEnv({ ETSY_RPS: 'abc', ETSY_RPD: '-5' });
    expect(l.rps).toBe(DEFAULT_ETSY_RPS);
    expect(l.rpd).toBe(DEFAULT_ETSY_RPD);
  });
});

describe('Etsy client RPS throttle', () => {
  /** Build a client with a virtual clock + recording sleeper so we can assert request spacing. */
  function harness(rps: number) {
    let nowMs = 0;
    const sleeps: number[] = [];
    const startTimes: number[] = [];
    const sleepImpl = (ms: number) => {
      sleeps.push(ms);
      nowMs += ms; // virtual time advances by the slept amount
      return Promise.resolve();
    };
    const fetchImpl = (async () => {
      startTimes.push(nowMs);
      return new Response(JSON.stringify({ count: 0, results: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createEtsyClient({
      apiKey: 'k:s',
      rps,
      fetchImpl,
      sleepImpl,
      nowImpl: () => nowMs,
    });
    return { client, sleeps, startTimes };
  }

  it('spaces sequential requests ≥ 1000/rps ms apart (5 RPS → 200ms)', async () => {
    const { client, startTimes } = harness(5);
    for (let i = 0; i < 4; i++) {
      await client.findActiveListings({ keywords: `k${i}`, limit: 1 });
    }
    // First request fires at t=0; each subsequent one is paced 200ms later.
    expect(startTimes).toEqual([0, 200, 400, 600]);
  });

  it('does not throttle the very first request', async () => {
    const { client, sleeps } = harness(5);
    await client.findActiveListings({ keywords: 'first', limit: 1 });
    expect(sleeps).toEqual([]); // no sleep before the first physical request
  });

  it('disables throttling when rps is 0/undefined', async () => {
    const { client, sleeps } = harness(0);
    for (let i = 0; i < 3; i++) {
      await client.findActiveListings({ keywords: `k${i}`, limit: 1 });
    }
    expect(sleeps).toEqual([]);
  });
});
