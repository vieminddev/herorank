<script lang="ts">
  import { signUp } from "$lib/auth-client";
  import { Sprout, Star, ShieldCheck, Lock, ArrowLeft } from "lucide-svelte";

  let name = $state("");
  let email = $state("");
  let password = $state("");
  let error = $state("");
  let loading = $state(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = "";

    if (password.length < 8) {
      error = "Password must be at least 8 characters.";
      return;
    }

    loading = true;
    try {
      const res = await signUp.email({ email, password, name });
      if (res.error) {
        error = res.error.message ?? "Sign up failed. Please try again.";
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
  <title>Create Account — VieRank</title>
  <meta name="description" content="Create your free VieRank account. Get 30 free credits and access to Etsy SEO tools, keyword generator, and analytics." />
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
    <main class="w-full max-w-sm mx-auto my-auto py-8">
      <div class="mb-6">
        <h1 class="text-2xl font-bold tracking-tight text-text-primary">Create your account</h1>
        <p class="text-xs text-text-secondary mt-1">Get 30 free credits — no credit card needed.</p>
      </div>

      <form onsubmit={handleSubmit} class="space-y-4">
        {#if error}
          <div class="p-3.5 rounded-xl bg-danger-bg border border-danger-light/10 text-danger text-xs font-semibold leading-relaxed animate-fade-in" role="alert">
            {error}
          </div>
        {/if}

        <div>
          <label for="signup-name" class="block text-xs font-semibold text-text-primary mb-1.5">Name</label>
          <input
            id="signup-name"
            type="text"
            bind:value={name}
            required
            class="field !py-2.5 !px-3.5 text-sm"
            placeholder="Your name"
            disabled={loading}
          />
        </div>

        <div>
          <label for="signup-email" class="block text-xs font-semibold text-text-primary mb-1.5">Email</label>
          <input
            id="signup-email"
            type="email"
            bind:value={email}
            required
            class="field !py-2.5 !px-3.5 text-sm"
            placeholder="you@example.com"
            disabled={loading}
          />
        </div>

        <div>
          <label for="signup-password" class="block text-xs font-semibold text-text-primary mb-1.5">Password</label>
          <input
            id="signup-password"
            type="password"
            bind:value={password}
            required
            minlength="8"
            class="field !py-2.5 !px-3.5 text-sm"
            placeholder="At least 8 characters"
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          class="btn btn-primary btn-glow w-full justify-center text-xs py-2.5 font-bold mt-2"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>

        <p class="text-center text-xs text-text-secondary pt-4">
          Already have an account?
          <a href="/auth/login" class="text-teal font-semibold hover:underline">Sign in</a>
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
            src="/etsy_seo_success.png"
            alt="VieRank Page 1 Rank Etsy SEO success dashboard illustration"
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
          "VieRank helped me identify that my keywords were underperforming in search. I changed my tags and titles and saw an instant rank improvement."
        </blockquote>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-white text-xs shrink-0 border border-white/10">
            DM
          </div>
          <div>
            <h4 class="text-xs font-semibold">David Miller</h4>
            <p class="text-[10px] text-white/60">Owner, KnitWanderer · 8.9k+ Sales</p>
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
