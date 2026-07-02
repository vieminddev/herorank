# Login improvements — what's live + secrets you need to set

Deployed 2026-06-26 (version ecb06f74). Everything is **config-gated**: it ships safe with no secrets,
and each feature switches on the moment its secret exists. Until then the app behaves exactly as before
(email/password only, no verification required, no Google button).

## ✅ Live now (no setup needed)
- **UX polish**: show/hide password, proper `autocomplete` (email / current-password / new-password) so
  password managers autofill, autofocus, friendlier errors ("Incorrect email or password").
- **Redirect-back**: hitting a protected page while logged out sends you to
  `/auth/login?redirect=<page>` and returns you there after sign-in (not always `/dashboard`).
- **Disposable-email block**: sign-ups with throwaway domains (mailinator, yopmail, temp-mail, …) are
  rejected server-side with a clear message. List: `src/lib/server/services/disposableEmail.ts` (extend
  anytime).
- New pages: `/auth/forgot-password`, `/auth/reset-password` (show "link expired" on bad/old tokens).

## 🔑 Set these secrets to switch on the rest

Run in `C:\DATA\viemid\herorank\app` (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID already in env). For
local dev, put the same keys in `.dev.vars`.

### A. Email (password reset + email verification) — Resend
```bash
npx wrangler secret put RESEND_API_KEY    # from resend.com → API Keys
npx wrangler secret put EMAIL_FROM        # e.g.  VieRank <no-reply@vierank.com>
```
- Get a Resend account, **verify the `vierank.com` domain** (add their DNS records), create an API key.
- Once BOTH are set:
  - "Forgot password?" link appears on login → full reset flow works.
  - **Email verification turns ON**: new sign-ups must click a link before they can sign in (the signup
    page shows a "check your inbox" screen; login offers "resend"). Until configured, verification stays
    OFF so no one is locked out.
- Swap provider later by editing the single `deliver`/`fetch` call in `src/lib/server/services/email.ts`.

### B. Google sign-in
```bash
npx wrangler secret put GOOGLE_CLIENT_ID       # from Google Cloud Console
npx wrangler secret put GOOGLE_CLIENT_SECRET
```
- Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (type: Web app).
- **Authorized redirect URI** (exact):
  `https://vierank.com/api/auth/callback/google`
- Authorized JavaScript origin: `https://vierank.com`.
- Once both secrets are set, the **"Continue with Google"** button appears automatically on login + signup.

After setting secrets, no redeploy is required for them to take effect (Workers picks up secrets live),
but the login/signup **buttons** (Google) and "Forgot password" link are gated by a server flag read at
page load — they appear on the next page load once the secrets exist.

## Notes / options
- Brute-force is already rate-limited per-IP in `hooks.server.ts` (10 / 15 min, env
  `RATE_LIMIT_AUTH_PER_15MIN`) — unchanged.
- Not done (say the word if you want them): magic-link / passwordless, "remember me" session length,
  account-based lockout (vs per-IP), 2FA.
