---
name: herorank-phase1
description: HeroRank Phase 1 (auth/billing/credits) decisions not derivable from code — credits model, ownership seams.
metadata:
  type: project
---

HeroRank Phase 1 = Hono-in-SvelteKit on Cloudflare Workers + Better Auth (D1) + Stripe + credits.

**Why:** PM/BA chose a monthly credit-pool model that diverges from the pricing page's "uses/day per tool" text — this is intentional tech debt (BR-014), not a bug. Daily-per-tool is deferred to a later phase.

**How to apply:**
- Credits = monthly pool shared across all tools. **PM-chosen amounts: free=30, side=750, business=3000, enterprise=9000.** Tool cost `echo`=1. Single source of truth for balance = `SUM(credits_ledger.delta)`; `subscriptions.credits_balance` is a cache kept atomic via `db.batch()` (BR-007/008/009).
- 3 engineers split by file ownership (spec §11). Cross-engineer seams: A's auth signup hook + B's webhook both call C's `CreditsService.grantPlanCredits(userId, plan, ref?)`. Interface lives in `src/lib/server/services/types.ts` (A owns); C exports `createCreditsService(repo)` + `createCreditsRepo(db)`. A wires it lazily in `services/provider.ts` so A ships before C.
- Routing: Better Auth owns `/api/auth/*` (via hooks); Hono owns the rest of `/api/*` (via catch-all). No collision because base paths differ.
- Hono routers from B/C are default-exported `Hono<AppEnv>`, mounted lazily in `app.ts` (missing → 501). Context helpers: `getEnv/getDb/getUser` in `api/context.ts`.
- No real Cloudflare/Stripe creds in this env: wrangler.jsonc IDs are placeholders, valid only for `--local`. Secrets via `.dev.vars` (gitignored), not `.env`.
