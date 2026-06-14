# Contract A → B & C (Foundation & Auth)

> Engineer A, 2026-06-12. Branch `migrate-sveltekit`. All foundation files shipped, `npm run check` = 0 errors, both D1 migrations apply locally. B & C build on top of this; do NOT edit A's files (list at bottom).

---

## 1. Deps installed (A owns `package.json` — do NOT edit it)

If you need a new dep, ask A. Already installed:

**dependencies:** `better-auth@^1.6.16`, `hono@^4.12`, `kysely@^0.29`, `kysely-d1@^0.4`, `stripe@^22.2.0`, `zod@^4.3.6`, `clsx`, `lucide-svelte`

**devDependencies:** `@better-auth/cli@^1.4.22`, `@cloudflare/workers-types`, `better-sqlite3` + `@types/better-sqlite3` (CLI-only), `wrangler@^4.99`, `vitest@^4.1.8`, plus existing svelte toolchain.

Scripts: `npm run check`, `npm test` (`vitest run`), `npm run test:watch`, `npm run auth:generate`, `npm run db:migrate:local`.

> NOTE on zod: project resolves to **zod v4** (better-auth peer requires `^4.3.6`). Import from `zod` as usual; v4 API.

---

## 2. `Env` type — `src/lib/server/env.ts`

```ts
import type { Env } from '$lib/server/env';
```
Fields: `DB` (D1Database), `KV` (KVNamespace), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL?`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` (6 optional), `LLM_BASE_URL?`, `LLM_API_KEY?`.

This is the single source of truth for `App.Platform.Env` too. Do NOT redeclare it.

---

## 3. Hono app + context (A owns `app.ts`, `types.ts`, `context.ts`, middleware)

### Type your routers as `Hono<AppEnv>`
```ts
import { Hono } from 'hono';
import type { AppEnv } from '$lib/server/api/types';

const router = new Hono<AppEnv>();
// ... routes ...
export default router; // default export REQUIRED — app.ts mounts it.
```

### `AppEnv` (from `api/types.ts`)
- `Bindings = Env`  → `c.env.DB`, `c.env.STRIPE_SECRET_KEY`, ...
- `Variables.db: D1Database` (set app-wide by `withDb`)
- `Variables.user: AuthUser` (set by `requireAuth`; only on guarded routes)
- `AuthUser = { id: string; email: string; name: string }`

### Read context via helpers (`api/context.ts`) — preferred over raw `c.get`
```ts
import { getDb, getUser, getEnv } from '$lib/server/api/context';

getEnv(c)  // Env (bindings + secrets)
getDb(c)   // D1Database  (always available — withDb is global)
getUser(c) // AuthUser    (ONLY valid after requireAuth on that route)
```

### Mounting (already wired in `app.ts`, basePath `/api`)
| Prefix | File you create (default-export `Hono<AppEnv>`) | Owner |
|---|---|---|
| `/api/billing` | `src/lib/server/api/routes/billing.ts` | B |
| `/api/me`      | `src/lib/server/api/routes/me.ts`      | C |
| `/api/credits` | `src/lib/server/api/routes/credits.ts` | C |
| `/api/tools`   | `src/lib/server/api/routes/tools.ts`   | C |

Your router paths are RELATIVE to the mount prefix. e.g. billing.ts:
```ts
router.post('/checkout', requireAuth, async (c) => { ... }); // → POST /api/billing/checkout
router.post('/webhook', async (c) => {                       // → POST /api/billing/webhook
  const raw = await c.req.text(); // raw body for Stripe signature — do NOT use c.req.json()
});
```
Routers are loaded lazily; until your file exists the prefix returns 501. No edit to `app.ts` needed when you add it.

### `requireAuth` middleware
```ts
import { requireAuth } from '$lib/server/api/middleware/requireAuth';
router.get('/me', requireAuth, (c) => { const user = getUser(c); ... });
```
On no session → returns `401 { error:'UNAUTHORIZED', message }` automatically; your handler only runs when authed.

### Error shape (spec §9) — uniform `{ error, message }`
`onError` returns `500 { error:'INTERNAL', ... }`. To emit a specific code, return `c.json({ error:'INSUFFICIENT_CREDITS', message, balance }, 402)` directly, or throw `HTTPException` with a JSON response. Codes: `UNAUTHORIZED(401)`, `INSUFFICIENT_CREDITS(402)`, `VALIDATION(400)`, `INTERNAL(500)`, `NOT_FOUND(404)`.

---

## 4. `creditsService` interface A expects (Engineer C MUST implement)

A's signup hook + B's webhook depend on this contract — declared in `src/lib/server/services/types.ts` (A owns). C implements it.

```ts
// src/lib/server/services/types.ts  (import from here)
export type PlanSlug = 'free' | 'side' | 'business' | 'enterprise';

export interface CreditsService {
  grantPlanCredits(userId: string, plan: PlanSlug, ref?: string): Promise<{ balance: number }>;
  spendCredits(userId: string, tool: string): Promise<{ balance: number }>;
  getBalance(userId: string): Promise<number>;
}
```

**C MUST export these factories** (A's `services/provider.ts` resolves them lazily at runtime; B can import them directly):
```ts
// src/lib/server/repositories/creditsRepo.ts
export function createCreditsRepo(db: D1Database): CreditsRepo { ... }

// src/lib/server/services/creditsService.ts
import type { CreditsService } from './types';
export function createCreditsService(repo: CreditsRepo): CreditsService { ... }
```
- A calls `grantPlanCredits(user.id, 'free')` in Better Auth `databaseHooks.user.create.after` (BR-002, free = 30 credits).
- B calls `grantPlanCredits(userId, plan, stripeEventId)` from the webhook (use `ref` for idempotency, BR-003/010).
- Keep signatures stable; if you must change them, update this doc.

**PLAN_CREDITS chosen by PM (put in C's config):** free=30, side=750, business=3000, enterprise=9000. Model = monthly pool (BR-014). `echo` tool cost = 1 (BR-004).

> The `provider.ts` seam currently emits `@ts-expect-error` on the two dynamic imports because C's files don't exist yet. Once C adds them with the exact export names above, it resolves at runtime. (If signatures match but the `@ts-expect-error` then becomes unused, A will remove it — ping A.)

---

## 5. Auth (A owns `auth.ts`, `auth-client.ts`, `hooks.server.ts`)

- Server: `import { createAuth } from '$lib/server/auth'` → `createAuth(env)` returns a per-env-cached Better Auth instance. Use for `auth.api.getSession({ headers })`, `auth.api.*` server calls.
- Better Auth handles `/api/auth/*` (sign-up/in/out, get-session) via `hooks.server.ts`. Your Hono routes live elsewhere under `/api/*` — no collision (different base path).
- Client (FE): `import { authClient, signIn, signUp, signOut, useSession } from '$lib/auth-client'`.
  - B (login/signup pages): `await authClient.signUp.email({ email, password, name })`, `authClient.signIn.email({ email, password })`. `autoSignIn` is on; on success `goto('/dashboard')`.
  - Password min length = 8 (BR-001) — validate client-side too.
- `event.locals.user` / `event.locals.session` are set for every request (use in `+page.server.ts`/`+layout.server.ts` loads).

---

## 6. Dashboard data shape (A owns `(dashboard)/+layout.server.ts` + `+layout.svelte`)

`+layout.server.ts` guards (`!user → redirect /auth/login`, BR-013) and returns:
```ts
{
  user: { id: string; name: string; email: string };
  subscription: { plan: string; status: string; period: string | null };
  credits: { balance: number };
}
```
`+layout.svelte` forwards these to `<Header>` as props:
```svelte
<Header user={data.user} credits={data.credits} subscription={data.subscription} />
```

### Engineer C — Header.svelte props contract (you implement `$props()`):
```ts
let { user, credits, subscription }: {
  user: { id: string; name: string; email: string };
  credits: { balance: number };
  subscription: { plan: string; status: string; period: string | null };
} = $props();
```
Replace the hardcoded "HR"/"Account" with `user.name`/`user.email`; show `credits.balance` badge; Sign Out → `authClient.signOut()` then `goto('/auth/login')`.

> Once C adds `$props()` to Header, A's `+layout.svelte` cast (`HeaderRaw as Component<HeaderProps>`) becomes redundant; A will drop it. Don't change A's layout.

---

## 7. DB schema (applied & verified on local D1)

Tables: Better Auth `user`/`session`/`account`/`verification` (CLI-generated, camelCase cols) + HeroRank `subscriptions`, `credits_ledger`, `processed_stripe_events` (see `migrations/0002_herorank.sql`, snake_case cols).

Key columns for B/C:
- `subscriptions(user_id PK, plan, status, period, stripe_customer_id UNIQUE, stripe_subscription_id, current_period_end, credits_balance, created_at, updated_at)`
- `credits_ledger(id PK AUTOINCREMENT, user_id, delta, reason, ref, balance_after, created_at)`
- `processed_stripe_events(event_id PK, type, created_at)`

References point to `"user"`(id) — quote `user` in SQL (SQLite keyword). Use `db.batch([...])` for atomic deduct+ledger (BR-008/009). epoch timestamps via `unixepoch()`.

Run migrations locally: `npm run db:migrate:local`. Regenerate auth schema (if auth options change): `npm run auth:generate`.

---

## 8. Files A owns — DO NOT EDIT
`package.json`, `wrangler.jsonc`, `tsconfig.json`, `.env.example`, `.gitignore`,
`src/app.d.ts`, `src/hooks.server.ts`, `src/lib/auth-client.ts`,
`src/lib/server/env.ts`, `src/lib/server/auth.ts`, `src/lib/server/auth-cli.ts`,
`src/lib/server/services/types.ts`, `src/lib/server/services/provider.ts`,
`src/lib/server/api/app.ts`, `api/types.ts`, `api/context.ts`,
`src/lib/server/api/middleware/requireAuth.ts`, `middleware/withDb.ts`,
`src/routes/api/[...path]/+server.ts`,
`src/routes/(dashboard)/+layout.server.ts`, `src/routes/(dashboard)/+layout.svelte`,
`migrations/0001_better_auth.sql`, `migrations/0002_herorank.sql`.

Engineer C still owns `Header.svelte`, `pricing/+page.svelte`. Engineer B owns `login`/`signup` pages.
