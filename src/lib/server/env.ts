/**
 * Cloudflare Workers runtime bindings + secrets (the `platform.env` shape).
 *
 * This is the single source of truth for the `Env` type. It is referenced by:
 *  - `App.Platform.Env` in `app.d.ts` (SvelteKit `event.platform.env`)
 *  - the Hono app context (`c.env`) in `src/lib/server/api/app.ts`
 *
 * Engineers B/C: import `Env` from here, do NOT redeclare it.
 */
import type {
  D1Database,
  KVNamespace,
  Queue,
  Fetcher,
  AnalyticsEngineDataset,
  R2Bucket,
} from '@cloudflare/workers-types';

export interface Env {
  // --- Bindings (wrangler.jsonc) ---
  DB: D1Database;
  /**
   * Analytics time-series database (`vierank-history`). Holds the unified `metric_series` long
   * table — all historical market signals (keyword demand, shop sales velocity, listing rank/price).
   * Split out from `DB` so append-heavy cron writes don't contend with OLTP and neither DB nears the
   * per-database 10GB ceiling. Optional in the type so request-less/test contexts compile; in prod
   * it is always bound. Repos route to it via `getHistoryDb()` (routes) or `env.HISTORY_DB` (cron).
   */
  HISTORY_DB?: D1Database;
  KV: KVNamespace;
  /**
   * Analytics Engine dataset for Cloudflare-native observability (Phase 5 O1/O2, INFRA-EDGE).
   * Optional: when absent (plain `vite dev`, or before the dataset is provisioned) the
   * structured logger still emits JSON console lines; only the queryable-metric sink is skipped.
   * Add a `analytics_engine_datasets` binding named `ANALYTICS` in wrangler.jsonc to enable.
   */
  ANALYTICS?: AnalyticsEngineDataset;
  /**
   * Static Assets binding (Phase 4 Workers Static-Assets migration, Engineer A).
   * The adapter-generated worker fetches client/prerendered assets via this binding.
   * Present in Workers mode; absent under plain `vite dev` (SvelteKit serves assets).
   */
  ASSETS?: Fetcher;
  /**
   * R2 bucket for cold archive of pruned time-series rows (NDJSON.gz). Retention dumps rows here
   * before deleting them from D1 so operational history is kept for backfill/read-path continuity
   * at ~$0 (R2 has zero egress). Optional: absent under plain `vite dev` → retention prunes delete-only.
   */
  ARCHIVE?: R2Bucket;

  // --- Auth ---
  BETTER_AUTH_SECRET: string;
  /** Optional explicit origin override (e.g. https://herorank.com). Falls back to request origin. */
  BETTER_AUTH_URL?: string;
  /**
   * Transactional email (password reset + email verification) via Resend. When BOTH this and
   * EMAIL_FROM are set, those flows activate AND email verification is enforced on sign-in;
   * absent → reset/verify are no-ops and verification is NOT required (so accounts aren't locked out
   * before email is configured). See services/email.ts.
   */
  RESEND_API_KEY?: string;
  /** From address for transactional email, e.g. "VieRank <no-reply@vierank.com>". */
  EMAIL_FROM?: string;
  /** Recipient for operational alerts (cron overdue, etc.). Falls back to EMAIL_FROM. */
  ALERT_EMAIL?: string;
  /** Google social-login OAuth credentials. When both set, the "Continue with Google" button works. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  // --- Stripe (Eng B) ---
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_SIDE_MONTHLY?: string;
  STRIPE_PRICE_SIDE_YEARLY?: string;
  STRIPE_PRICE_BUSINESS_MONTHLY?: string;
  STRIPE_PRICE_BUSINESS_YEARLY?: string;
  STRIPE_PRICE_ENTERPRISE_MONTHLY?: string;
  STRIPE_PRICE_ENTERPRISE_YEARLY?: string;

  // --- LLM gateway (Phase 2; declared now so config is stable) ---
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  /** Gateway model name (OpenAI-compatible). Never hardcoded — env-driven (spec §10). */
  LLM_MODEL?: string;
  /**
   * Optional "fast" model for heavy structured-JSON tools (e.g. chatgpt-optimizer) where the
   * default reasoning model's `reasoning_content` doubles completion tokens and tips the gateway
   * into a 502 under load. Should be a NO-THINKING variant (e.g. `gemini-2.5-flash-nothinking`).
   * Absent → falls back to a sensible no-thinking default in `llm-tools.ts`.
   */
  LLM_FAST_MODEL?: string;
  /**
   * OpenAI-compatible IMAGE model for the `image-studio` tool (Phase 5). Absent → image-studio
   * returns 503 IMAGE_UNAVAILABLE (no credit spent). Env-driven, never hardcoded.
   */
  IMAGE_MODEL?: string;

  // --- Etsy data (Phase 3; declared now so config is stable, PM decision Q7) ---
  ETSY_API_KEY?: string;
  ETSY_API_SECRET?: string;
  /**
   * Etsy app RATE limits — the two knobs to edit when your Etsy plan changes (see
   * `services/etsy/limits.ts`). `dailyCap` and `cronCap` are DERIVED from these.
   */
  /**
   * Optional MULTI-KEY pool — newline/comma-separated `keystring:shared_secret` entries. When ≥2
   * entries are present the Etsy client rotates across them (each key has its own 5 RPS / 5000 RPD),
   * multiplying effective throughput. Absent → falls back to the single `ETSY_API_KEY` pair.
   */
  ETSY_API_KEYS?: string;
  /** Requests/SECOND ceiling. Default 5. Drives the proactive throttle in the Etsy client. */
  ETSY_RPS?: string;
  /** Requests/DAY ceiling. Default 5000. Drives the internal daily hard-cap + quota-warning. */
  ETSY_RPD?: string;
  /** Legacy explicit override for the internal daily hard-cap. Default derived from ETSY_RPD. */
  ETSY_DAILY_CAP?: string;
  /** Legacy explicit override for the cron sub-cap. Default derived from the daily cap. */
  ETSY_CRON_CAP?: string;
  /**
   * Max Etsy calls in flight during a cron research sweep (refreshTrends/refreshBestSellers).
   * Default 8. Physical per-second rate stays bounded by the key pool's per-key gate (each key
   * ≤ ETSY_RPS), so concurrency only fans the sweep across the pool's keys — it never bursts a
   * single key past its limit. Higher = faster sweep (a research half drops from ~13 min to ~1 min).
   */
  ETSY_REFRESH_CONCURRENCY?: string;
  /**
   * How many NEW shops get their full public-review history paginated into `metric_series` per
   * best-sellers cron run (deep sales-cadence backfill). Default 8. Higher = history fills faster but
   * spends more Etsy quota per run; idempotent skips of already-backfilled shops are free.
   */
  HISTORY_BACKFILL_PER_RUN?: string;
  /**
   * Soft daily ceiling (total logical Etsy calls/day) the background history accumulator aims to fill
   * while there are no users. Default 12000 — below the keyPool's hard ≈13500 (3 keys × ~4500). The
   * accumulator reads the day's usage and only spends up to the remaining budget, so it converges to
   * this number and never exceeds it. Raise toward 13000 to fill history faster; lower to leave more
   * headroom for live users once they arrive.
   */
  HISTORY_DAILY_TARGET?: string;
  /** Max Etsy calls the accumulator adds per 30-min tick. Default 250 (~17s of work). */
  HISTORY_ACCUM_PER_TICK?: string;
  /**
   * Hard cap on shops the accumulator pulls from the backfill queue per tick. Default 40. Raise it
   * when shops are "shallow" (few review pages) so a fat per-tick call budget isn't left unspent by
   * the shop-count cap. Keep it so tick wall-clock stays small (shops × pages / pooled RPS).
   */
  HISTORY_ACCUM_SHOPS_PER_TICK?: string;
  /**
   * Shops sampled per category in the best-sellers sweep (the discovery feed for the accumulator's
   * backfill queue). Default 20. Raising it discovers more shops/day to deepen — costs more calls in
   * the daily best-sellers run (watch its wall-clock).
   */
  BESTSELLERS_SHOPS_PER_CAT?: string;
  /** Lead keywords per category used to discover candidate shops. Default 3. */
  BESTSELLERS_LEADS?: string;

  // --- Phase 4: jobs (queues) + OAuth connected shops (Engineer A — infra bindings/secrets) ---
  /**
   * Queue PRODUCER binding for deep shop analysis (§2). The producer route
   * (Engineer F) enqueues jobs here; the consumer is `handleQueue` (src/worker.ts).
   * Optional: absent under plain `vite dev` (no queue) → producer falls back to
   * inline `waitUntil` processing (BR-P4-Q-03). Message shape: AnalysisQueueMessage
   * (src/lib/server/jobs/types.ts).
   */
  ANALYSIS_QUEUE?: Queue;

  /** Etsy OAuth keystring. Absent → OAuth runs against the mock provider (BR-P4-OAUTH-05). Engineer H. */
  ETSY_OAUTH_CLIENT_ID?: string;
  /** Etsy OAuth shared secret. Engineer H. */
  ETSY_OAUTH_CLIENT_SECRET?: string;
  /** Absolute redirect URI: /api/connect/etsy/callback. Engineer H. */
  ETSY_OAUTH_REDIRECT_URI?: string;
  /**
   * AES-GCM key (base64) for encrypting OAuth tokens at rest — D1 is not a secret
   * store (BR-P4-OAUTH-03). Workers secret in prod; placeholder in .dev.vars. Engineer H consumes.
   */
  OAUTH_TOKEN_KEY?: string;
  /**
   * Etsy listing-WRITE feature flag (`/my-shop` edit/restore + `listings_w` OAuth scope).
   * Accepts "true"/"1" (case-insensitive). Absent/false → edits return WRITE_PENDING_APPROVAL
   * and only read scopes are requested. Flips on automatically once Etsy grants write access.
   */
  ETSY_WRITE_ENABLED?: string;

  // --- Phase 5: rate-limit threshold overrides (S2, INFRA-EDGE) ---
  // All optional; absent → tuned soft-beta defaults in api/middleware/rateLimit.ts.
  // Plain `vars` (not secrets) — values are non-sensitive integers.
  /** LLM-tool bucket: max requests per hour per user. Default 30. */
  RATE_LIMIT_LLM_PER_HOUR?: string;
  /** General /api/* bucket: max requests per minute per IP. Default 120. */
  RATE_LIMIT_GENERAL_PER_MIN?: string;
  /** Auth bucket (hooks layer): max sign-in/sign-up attempts per 15 min per IP. Default 10. */
  RATE_LIMIT_AUTH_PER_15MIN?: string;
  /** Internal API key for server-to-server endpoints (Section 11). */
  INTERNAL_API_KEY?: string;

  // --- AI Video Studio (VEO3 / media.viemind.ai) ---
  /**
   * Public base URL of the VEO3 media server (e.g. https://media.viemind.ai). The Image-to-Video
   * pipeline POSTs `/api/queue/video` here and downloads the finished MP4 from `/api/media/download`.
   * Absent → video-studio returns 503 VIDEO_UNAVAILABLE (no credit spent).
   */
  VEO3_SERVER_URL?: string;
  /** VEO3 API key — sent as all three headers (x-api-key, api-key, Authorization: Bearer). */
  VEO3_API_KEY?: string;
  /**
   * Shared secret embedded in the webhook `callbackUrl` (?token=) so we can verify a callback
   * really came from our own VEO3 submit. Falls back to VEO3_API_KEY when unset.
   */
  VEO3_WEBHOOK_SECRET?: string;
  /**
   * Image Studio provider rotation: percent of text→image generations routed to VEO3
   * (media.viemind.ai) vs the default sync provider (vtoken). 0–100, default 70. Reference/img2img
   * requests always use the sync provider (VEO3 can't condition on a reference yet). Only takes
   * effect when VEO3_SERVER_URL + VEO3_API_KEY are set; otherwise everything uses the sync provider.
   */
  VEO3_IMAGE_PERCENT?: string;
}

/**
 * Value for the Etsy `x-api-key` header. Since 2026-02-09 Etsy requires the keystring AND the
 * shared secret, formatted as `keystring:shared_secret`, on every v3 API call — the keystring
 * alone now 403s with "Shared secret is required in x-api-key header." Returns `undefined` when
 * no keystring is configured (the caller then runs the mock path).
 */
export function etsyApiKey(
  env: Pick<Env, 'ETSY_API_KEY' | 'ETSY_API_SECRET' | 'ETSY_OAUTH_CLIENT_ID' | 'ETSY_OAUTH_CLIENT_SECRET'>
): string | undefined {
  // Accept either the dedicated API pair (ETSY_API_KEY/ETSY_API_SECRET) or the OAuth pair
  // (ETSY_OAUTH_CLIENT_ID/SECRET) — they're the same Etsy keystring+secret. Verified live:
  // the keystring alone 403s ("Shared secret is required"); `keystring:secret` returns 200.
  const keystring = env.ETSY_API_KEY ?? env.ETSY_OAUTH_CLIENT_ID;
  if (!keystring) return undefined;
  const secret = env.ETSY_API_SECRET ?? env.ETSY_OAUTH_CLIENT_SECRET;
  return secret ? `${keystring}:${secret}` : keystring;
}

/**
 * The x-api-key for OAuth-authenticated (Bearer) calls — own-shop reads + listing writes.
 *
 * This MUST be the OAuth app's OWN `keystring:shared_secret` (the app that minted the user's
 * access token). Etsy rejects a Bearer token paired with a DIFFERENT app's key ("requires scope"
 * / 401-403). Distinct from `etsyApiKey()`, which prefers the separate read/scraping `ETSY_API_KEY`
 * pool key — using that for OAuth calls is an app mismatch and was the cause of the spurious
 * "reconnect your shop" errors. Verified live: keystring alone 403s ("Shared secret is required");
 * `keystring:secret` of the OAuth app returns 200 with the Bearer token.
 */
export function etsyOAuthApiKey(
  env: Pick<Env, 'ETSY_OAUTH_CLIENT_ID' | 'ETSY_OAUTH_CLIENT_SECRET'>
): string | undefined {
  const keystring = env.ETSY_OAUTH_CLIENT_ID;
  if (!keystring) return undefined;
  return env.ETSY_OAUTH_CLIENT_SECRET ? `${keystring}:${env.ETSY_OAUTH_CLIENT_SECRET}` : keystring;
}

/** One entry in the Etsy key pool. */
export interface EtsyKeyEntry {
  /** Stable, non-sensitive id (keystring prefix) used for per-key usage rows + rotation. */
  id: string;
  /** `keystring:shared_secret` for the x-api-key header. */
  apiKey: string;
}

/**
 * The Etsy key pool. Prefers `ETSY_API_KEYS` (newline/comma-separated `keystring:secret` list);
 * otherwise the single `ETSY_API_KEY`/OAuth pair. Entries without a `:secret` are dropped (Etsy v3
 * requires the shared secret). Returns [] when nothing is configured (caller runs the mock path).
 */
export function etsyApiKeys(
  env: Pick<Env, 'ETSY_API_KEYS' | 'ETSY_API_KEY' | 'ETSY_API_SECRET' | 'ETSY_OAUTH_CLIENT_ID' | 'ETSY_OAUTH_CLIENT_SECRET'>
): EtsyKeyEntry[] {
  const raw = env.ETSY_API_KEYS?.trim();
  const list = raw
    ? raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
    : [etsyApiKey(env)].filter((v): v is string => !!v);

  const seen = new Set<string>();
  const out: EtsyKeyEntry[] = [];
  for (const apiKey of list) {
    if (!apiKey.includes(':')) continue; // need keystring:secret
    const keystring = apiKey.slice(0, apiKey.indexOf(':'));
    const id = keystring.slice(0, 8) || apiKey.slice(0, 8);
    if (seen.has(id)) continue; // de-dup identical keys
    seen.add(id);
    out.push({ id, apiKey });
  }
  return out;
}
