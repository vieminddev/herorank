<script lang="ts">
  import { requestPasswordReset } from "$lib/auth-client";
  import { ArrowLeft, MailCheck, Lock } from "lucide-svelte";
  import MascotLogo from "$lib/components/ui/MascotLogo.svelte";


  let email = $state("");
  let loading = $state(false);
  let sent = $state(false);
  let error = $state("");

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = ""; loading = true;
    try {
      // redirectTo is where the emailed link lands (token appended as ?token=...).
      await requestPasswordReset({ email: email.trim(), redirectTo: "/auth/reset-password" });
      // Always show success — never reveal whether an account exists (anti-enumeration).
      sent = true;
    } catch {
      sent = true;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Reset Password — VieRank</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="lp min-h-screen bg-bg-page/30 text-text-primary flex flex-col p-6 md:p-10">
  <header class="flex items-center justify-between">
    <a href="/" class="flex items-center gap-2 group">
      <MascotLogo size={32} animate="hover" />
      <span class="text-lg font-bold tracking-tight text-text-primary">VieRank</span>
    </a>

    <a href="/auth/login" class="text-xs font-semibold text-text-secondary hover:text-teal flex items-center gap-1 transition-colors">
      <ArrowLeft size={13} /> Back to sign in
    </a>
  </header>

  <main class="w-full max-w-sm mx-auto my-auto py-10">
    {#if sent}
      <div class="text-center animate-fade-in">
        <span class="w-12 h-12 rounded-xl bg-teal/10 flex items-center justify-center mx-auto mb-4"><MailCheck size={22} class="text-teal" /></span>
        <h1 class="text-2xl font-bold tracking-tight text-text-primary">Check your inbox</h1>
        <p class="text-sm text-text-secondary mt-2 leading-relaxed">
          If an account exists for <span class="font-semibold text-text-primary">{email}</span>, we've sent a link to reset your password. It expires in 1 hour.
        </p>
        <a href="/auth/login" class="btn btn-primary w-full justify-center text-xs py-2.5 font-bold mt-6">Back to sign in</a>
      </div>
    {:else}
      <div class="mb-8">
        <h1 class="text-2xl font-bold tracking-tight text-text-primary">Forgot your password?</h1>
        <p class="text-xs text-text-secondary mt-1">Enter your email and we'll send you a reset link.</p>
      </div>
      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label for="fp-email" class="block text-xs font-semibold text-text-primary mb-1.5">Email</label>
          <input id="fp-email" type="email" name="email" autocomplete="email" autocapitalize="off" spellcheck="false"
            bind:value={email} required class="field !py-2.5 !px-3.5 text-sm" placeholder="you@example.com" disabled={loading} />
        </div>
        <button type="submit" disabled={loading} class="btn btn-primary btn-glow w-full justify-center text-xs py-2.5 font-bold mt-2">
          {loading ? "Sending..." : "Send reset link"}
        </button>
        <p class="text-center text-xs text-text-secondary pt-4">
          Remembered it? <a href="/auth/login" class="text-teal font-semibold hover:underline">Sign in</a>
        </p>
      </form>
    {/if}
  </main>

  <footer class="flex items-center justify-center text-[11px] text-text-muted font-medium gap-1">
    <Lock size={11} /> © 2026 VieRank
  </footer>
</div>
