<script lang="ts">
  import { signIn, sendVerificationEmail } from "$lib/auth-client";
  import { ShieldCheck, Lock, ArrowLeft, Eye, EyeOff, MailCheck } from "lucide-svelte";
  import MascotLogo from "$lib/components/ui/MascotLogo.svelte";

  import { onMount } from "svelte";

  let { data } = $props();

  let email = $state("");
  let password = $state("");
  let showPw = $state(false);
  let error = $state("");
  let loading = $state(false);
  let googleLoading = $state(false);
  // When the account exists but isn't verified yet, offer a one-click resend.
  let unverified = $state(false);
  let resent = $state(false);

  // Where to go after sign-in — preserve the page the visitor was bounced from (open-redirect safe).
  let redirectTo = $state("/dashboard");
  onMount(() => {
    const r = new URLSearchParams(window.location.search).get("redirect");
    if (r && r.startsWith("/") && !r.startsWith("//")) redirectTo = r;
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = ""; unverified = false; resent = false; loading = true;
    try {
      const res = await signIn.email({ email: email.trim(), password });
      if (res.error) {
        if (res.error.code === "EMAIL_NOT_VERIFIED" || res.error.status === 403) {
          unverified = true;
        } else if (res.error.status === 401) {
          error = "Incorrect email or password.";
        } else {
          error = res.error.message ?? "Sign in failed. Please try again.";
        }
      } else {
        window.location.assign(redirectTo);
      }
    } catch {
      error = "Something went wrong. Please try again.";
    } finally {
      loading = false;
    }
  }

  async function resendVerification() {
    if (!email.trim()) return;
    try {
      await sendVerificationEmail({ email: email.trim(), callbackURL: redirectTo });
      resent = true;
    } catch { /* best-effort */ }
  }

  async function googleSignIn() {
    googleLoading = true;
    try {
      await signIn.social({ provider: "google", callbackURL: redirectTo });
    } catch {
      error = "Couldn't start Google sign-in. Please try again.";
      googleLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign In — VieRank</title>
  <meta name="description" content="Sign in to VieRank to access Etsy SEO tools, keyword generator, and shop analytics." />
</svelte:head>

<div class="lp min-h-screen bg-white text-text-primary grid grid-cols-1 lg:grid-cols-2">
  <!-- Left Side: Form Container -->
  <div class="flex flex-col justify-between p-6 md:p-10 bg-bg-page/30">
    <!-- Header -->
    <header class="flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 group">
        <MascotLogo size={32} animate="hover" />
        <span class="text-lg font-bold tracking-tight text-text-primary">VieRank</span>
      </a>

      <a href="/" class="text-xs font-semibold text-text-secondary hover:text-teal flex items-center gap-1 transition-colors">
        <ArrowLeft size={13} /> Back to homepage
      </a>
    </header>

    <!-- Form Panel -->
    <main class="w-full max-w-sm mx-auto my-auto py-10">
      <div class="mb-8">
        <h1 class="text-2xl font-bold tracking-tight text-text-primary">Welcome back</h1>
        <p class="text-xs text-text-secondary mt-1">Sign in to manage your Etsy shop SEO rankings.</p>
      </div>

      {#if data.googleEnabled}
        <button
          type="button"
          onclick={googleSignIn}
          disabled={googleLoading || loading}
          class="w-full flex items-center justify-center gap-2.5 rounded-xl border border-border bg-white hover:bg-bg-page/60 text-text-primary text-xs font-semibold py-2.5 transition-colors disabled:opacity-60"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/></svg>
          {googleLoading ? "Redirecting…" : "Continue with Google"}
        </button>
        <!-- Google sign-in creates an account on first use, so consent must be surfaced here too. -->
        <p class="text-[10px] text-text-muted text-center mt-2 leading-relaxed">
          By continuing with Google you agree to our
          <a href="/terms" target="_blank" rel="noopener noreferrer" class="text-teal font-semibold hover:underline">Terms</a>
          and
          <a href="/privacy" target="_blank" rel="noopener noreferrer" class="text-teal font-semibold hover:underline">Privacy Policy</a>.
        </p>
        <div class="flex items-center gap-3 my-5">
          <span class="h-px flex-1 bg-border/60"></span>
          <span class="text-[10px] font-semibold uppercase tracking-wide text-text-muted">or</span>
          <span class="h-px flex-1 bg-border/60"></span>
        </div>
      {/if}

      <form onsubmit={handleSubmit} class="space-y-4">
        {#if error}
          <div class="p-3.5 rounded-xl bg-danger-bg border border-danger-light/10 text-danger text-xs font-semibold leading-relaxed animate-fade-in" role="alert">
            {error}
          </div>
        {/if}

        {#if unverified}
          <div class="p-3.5 rounded-xl bg-warning/10 border border-warning/20 text-text-primary text-xs leading-relaxed animate-fade-in" role="alert">
            <p class="font-semibold flex items-center gap-1.5"><MailCheck size={13} class="text-warning" /> Verify your email to continue</p>
            <p class="text-text-secondary mt-1">We sent a confirmation link to your inbox.
              {#if resent}<span class="text-teal font-semibold">Sent again — check your inbox.</span>
              {:else}<button type="button" onclick={resendVerification} class="text-teal font-semibold hover:underline">Resend it</button>{/if}
            </p>
          </div>
        {/if}

        <div>
          <label for="login-email" class="block text-xs font-semibold text-text-primary mb-1.5">Email</label>
          <input
            id="login-email"
            type="email"
            name="email"
            autocomplete="email"
            autocapitalize="off"
            spellcheck="false"
            bind:value={email}
            required
            class="field !py-2.5 !px-3.5 text-sm"
            placeholder="you@example.com"
            disabled={loading}
          />
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label for="login-password" class="block text-xs font-semibold text-text-primary">Password</label>
            {#if data.emailEnabled}
              <a href="/auth/forgot-password" class="text-[11px] font-semibold text-text-muted hover:text-teal transition-colors">Forgot password?</a>
            {/if}
          </div>
          <div class="relative">
            <input
              id="login-password"
              type={showPw ? "text" : "password"}
              name="password"
              autocomplete="current-password"
              bind:value={password}
              required
              class="field !py-2.5 !px-3.5 !pr-10 text-sm"
              placeholder="••••••••"
              disabled={loading}
            />
            <button type="button" onclick={() => (showPw = !showPw)} tabindex="-1"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              aria-label={showPw ? "Hide password" : "Show password"}>
              {#if showPw}<EyeOff size={15} />{:else}<Eye size={15} />{/if}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          class="btn btn-primary btn-glow w-full justify-center text-xs py-2.5 font-bold mt-2"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p class="text-center text-xs text-text-secondary pt-4">
          Don't have an account?
          <a href="/auth/signup" class="text-teal font-semibold hover:underline">Sign up for free</a>
        </p>
      </form>
    </main>

    <!-- Footer -->
    <footer class="flex items-center justify-between text-[11px] text-text-muted font-medium border-t border-border/40 pt-4">
      <span>© 2026 VieRank</span>
      <span class="flex items-center gap-1"><Lock size={11} /> Secured Checkout via Stripe</span>
    </footer>
  </div>

  <!-- Right Side: Dark Glass Visual Panel (hidden on mobile) -->
  <div class="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden" style="background: var(--teal-dark)">
    <!-- Decorative background elements -->
    <div class="absolute inset-0 grid-overlay opacity-[0.2]" aria-hidden="true"></div>
    <div class="absolute inset-0 opacity-[0.03]" style="background-image: radial-gradient(circle at 1px 1px, #fff 1px, transparent 0); background-size: 35px 35px;" aria-hidden="true"></div>
    <div class="lp-glow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-30 blur-[120px]" style="background: radial-gradient(circle, var(--teal-light), transparent)" aria-hidden="true"></div>

    <div class="relative z-10 w-full max-w-md mx-auto my-auto space-y-10">
      <!-- Image Mockup -->
      <div class="relative group">
        <div class="absolute inset-0 bg-gradient-to-tr from-white/10 to-teal-light/20 blur-xl rounded-2xl" aria-hidden="true"></div>
        <div class="relative rounded-2xl overflow-hidden border border-white/15 bg-white/5 backdrop-blur-md p-2 shadow-2xl transition-transform duration-500 group-hover:scale-[1.01]">
          <img
            src="/etsy_seo_growth.png"
            alt="VieRank shop analytics SEO checklist growth graph dashboard mockup screenshot"
            class="w-full h-auto rounded-xl"
          />
        </div>
      </div>

      <!-- Value statement — honest, non-attributed (no fabricated testimonials). -->
      <div class="space-y-4 text-white">
        <blockquote class="text-base font-medium leading-relaxed text-white/90">
          "A direct, secure connection to your shop via Etsy's official API — with every score and estimate honestly labeled, so you always know what's measured and what's estimated."
        </blockquote>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 border border-white/10">
            <ShieldCheck size={15} class="text-teal-light" />
          </div>
          <div>
            <h4 class="text-xs font-semibold">Built for Etsy sellers</h4>
            <p class="text-[10px] text-white/60">Honest data · you control access</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Side Footer -->
    <div class="relative z-10 flex items-center justify-between text-[11px] text-white/50 border-t border-white/10 pt-4">
      <span>Uses Etsy's official API</span>
      <span class="flex items-center gap-1.5"><ShieldCheck size={13} class="text-teal-light" /> Secure · Privacy-first</span>
    </div>
  </div>
</div>
