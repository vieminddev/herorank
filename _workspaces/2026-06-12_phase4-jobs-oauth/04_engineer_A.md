# Engineer A — Phase 4 worker-entry migration report (Task #16)

> Branch `migrate-sveltekit`. Gate task: migrate Cloudflare **Pages → Workers Static-Assets +
> custom worker entry** so Cron Triggers + Queue consumer can run. **BUILD PASSES.** All other
> engineers were blocked on this; they are now unblocked.

## RESULT: ✅ PASS

Full CI sequence from a clean tree:
- `npm run check` → **0 errors**, 19 warnings (pre-existing FE a11y, not mine)
- `npm run build` → **✓ built / ✔ done** (emits `.svelte-kit/server-worker/index.js` + `.svelte-kit/cloudflare` assets)
- `npm test` → **121 passed (5 files)** — no regressions
- `wrangler dev --test-scheduled` → boots; smoke tests pass (below)

## wrangler dev smoke (port 8799)
| Request | Result | Proves |
|---|---|---|
| `GET /` | 200 `text/html` | Static Assets + SSR after migration |
| `GET /api/me` | 401 `{UNAUTHORIZED}` | Hono app + auth still mounted |
| `GET /api/health` | 200 `{ok:true}` | Hono router intact |
| `GET /__scheduled?cron=*/30 * * * *` | "Ran scheduled event"; stub logged `cron="*/30 * * * *"` | cron→handleScheduled wiring + `event.cron` branch key |
| `GET /__scheduled?cron=0 1 * * 0` | stub logged `cron="0 1 * * 0"` | per-schedule dispatch works |
| `wrangler deploy --dry-run` | bundles; bindings KV + ANALYSIS_QUEUE + DB + ASSETS; `scheduled` handler in bundle | queue producer + assets + handlers validate |

## How the migration works (the load-bearing design)
Official `@sveltejs/adapter-cloudflare@7.2.8` in Workers mode writes its generated SSR worker to
whatever `main` points at — so pointing the real `wrangler.jsonc main` at our `src/worker.ts`
would make the adapter overwrite our entry every build. The adapter also *requires* `main` whenever
`assets.binding` is set (so "assets, no main" is rejected — confirmed empirically).

Solution (no fork): **two wrangler configs.**
- `wrangler.adapter.jsonc` (adapter build-only) — `main: ".svelte-kit/server-worker/index.js"`
  (a generated path OUTSIDE the assets dir). Adapter emits its SSR worker there.
- `wrangler.jsonc` (dev/deploy) — `main: "src/worker.ts"`, `assets` (ASSETS binding), D1+KV,
  `triggers.crons` (5 crons), `queues` (producer ANALYSIS_QUEUE + consumer herorank-analysis +
  DLQ). `src/worker.ts` imports the generated worker, re-exports `fetch`, adds `scheduled`+`queue`.
- `svelte.config.js` — `adapter({ config: 'wrangler.adapter.jsonc', platformProxy: { configPath: 'wrangler.jsonc' } })`
  so `vite dev`'s D1/KV/queue emulation still reads the real bindings.

## Files (all A-owned)
- NEW `src/worker.ts` — custom entry (fetch passthrough + scheduled + queue wiring, try/catch guards)
- NEW `src/worker-generated.d.ts` — ambient type for build-time-generated worker (typed pre-build)
- NEW `wrangler.adapter.jsonc` — adapter-only build config
- NEW `src/lib/server/jobs/scheduled.ts` — `handleScheduled` seam (no-op+log stub for F)
- NEW `src/lib/server/jobs/queue.ts` — `handleQueue` seam (ack-all stub for F)
- NEW `src/lib/server/jobs/types.ts` — `DeepShopAnalysisJob` / `AnalysisQueueMessage` shapes
- EDIT `wrangler.jsonc` — Pages → Workers (main/assets/triggers/queues; D1+KV kept)
- EDIT `svelte.config.js` — adapter Workers config + platformProxy
- EDIT `src/lib/server/env.ts` — ASSETS, ANALYSIS_QUEUE, ETSY_OAUTH_*, OAUTH_TOKEN_KEY
- EDIT `tsconfig.json` — exclude generated build dirs from checkJs
- EDIT `.env.example`, `.dev.vars` — OAUTH_TOKEN_KEY + ETSY_OAUTH_* placeholders
- NEW `_workspaces/.../02_contract_A.md` — seam contract for F/H

## Seam contract summary (full detail in 02_contract_A.md)
- `handleScheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void>`
  — branch on `event.cron`. Crons: `*/30 * * * *` rank-track · `0 1/2/3 * * 0` weekly etsy
  taxonomy/trends/best-sellers · `0 4 * * 0` calibration. F implements; signature is fixed.
- `handleQueue(batch: MessageBatch<AnalysisQueueMessage>, env: Env, ctx: ExecutionContext): Promise<void>`
  — per-message `ack()`/`retry()`; binding `env.ANALYSIS_QUEUE` (queue `herorank-analysis`,
  batch 5, retries 3, DLQ `herorank-analysis-dlq`). Message = `DeepShopAnalysisJob` (jobId=analyses.id).
- **DB/KV/services in cron/queue:** build request-less from the `env` ARG (no `event.platform`,
  no Hono `c`). e.g. Kysely from `env.DB`, `getEtsyClient(env)`, `env.KV`, `ctx.waitUntil`.
- Seam files live at `$lib/server/jobs/` (per Task brief), not BA's `$lib/server/cron|queue` —
  flagged for F in the contract; `src/worker.ts` imports the jobs/ paths.

## Self-Review findings
- Security: OAuth tokens marked encrypt-at-rest (OAUTH_TOKEN_KEY, BR-P4-OAUTH-03); `.dev.vars`
  placeholder is a throwaway base64 dev key, real key via `wrangler secret` — OK. No secrets in worker.ts. OK.
- Concurrency: handlers use `ctx.waitUntil`; worker entry wraps scheduled/queue in try/catch so a
  job error never becomes an unhandled rejection; per-message control delegated to handleQueue. OK.
- Error handling: scheduled/queue stubs log, don't throw; worker entry logs + swallows to protect
  the runtime; contract tells F to isolate per-branch/per-message. OK.
- Testability: seams are plain functions taking (event/batch, env, ctx) — fully unit-testable by F
  without a Request; queue message shape is a shared exported type. OK.
- Idiomaticity: official adapter + `satisfies ExportedHandler<Env, AnalysisQueueMessage>`; no fork;
  two-config split documented inline. OK.
- Build criterion (the task's life-or-death): check 0 / build PASS / 121 tests / wrangler dev boots. OK.

## Concerns / risks (flag for PM/EM)
1. **`check`-after-`build` cosmetic noise:** `svelte-check` re-reports ~2 "unused @ts-expect-error"
   errors INSIDE the gitignored adapter-generated worker (`.svelte-kit/server-worker/index.js`) when
   the file exists on disk post-build (TS follows the real-file import over the ambient decl). On a
   **clean tree (CI: check→build) it's 0 errors.** Workaround documented: `rm -rf .svelte-kit/{server-worker,cloudflare,output}`
   before check. Not blocking, but if CI runs check AFTER build it must clean first. Could be hardened
   later (e.g. a build:clean step) — left out to keep scope tight.
2. **Two wrangler configs** is a small footgun: anyone changing bindings must edit `wrangler.jsonc`
   (runtime), NOT `wrangler.adapter.jsonc` (build-only, minimal). Documented in both files' headers.
3. **Queue/cron not yet doing anything** — stubs only (by design; F owns business logic). The infra
   (triggers, consumer, producer binding, DLQ) is live and verified empty-handed.
4. Placeholder D1/KV/queue IDs remain for local dev (same as Phase 1) — real IDs needed at first
   Cloudflare deploy. Not A's call now (no account yet).
5. Did NOT touch `src/app.d.ts` — the new Queue binding flows through `Env` (already referenced by
   `App.Platform.env`), so no change was needed; adding one would have been redundant.

## Skills read
- Attempted to read `.claude/skills/SKILL-ROUTING.md` and `_workspaces/.../00_pm_decisions.md` —
  neither exists in this repo (only `01_ba_spec.md` was present in the Phase 4 workspace). Proceeded
  on the BA spec §1.1 + the PM decisions listed in the Task #16 brief (Workers Static-Assets approved,
  official adapter + thin entry, no fork). Verified adapter behaviour empirically (adapter source +
  real build) rather than relying on stale docs.

## Memory
- Wrote backend-engineer memory: the adapter-cloudflare v7 two-config worker-entry pattern is
  cross-project [UNIVERSAL] knowledge (not derivable from this repo's code once the build works) —
  worth EM promoting to a skill. See agent-memory.
