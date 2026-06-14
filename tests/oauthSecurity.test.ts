/**
 * OAuth security regression tests (Engineer SEC, Phase 5 — S9, non-regression).
 *
 * The Phase-4 OAuth flow (Engineer H) already enforces CSRF state one-shot + expiry and PKCE
 * S256 (covered in tests/oauth.test.ts). S9 adds adversarial coverage WITHOUT changing that
 * logic — a separate file so it does not collide with H's suite:
 *
 *   • state REUSE → reject: a captured state is single-use; a replayed callback with the same
 *     state finds no row (consumed) → the route would 400. We assert through the repo + a
 *     model of the callback's state check.
 *   • PKCE verifier BINDING: the code_verifier is stored WITH the state and returned only to the
 *     matching callback — an attacker cannot pair a stolen `code` with a verifier of their own
 *     choosing; the verifier is whatever was bound at /start. We assert the bound verifier is the
 *     one used for the exchange, and that an S256 mismatch (wrong verifier) is what the upstream
 *     token endpoint rejects (modelled by a token stub that 400s on the wrong verifier).
 *   • cross-user state: a state minted for user A cannot be consumed as user B (the route checks
 *     `stateRow.user_id === user.id`).
 *
 * Hermetic: in-memory D1 for oauth_states + an injected token fetch. No real Etsy / OAuth key.
 */
import { describe, it, expect } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import {
  generatePkce,
  randomUrlToken,
  createEtsyOAuthClient,
  EtsyOAuthError,
  type FetchImpl,
} from '../src/lib/server/services/oauth/etsyOAuth';
import { createTokenCipher } from '../src/lib/server/services/oauth/crypto';
import { createConnectedShopRepo } from '../src/lib/server/services/oauth/connectedShopRepo';

const ENC_KEY = 'test-oauth-token-key-0123456789'; // any non-empty secret; cipher derives the key

// --- minimal in-memory D1 for oauth_states (same shape H's repo touches) ----------------
function makeStatesD1() {
  const states = new Map<
    string,
    { state: string; user_id: string; code_verifier: string; created_at: number }
  >();
  const nowSec = () => Math.floor(Date.now() / 1000);

  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const api = {
        bind(...a: unknown[]) {
          args = a;
          return api;
        },
        async first<T>() {
          if (sql.includes('FROM oauth_states')) {
            return (states.get(args[0] as string) ?? null) as unknown as T | null;
          }
          return null as unknown as T | null;
        },
        async run() {
          if (sql.startsWith('INSERT INTO oauth_states')) {
            const [state, user_id, code_verifier] = args as [string, string, string];
            states.set(state, { state, user_id, code_verifier, created_at: nowSec() });
          } else if (sql.startsWith('DELETE FROM oauth_states WHERE state')) {
            states.delete(args[0] as string);
          }
          return { success: true, meta: {} } as unknown as D1Result;
        },
        async all<T>() {
          return { results: [] as T[] } as unknown as D1Result<T>;
        },
      };
      return api;
    },
  } as unknown as D1Database;

  return { db, states };
}

/**
 * Model the callback's state check (oauth.ts): one-shot consume + owner match. Returns the
 * bound code_verifier on success, or a rejection reason.
 */
async function consumeState(
  repo: Awaited<ReturnType<typeof createConnectedShopRepo>>,
  state: string,
  callerUserId: string
): Promise<{ ok: true; codeVerifier: string } | { ok: false; reason: string }> {
  const row = await repo.takeState(state);
  if (!row) return { ok: false, reason: 'invalid_or_expired_state' };
  if (row.user_id !== callerUserId) return { ok: false, reason: 'state_owner_mismatch' };
  return { ok: true, codeVerifier: row.code_verifier };
}

describe('S9: OAuth state is single-use (replay rejected through the callback)', () => {
  it('a replayed callback with the same state is rejected (one-shot consume)', async () => {
    const { db } = makeStatesD1();
    const repo = createConnectedShopRepo(db, await createTokenCipher(ENC_KEY));

    const state = randomUrlToken(24);
    const { codeVerifier } = await generatePkce();
    await repo.putState({ state, userId: 'userA', codeVerifier });

    const first = await consumeState(repo, state, 'userA');
    expect(first.ok).toBe(true);

    // Attacker replays the SAME state (e.g. a leaked callback URL).
    const replay = await consumeState(repo, state, 'userA');
    expect(replay).toEqual({ ok: false, reason: 'invalid_or_expired_state' });
  });

  it('a state minted for user A cannot be consumed as user B (CSRF owner check)', async () => {
    const { db } = makeStatesD1();
    const repo = createConnectedShopRepo(db, await createTokenCipher(ENC_KEY));
    const state = randomUrlToken(24);
    const { codeVerifier } = await generatePkce();
    await repo.putState({ state, userId: 'userA', codeVerifier });

    const asB = await consumeState(repo, state, 'userB');
    expect(asB).toEqual({ ok: false, reason: 'state_owner_mismatch' });
  });
});

describe('S9: PKCE verifier is bound to the state (S256 mismatch rejected)', () => {
  it('the exchange uses the verifier bound at /start — not an attacker-chosen one', async () => {
    const { db } = makeStatesD1();
    const repo = createConnectedShopRepo(db, await createTokenCipher(ENC_KEY));

    const state = randomUrlToken(24);
    const { codeVerifier, codeChallenge } = await generatePkce();
    await repo.putState({ state, userId: 'userA', codeVerifier });

    // Token stub that enforces PKCE: it only issues a token when the verifier presented hashes
    // to the challenge bound at /start (i.e. matches `codeVerifier`). A wrong verifier → 400,
    // exactly as Etsy's token endpoint behaves on an S256 mismatch.
    const tokenFetch: FetchImpl = async (url, init) => {
      if (url.endsWith('/oauth/token')) {
        const body = new URLSearchParams(String(init?.body ?? ''));
        const presented = body.get('code_verifier');
        if (presented !== codeVerifier) {
          return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
        }
        return new Response(
          JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    };

    const client = createEtsyOAuthClient({
      clientId: 'cid',
      redirectUri: 'https://app/cb',
      fetchImpl: tokenFetch,
      authorizeUrl: 'https://auth.local/connect',
    });
    void codeChallenge;

    // Honest flow: consume the state, get the BOUND verifier, exchange → succeeds.
    const consumed = await consumeState(repo, state, 'userA');
    expect(consumed.ok).toBe(true);
    if (!consumed.ok) return;
    const tokens = await client.exchangeCode({ code: 'CODE', codeVerifier: consumed.codeVerifier });
    expect(tokens.accessToken).toBe('AT');
  });

  it('an exchange with a WRONG verifier (S256 mismatch) is rejected by the token endpoint', async () => {
    const { codeVerifier } = await generatePkce();
    const tokenFetch: FetchImpl = async (url, init) => {
      if (url.endsWith('/oauth/token')) {
        const presented = new URLSearchParams(String(init?.body ?? '')).get('code_verifier');
        if (presented !== codeVerifier) {
          return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
        }
        return new Response(JSON.stringify({ access_token: 'AT', refresh_token: 'RT' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    };
    const client = createEtsyOAuthClient({ clientId: 'cid', redirectUri: 'https://app/cb', fetchImpl: tokenFetch });

    await expect(
      client.exchangeCode({ code: 'CODE', codeVerifier: 'attacker-chosen-verifier' })
    ).rejects.toBeInstanceOf(EtsyOAuthError);
  });
});
