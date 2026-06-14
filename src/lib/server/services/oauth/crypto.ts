/**
 * Token-at-rest encryption (Engineer H) — BR-P4-OAUTH-03.
 *
 * OAuth access/refresh tokens MUST NOT be stored in plaintext: D1 is not a secret store.
 * We encrypt them with AES-256-GCM using Web Crypto (`crypto.subtle`) — the SAME primitive
 * available in Cloudflare Workers and in Node 18+/Vitest, so the round-trip is testable with
 * zero platform shims.
 *
 * Format of a ciphertext string (single self-describing token):
 *   base64( iv[12 bytes] || ciphertext+gcmTag )
 * The 12-byte IV is generated fresh per `encrypt()` and prepended, so the same plaintext never
 * encrypts to the same bytes (semantic security) and `decrypt()` needs only the key + the blob.
 *
 * Key derivation: `env.OAUTH_TOKEN_KEY` is a caller-supplied secret string (Workers secret in
 * prod, placeholder in `.dev.vars`). It is NOT assumed to be exactly 32 bytes, so we run it
 * through SHA-256 to derive a stable 256-bit AES key. This means any non-empty secret works in
 * dev/test while a high-entropy secret is used in prod.
 *
 * NEVER log plaintext tokens or the derived key. Callers pass tokens straight from the OAuth
 * exchange into `encrypt()` and store ONLY the returned ciphertext.
 */

const IV_BYTES = 12; // AES-GCM standard nonce length
const ENC = new TextEncoder();
const DEC = new TextDecoder();

/** A bound encrypt/decrypt pair over one key (so the key is derived once per request/job). */
export interface TokenCipher {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

/**
 * Build a cipher from the raw env secret. Throws if the secret is missing/empty — callers in
 * the OAuth flow must surface a clear config error rather than store an unencrypted token.
 */
export async function createTokenCipher(secret: string | undefined): Promise<TokenCipher> {
  if (!secret || secret.length === 0) {
    throw new TokenCryptoError('OAUTH_TOKEN_KEY is not configured — cannot encrypt tokens at rest');
  }
  const key = await deriveKey(secret);
  return {
    async encrypt(plaintext: string): Promise<string> {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        ENC.encode(plaintext)
      );
      // iv || ciphertext  → base64
      const ctBytes = new Uint8Array(ct);
      const blob = new Uint8Array(iv.length + ctBytes.length);
      blob.set(iv, 0);
      blob.set(ctBytes, iv.length);
      return toBase64(blob);
    },
    async decrypt(ciphertext: string): Promise<string> {
      const blob = fromBase64(ciphertext);
      if (blob.length <= IV_BYTES) {
        throw new TokenCryptoError('ciphertext too short — corrupt or not produced by encrypt()');
      }
      const iv = blob.slice(0, IV_BYTES);
      const ct = blob.slice(IV_BYTES);
      let pt: ArrayBuffer;
      try {
        pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      } catch {
        // Wrong key or tampered ciphertext → GCM auth tag fails. Do not leak details.
        throw new TokenCryptoError('decrypt failed — wrong key or corrupt ciphertext');
      }
      return DEC.decode(pt);
    },
  };
}

/** Convenience one-shots (derive the key each call) — handy for tests; prefer the cipher in hot paths. */
export async function encryptToken(secret: string | undefined, plaintext: string): Promise<string> {
  return (await createTokenCipher(secret)).encrypt(plaintext);
}
export async function decryptToken(secret: string | undefined, ciphertext: string): Promise<string> {
  return (await createTokenCipher(secret)).decrypt(ciphertext);
}

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenCryptoError';
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', ENC.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // btoa is available in Workers + Node 18+.
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
