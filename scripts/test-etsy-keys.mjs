#!/usr/bin/env node
/**
 * Standalone Etsy API key tester — NO app code, NO npm deps (uses Node 18+ global fetch).
 *
 * Reads keys from `.env/.etsy.env` (one per line: `LABEL=keystring:shared_secret`) and probes
 * each one independently against the real Etsy Open API v3 so you can see, at a glance, which keys
 * authenticate and which still have daily quota.
 *
 * For every key it runs:
 *   1. /openapi-ping        — auth check only (does NOT spend search quota)
 *   2. /listings/active     — a real search (ONLY with --search) to confirm live data + quota
 *
 * Usage:
 *   node scripts/test-etsy-keys.mjs                       # ping-only (cheap)
 *   node scripts/test-etsy-keys.mjs --search "ceramic mug"  # also do a real search
 *   node scripts/test-etsy-keys.mjs --file path/to.env --search "boho tote"
 *
 * Exit code: 0 if every key authenticates (200/429), 1 if any key is invalid (401/403).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BASE = 'https://openapi.etsy.com/v3/application';
const __dirname = dirname(fileURLToPath(import.meta.url));

// --- args ------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
function flag(name, fallback = undefined) {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
}
const ENV_FILE = resolve(flag('--file', resolve(__dirname, '..', '.env', '.etsy.env')));
const SEARCH = argv.includes('--search') ? flag('--search', 'ceramic mug') : null;

// --- parse the key file ----------------------------------------------------------------------
// Supports TWO declaration styles in the same file:
//   1. ID/SECRET pairs:   ETSY_CLIENT_ID_1="..."  +  ETSY_CLIENT_SECRET_1="..."  (paired by suffix)
//   2. Inline:            LABEL=keystring:shared_secret
function parseKeys(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`✖ Cannot read key file: ${path}`);
    process.exit(2);
  }

  // First pass: flat VAR -> value map (quotes stripped).
  const vars = new Map();
  const inline = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const name = t.slice(0, eq).trim();
    const value = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!value) continue;
    vars.set(name, value);
    // An inline keystring:secret line (not an ID/SECRET var) → keep as-is.
    if (value.includes(':') && !/_(ID|SECRET)(_|$)/i.test(name)) {
      inline.push({ label: name, value, hasSecret: true });
    }
  }

  // Second pass: pair every *_ID[_suffix] with its matching *_SECRET[_suffix].
  const keys = [];
  for (const [name, id] of vars) {
    const m = name.match(/^(.*?)ID(_.*|)$/i); // capture prefix + optional suffix around "ID"
    if (!m) continue;
    const suffix = m[2]; // e.g. "_1" or ""
    const secretName = [...vars.keys()].find((n) =>
      new RegExp(`^${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}SECRET${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i').test(n)
    );
    const secret = secretName ? vars.get(secretName) : undefined;
    const label = (suffix || '').replace(/^_/, '') ? `KEY${suffix.replace(/^_/, '')}` : name;
    keys.push({ label, value: secret ? `${id}:${secret}` : id, hasSecret: !!secret });
  }

  return keys.length ? keys : inline;
}

// --- one HTTP probe --------------------------------------------------------------------------
async function probe(path, apiKey) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'x-api-key': apiKey, accept: 'application/json' },
    });
    const ms = Date.now() - t0;
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON */
    }
    return { status: res.status, ms, body };
  } catch (err) {
    return { status: 0, ms: Date.now() - t0, body: { error: String(err?.message || err) } };
  }
}

function verdict(pingStatus) {
  if (pingStatus === 200) return '✅ WORKING';
  if (pingStatus === 429) return '⚠️  VALID but quota EXHAUSTED (429)';
  if (pingStatus === 401 || pingStatus === 403) return '✖ BAD KEY / auth failed';
  if (pingStatus === 0) return '✖ NETWORK error';
  return `? unexpected ${pingStatus}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- run -------------------------------------------------------------------------------------
const keys = parseKeys(ENV_FILE);
if (keys.length === 0) {
  console.error(`No keys found in ${ENV_FILE} (expected lines like  KEY1=keystring:secret)`);
  process.exit(2);
}

console.log(`Etsy key tester — ${keys.length} key(s) from ${ENV_FILE}`);
console.log(`Mode: ${SEARCH ? `ping + real search "${SEARCH}"` : 'ping only (use --search "kw" to also search)'}`);
console.log('─'.repeat(72));

let allAuthOk = true;

for (let i = 0; i < keys.length; i++) {
  const k = keys[i];
  // Mask the secret in output so logs are shareable.
  const [ks, sec] = k.value.split(':');
  const masked = sec ? `${ks}:${'*'.repeat(Math.min(sec.length, 6))}` : ks;

  console.log(`\n[${k.label}]  ${masked}`);
  if (!k.hasSecret) {
    console.log('  ⚠️  No ":secret" in this line — Etsy v3 requires keystring:shared_secret → will 403.');
  }

  const ping = await probe('/openapi-ping', k.value);
  const v = verdict(ping.status);
  if (ping.status === 401 || ping.status === 403 || ping.status === 0) allAuthOk = false;
  const appId = ping.body?.application_id ? ` app_id=${ping.body.application_id}` : '';
  const errMsg = ping.body?.error ? ` — ${ping.body.error}` : '';
  console.log(`  ping     HTTP ${ping.status} (${ping.ms}ms)  ${v}${appId}${errMsg}`);

  if (SEARCH && ping.status === 200) {
    await sleep(250); // stay under ~5 RPS between calls
    const q = encodeURIComponent(SEARCH);
    const s = await probe(`/listings/active?keywords=${q}&limit=1`, k.value);
    if (s.status === 200) {
      console.log(`  search   HTTP 200 (${s.ms}ms)  total listings for "${SEARCH}": ${s.body?.count ?? '?'}`);
    } else {
      console.log(`  search   HTTP ${s.status} (${s.ms}ms)  ${s.body?.error ?? ''}`);
    }
  }

  if (i < keys.length - 1) await sleep(250);
}

console.log('\n' + '─'.repeat(72));
console.log(allAuthOk ? '✅ All keys authenticated.' : '✖ At least one key failed auth (401/403).');
process.exit(allAuthOk ? 0 : 1);
