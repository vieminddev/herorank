<script lang="ts">
  let email = $state("");
  let password = $state("");
  let confirmPassword = $state("");
  let loading = $state(false);

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    loading = true;
    setTimeout(() => (loading = false), 1500);
  };
</script>

<div class="min-h-screen bg-gradient-to-br from-[#0f1a2e] via-[#1a2a4a] to-[#0f1a2e] flex items-center justify-center p-4">
  <div class="absolute inset-0 overflow-hidden pointer-events-none">
    <div class="absolute top-1/4 right-1/4 w-96 h-96 bg-teal/5 rounded-full blur-3xl"></div>
    <div class="absolute bottom-1/4 left-1/4 w-96 h-96 bg-orange/5 rounded-full blur-3xl"></div>
  </div>

  <div class="w-full max-w-md relative z-10">
    <a href="/" class="flex items-center justify-center gap-2 mb-8">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-orange to-orange/80 flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
      </div>
      <span class="text-2xl font-bold text-white">HeroRank</span>
    </a>

    <div class="bg-white rounded-2xl shadow-2xl p-8">
      <h1 class="text-2xl font-bold text-text-primary text-center mb-1">Create your account</h1>
      <p class="text-sm text-text-muted text-center mb-6">Join thousands of sellers ranking higher</p>

      <button class="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-medium text-text-primary hover:bg-bg-page transition-colors mb-4" data-testid="signup-google">
        <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
        Continue with Google
      </button>

      <div class="flex items-center gap-3 mb-4">
        <div class="flex-1 h-px bg-border"></div>
        <span class="text-xs text-text-muted">or</span>
        <div class="flex-1 h-px bg-border"></div>
      </div>

      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label class="text-xs font-semibold text-text-secondary mb-1 block" for="signup-email">Email</label>
          <input id="signup-email" type="email" bind:value={email} placeholder="you@example.com" class="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 bg-white" required data-testid="signup-email" />
        </div>
        <div>
          <label class="text-xs font-semibold text-text-secondary mb-1 block" for="signup-password">Password</label>
          <input id="signup-password" type="password" bind:value={password} placeholder="••••••••" class="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 bg-white" required data-testid="signup-password" />
        </div>
        <div>
          <label class="text-xs font-semibold text-text-secondary mb-1 block" for="signup-confirm">Confirm Password</label>
          <input id="signup-confirm" type="password" bind:value={confirmPassword} placeholder="••••••••" class="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 bg-white" required data-testid="signup-confirm" />
        </div>
        <button type="submit" disabled={loading} class="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50" style="background: var(--navy)" data-testid="signup-submit">
          {loading ? "Creating account..." : "Create your account"}
        </button>
      </form>

      <p class="text-sm text-text-muted text-center mt-6">
        Already have an account?{" "}
        <a href="/auth/login" class="text-teal font-semibold hover:underline">Log in here</a>
      </p>
    </div>
  </div>
</div>
