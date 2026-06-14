<script lang="ts">
  import { signIn } from "$lib/auth-client";
  import { Sprout, Star, ShieldCheck, Lock, ArrowLeft } from "lucide-svelte";

  let email = $state("");
  let password = $state("");
  let error = $state("");
  let loading = $state(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    loading = true;
    try {
      const res = await signIn.email({ email, password });
      if (res.error) {
        error = res.error.message ?? "Sign in failed. Please try again.";
      } else {
        window.location.href = "/dashboard";
      }
    } catch {
      error = "Something went wrong. Please try again.";
    } finally {
      loading = false;
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
        <span class="w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105" style="background: var(--teal)">
          <Sprout size={16} class="text-white" />
        </span>
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

      <form onsubmit={handleSubmit} class="space-y-4">
        {#if error}
          <div class="p-3.5 rounded-xl bg-danger-bg border border-danger-light/10 text-danger text-xs font-semibold leading-relaxed animate-fade-in" role="alert">
            {error}
          </div>
        {/if}

        <div>
          <label for="login-email" class="block text-xs font-semibold text-text-primary mb-1.5">Email</label>
          <input
            id="login-email"
            type="email"
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
            <button type="button" disabled aria-disabled="true" class="text-[11px] font-semibold text-text-muted hover:text-teal cursor-not-allowed" title="Coming soon">Forgot password?</button>
          </div>
          <input
            id="login-password"
            type="password"
            bind:value={password}
            required
            class="field !py-2.5 !px-3.5 text-sm"
            placeholder="••••••••"
            disabled={loading}
          />
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

      <!-- Testimonial Block -->
      <div class="space-y-4 text-white">
        <div class="flex items-center gap-0.5">
          {#each Array(5) as _}
            <Star size={14} class="text-orange" fill="currentColor" />
          {/each}
        </div>
        <blockquote class="text-sm font-medium italic leading-relaxed text-white/90">
          "The direct connection makes a massive difference. We save hours drafting description files and checking keyword competition on our phones. It feels tailored, and the scores match actual metrics."
        </blockquote>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-white text-xs shrink-0 border border-white/10">
            SJ
          </div>
          <div>
            <h4 class="text-xs font-semibold">Sarah Jenkins</h4>
            <p class="text-[10px] text-white/60">Owner, SpeckledClayCo · 12k+ Sales</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Side Footer -->
    <div class="relative z-10 flex items-center justify-between text-[11px] text-white/50 border-t border-white/10 pt-4">
      <span>Official Etsy API Partner</span>
      <span class="flex items-center gap-1.5"><ShieldCheck size={13} class="text-teal-light" /> Fully Compliant & Secure</span>
    </div>
  </div>
</div>
