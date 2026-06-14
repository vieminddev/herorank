---
name: better-auth-d1
description: How to wire Better Auth 1.6 to Cloudflare D1 cleanly, and the @better-auth/cli version-lag gotcha.
metadata:
  type: project
---

Wiring Better Auth (1.6.x) to Cloudflare D1 on Workers.

**Why:** D1 binding (`env.DB`) only exists in request scope, and naive Kysely+kysely-d1 wiring risks the CamelCasePlugin join-parse bug (better-auth discussion #7487).

**How to apply:**
- `@better-auth/kysely-adapter` (bundled in better-auth 1.6) has a BUILT-IN D1 path: passing the raw `D1Database` binding as `database: env.DB` auto-detects it (`batch`/`exec`/`prepare`) and builds its internal `D1SqliteDialect`. Do NOT manually construct `new Kysely({ dialect: new D1Dialect(...) })` or use `kyselyAdapter()` — the simple form avoids CamelCasePlugin entirely.
- Because D1 is request-scoped, use a factory `createAuth(env)` cached in a `WeakMap<Env, Auth>`, never a module-level singleton.
- Type the auth instance from the real config: `type Auth = ReturnType<typeof buildAuth>`. Using `ReturnType<typeof betterAuth>` (generic `Auth<BetterAuthOptions>`) breaks assignability when options use `satisfies` (literal narrowing on `database`).
- `@better-auth/cli generate` cannot access a D1 binding and has NO stable 1.6.x release (latest stable ~1.4.22). Make a SEPARATE config file (`auth-cli.ts`) using `better-sqlite3` in-memory; only the emitted SQL matters and its columns match 1.6 core. Run via an npm script; keep auth-relevant options in sync with the real `auth.ts`.
- SvelteKit: `svelteKitHandler` short-circuits on `building` but otherwise reads `auth.options` — never pass `undefined` auth on a real (non-building) request with no platform; instead `resolve(event)` directly.
- better-auth 1.6 peers `zod ^4.3.6` → project resolves zod v4, not v3.
