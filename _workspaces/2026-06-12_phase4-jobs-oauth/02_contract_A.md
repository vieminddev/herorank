# Contract A — Phase 4 worker entry, cron + queue seams (Engineer A)

> Owner: Engineer A. Status: **build PASS, wrangler dev verified.** Consumers: F (jobs),
> H (OAuth/calibration), C (router mount — no change needed here). This is the binding
> contract for the `scheduled` + `queue` seams F must implement.

---

## 0. What A delivered (the gate)

Migrated the deploy target **legacy Cloudflare Pages → Workers Static-Assets + custom
worker entry**, so the app can run **Cron Triggers** + a **Queue consumer** (Pages runs
neither). No adapter fork — official `@sveltejs/adapter-cloudflare@7` + a thin `main` entry.

Files A owns (do not edit without coordinating with A):
- `svelte.config.js` — adapter `config: 'wrangler.adapter.jsonc'` + `platformProxy.configPath: 'wrangler.jsonc'`
- `wrangler.adapter.jsonc` (NEW) — adapter-only build config; `main` → generated SSR worker
- `wrangler.jsonc` — Workers mode (`main`/`assets`/`triggers`/`queues`), D1+KV kept
- `src/worker.ts` (NEW) — custom entry: re-exports SvelteKit `fetch`, adds `scheduled`+`queue`
- `src/worker-generated.d.ts` (NEW) — ambient type for the build-time-generated worker
- `src/lib/server/env.ts` — Phase 4 bindings/secrets (ASSETS, ANALYSIS_QUEUE, ETSY_OAUTH_*, OAUTH_TOKEN_KEY)
- `src/lib/server/jobs/{scheduled,queue,types}.ts` (NEW) — **the seams F implements**
- `tsconfig.json` — excludes generated build dirs from `checkJs`
- `.env.example`, `.dev.vars` — OAUTH_TOKEN_KEY + ETSY_OAUTH_* placeholders

### Why two wrangler configs (read this before touching the build)
The adapter writes its generated SSR worker to whatever `main` points at, in Workers mode.
If the real `wrangler.jsonc` `main` were `src/worker.ts`, the adapter would **overwrite our
custom entry every build**. So the adapter reads `wrangler.adapter.jsonc` whose `main` is
`.svelte-kit/server-worker/index.js` (a generated path, outside the assets dir). `src/worker.ts`
(the real `wrangler.jsonc` `main`) imports that generated worker and adds the handlers.
The adapter ALSO requires `main` whenever `assets.binding` is set — that's why the adapter
config can't simply omit `main`.

---

## 1. The cron seam — `handleScheduled`

**File:** `src/lib/server/jobs/scheduled.ts` (A shipped a no-op+log stub; F replaces the body).

**Exact signature — DO NOT CHANGE (the worker entry + this contract depend on it):**
```ts
import type { Env } from '$lib/server/env';

export async function handleScheduled(
  event: ScheduledController,   // Cloudflare cron event; key field: event.cron (string)
  env: Env,                     // bindings/secrets DIRECTLY (no event.platform, no Request)
  ctx: ExecutionContext         // ctx.waitUntil(p) to keep async work alive past return
): Promise<void>
```

**Dispatch by `event.cron`** — one handler, branch on the cron string. The crons declared
in `wrangler.jsonc → triggers.crons` and their intended job:

| `event.cron`     | Schedule            | Job (owner)                                         |
|------------------|---------------------|-----------------------------------------------------|
| `*/30 * * * *`   | every 30 min        | **rank-track sweep** (F) — re-check due tracked_listings within ETSY_CRON_CAP (§1.3) |
| `0 1 * * 0`      | Sun 01:00 UTC       | weekly Etsy **taxonomy** refresh (F, Phase 3 cron folds in) |
| `0 2 * * 0`      | Sun 02:00 UTC       | weekly Etsy **trends** refresh (F)                   |
| `0 3 * * 0`      | Sun 03:00 UTC       | weekly Etsy **best-sellers** refresh (F)             |
| `0 4 * * 0`      | Sun 04:00 UTC       | weekly **OAuth calibration** job (H logic, dispatched by F here) |

> F: use `switch (event.cron)`. Wrap **each branch** in try/catch — an unhandled throw
> fails the ENTIRE scheduled invocation (all branches for that minute). The worker entry
> already wraps the whole call in try/catch as a backstop, but per-branch isolation is on F.

---

## 2. The queue seam — `handleQueue`

**File:** `src/lib/server/jobs/queue.ts` (A shipped an ack-all stub; F replaces the body).

**Exact signature — DO NOT CHANGE:**
```ts
import type { Env } from '$lib/server/env';
import type { AnalysisQueueMessage } from './types';

export async function handleQueue(
  batch: MessageBatch<AnalysisQueueMessage>,  // max_batch_size = 5 (wrangler.jsonc)
  env: Env,
  ctx: ExecutionContext
): Promise<void>
```

**Per-message control (F):**
- `msg.ack()` on success.
- `msg.retry()` to redeliver — counts toward `max_retries: 3` → then dead-letters to
  `herorank-analysis-dlq`. For quota-hit mid-job (§2.2 step 6): persist `analyses.status='deferred'`
  then `msg.retry()`.
- Wrap each `msg` in try/catch so one poison message doesn't fail the batch.
- The worker entry wraps the whole call in try/catch (logs only) — but a throw there would
  retry the WHOLE batch, so own per-message control inside `handleQueue`.

### Queue binding + message shape
- **Producer binding:** `env.ANALYSIS_QUEUE` (`wrangler.jsonc → queues.producers`, queue
  name `herorank-analysis`). Type `Queue<AnalysisQueueMessage>` (optional in `Env` — see §4).
- **Message shape** (`src/lib/server/jobs/types.ts`, A-defined, keep producer in sync):
```ts
export interface DeepShopAnalysisJob {
  kind: 'shop-analysis-deep'; // discriminant for future multi-kind queues
  jobId: string;              // analyses.id (Phase 3 analyses table reused, §2.5)
  userId: string;             // for credit deduct on success + ownership
  shop: string;               // shop handle; consumer resolves shop_id via EtsyClient
  requestedAt: number;        // epoch ms enqueued
}
export type AnalysisQueueMessage = DeepShopAnalysisJob;
```
- **Producer (F, in `routes/jobs.ts`):** `await env.ANALYSIS_QUEUE.send({ kind:'shop-analysis-deep', jobId, userId, shop, requestedAt: Date.now() })`.
- **Fallback (BR-P4-Q-03):** when `env.ANALYSIS_QUEUE` is undefined (plain `vite dev`, no queue),
  the producer must NOT 500 — run inline via `event.platform.context.waitUntil(...)` (HTTP
  context) instead. The consumer body can be factored into a function both paths call.

---

## 3. Reading DB / KV / services in a cron or queue context (KEY — differs from Hono/HTTP)

There is **NO `Request`, no `event.platform`, no `locals`, no Hono `c`** in `scheduled`/`queue`.
Everything comes from the `env` argument that the worker entry passes straight through.

```ts
// D1 (same binding the Hono withDb middleware uses, but built request-less):
const db = new Kysely<DB>({ dialect: new D1Dialect({ database: env.DB }) });
// (use whatever Phase 3 helper constructs Kysely from a D1Database — pass env.DB, not c.env)

// KV cache:    env.KV
// Etsy client: getEtsyClient(env)         // Phase 3 provider; selects real vs mock by env.ETSY_API_KEY
// usageCounter: built from env (D1/KV) — same shared counter + ETSY_CRON_CAP as Phase 3
// secrets:     env.OAUTH_TOKEN_KEY, env.ETSY_OAUTH_CLIENT_ID, env.LLM_*, env.STRIPE_*, ...
// queue (re-enqueue from consumer): env.ANALYSIS_QUEUE?.send(...)
// keep-alive:  ctx.waitUntil(promise)
```

Rule of thumb: any service the Hono routes build from `c.env`, build the SAME way from `env`
here. Do not reach for `event.platform` — it doesn't exist in these handlers.

---

## 4. Env additions (A shipped — F/H consume, do not redeclare)

In `src/lib/server/env.ts` `interface Env` (all optional so dev/mocks work without them):
```ts
ASSETS?: Fetcher;                  // Static Assets binding (Workers mode)
ANALYSIS_QUEUE?: Queue;            // queue producer (absent → inline waitUntil fallback)
ETSY_OAUTH_CLIENT_ID?: string;     // absent → mock OAuth (BR-P4-OAUTH-05)  [H]
ETSY_OAUTH_CLIENT_SECRET?: string; // [H]
ETSY_OAUTH_REDIRECT_URI?: string;  // /api/connect/etsy/callback absolute URL  [H]
OAUTH_TOKEN_KEY?: string;          // AES-GCM key for token encryption at rest (BR-P4-OAUTH-03)  [H]
// ETSY_CRON_CAP already existed (Phase 3) — reused, not re-added.
```
> `ANALYSIS_QUEUE` is typed `Queue` (untyped messages). If F wants `Queue<AnalysisQueueMessage>`,
> narrow at the call site (`env.ANALYSIS_QUEUE as Queue<AnalysisQueueMessage>`) — A left it
> broad so the producer route type-checks before F's message type is imported everywhere.

---

## 5. Path note for F (BA spec said `$lib/server/cron` + `$lib/server/queue`)

The BA spec §1.1 sketch imported `$lib/server/cron` / `$lib/server/queue`. Per the Task #16
brief, A placed the seams at **`$lib/server/jobs/scheduled.ts`** and **`$lib/server/jobs/queue.ts`**
(plus `$lib/server/jobs/types.ts`). The worker entry imports these exact paths. If F prefers
the BA's `cron/`+`queue/` layout, F may re-export from there, but **`src/worker.ts` imports
`$lib/server/jobs/{scheduled,queue}` and that import must keep resolving** — coordinate with A
before moving the seam files (they are A-owned).

---

## 6. Local dev / test commands (verified by A)

```bash
npm run check         # 0 errors on a clean tree (.svelte-kit is gitignored)
npm run build         # PASS — emits .svelte-kit/server-worker/index.js + .svelte-kit/cloudflare assets
wrangler dev --port 8799 --test-scheduled
  curl http://localhost:8799/                          # 200 HTML  (Static Assets + SSR)
  curl http://localhost:8799/api/me                    # 401       (Hono auth)
  curl http://localhost:8799/api/health                # 200 {ok}  (Hono mounted)
  curl "http://localhost:8799/__scheduled?cron=*/30+*+*+*+*"   # → handleScheduled(cron="*/30 * * * *")
```
> NOTE: run `check` BEFORE `build` (or on a clean tree). After a `build`, `svelte-check` may
> re-report ~2 cosmetic "unused @ts-expect-error" errors **inside the gitignored generated
> worker** (`.svelte-kit/server-worker/index.js`) — adapter output, not our source. Clean it
> with `rm -rf .svelte-kit/server-worker .svelte-kit/cloudflare .svelte-kit/output` before check.
