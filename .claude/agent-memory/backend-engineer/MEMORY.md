# Backend Engineer Memory — Index

- [Better Auth + Cloudflare D1](better-auth-d1.md) — pass raw D1 binding directly; no kysely-d1 wiring; CLI version lag needs separate config.
- [HeroRank Phase 1 stack](herorank-phase1.md) — auth/billing/credits architecture facts not obvious from code.
- [Stripe on Cloudflare Workers](stripe-on-workers.md) — fetch httpClient + constructEventAsync + omit apiVersion (don't cast).
- [D1 atomic conditional debit](d1-atomic-conditional-debit.md) — race-safe + idempotent spend via guarded INSERT + derived-cache UPDATE in one db.batch(); partial unique index on (acct,ref) for spend dedup.
- [LLM fetch + SSE on Workers](llm-fetch-sse-on-workers.md) — plain fetch OpenAI-compatible client, SSE parsing, typed-error→HTTP mapping, manual credit deduct for streaming.
