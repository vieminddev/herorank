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
} from '@cloudflare/workers-types';

export interface Env {
  // --- Bindings (wrangler.jsonc) ---
  DB: D1Database;
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

  // --- Auth ---
  BETTER_AUTH_SECRET: string;
  /** Optional explicit origin override (e.g. https://herorank.com). Falls back to request origin. */
  BETTER_AUTH_URL?: string;

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
   * OpenAI-compatible IMAGE model for the `image-studio` tool (Phase 5). Absent → image-studio
   * returns 503 IMAGE_UNAVAILABLE (no credit spent). Env-driven, never hardcoded.
   */
  IMAGE_MODEL?: string;

  // --- Etsy data (Phase 3; declared now so config is stable, PM decision Q7) ---
  ETSY_API_KEY?: string;
  ETSY_API_SECRET?: string;
  /** Hard daily Etsy call cap (shared user+cron). Default 8000 (<10k Etsy limit), PM Q14. */
  ETSY_DAILY_CAP?: string;
  /** Cron sub-cap so weekly refresh never starves user requests. Default 2000, PM Q14. */
  ETSY_CRON_CAP?: string;

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
}
