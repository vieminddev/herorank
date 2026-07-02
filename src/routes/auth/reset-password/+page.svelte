<script lang="ts">
  import { resetPassword } from "$lib/auth-client";
  import { ArrowLeft, Eye, EyeOff, CircleAlert, Lock } from "lucide-svelte";
  import MascotLogo from "$lib/components/ui/MascotLogo.svelte";

  import { onMount } from "svelte";

  let token = $state("");
  let invalidLink = $state(false);
  let password = $state("");
  let confirm = $state("");
  let showPw = $state(false);
  let loading = $state(false);
  let error = $state("");
  let done = $state(false);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    token = params.get("token") ?? "";
    // Better Auth redirects here with ?error=... when the token is missing/expired/invalid.
    if (!token || params.get("error")) invalidLink = true;
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    if (password.length < 8) { error = "Password must be at least 8 characters."; return; }
    if (password !== confirm) { error = "Passwords don't match."; return; }
    loading = true;
    try {
      const res = await resetPassword({ newPassword: password, token });
      if (res.error) {
        error = res.error.message ?? "This reset link is invalid or has expired.";
      } else {
        done = true;
      }
    } catch {
      error = "Something went wrong. Please try again.";
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Set a New Password — VieRank</title>
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
    {#if done}
      <div class="text-center animate-fade-in">
        <h1 class="text-2xl font-bold tracking-tight text-text-primary">Password updated</h1>
        <p class="text-sm text-text-secondary mt-2">You can now sign in with your new password.</p>
        <a href="/auth/login" class="btn btn-primary w-full justify-center text-xs py-2.5 font-bold mt-6">Sign in</a>
      </div>
    {:else if invalidLink}
      <div class="text-center animate-fade-in">
        <span class="w-12 h-12 rounded-xl bg-danger-bg flex items-center justify-center mx-auto mb-4"><CircleAlert size={22} class="text-danger" /></span>
        <h1 class="text-2xl font-bold tracking-tight text-text-primary">Link expired</h1>
        <p class="text-sm text-text-secondary mt-2 leading-relaxed">This password reset link is invalid or has expired. Request a fresh one.</p>
        <a href="/auth/forgot-password" class="btn btn-primary w-full justify-center text-xs py-2.5 font-bold mt-6">Request a new link</a>
      </div>
    {:else}
      <div class="mb-8">
        <h1 class="text-2xl font-bold tracking-tight text-text-primary">Set a new password</h1>
        <p class="text-xs text-text-secondary mt-1">Choose a strong password you haven't used before.</p>
      </div>
      <form onsubmit={handleSubmit} class="space-y-4">
        {#if error}
          <div class="p-3.5 rounded-xl bg-danger-bg border border-danger-light/10 text-danger text-xs font-semibold leading-relaxed animate-fade-in" role="alert">{error}</div>
        {/if}
        <div>
          <label for="rp-pw" class="block text-xs font-semibold text-text-primary mb-1.5">New password</label>
          <div class="relative">
            <input id="rp-pw" type={showPw ? "text" : "password"} name="new-password" autocomplete="new-password"
              bind:value={password} required minlength="8" class="field !py-2.5 !px-3.5 !pr-10 text-sm" placeholder="At least 8 characters" disabled={loading} />
            <button type="button" onclick={() => (showPw = !showPw)} tabindex="-1"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              aria-label={showPw ? "Hide password" : "Show password"}>
              {#if showPw}<EyeOff size={15} />{:else}<Eye size={15} />{/if}
            </button>
          </div>
        </div>
        <div>
          <label for="rp-confirm" class="block text-xs font-semibold text-text-primary mb-1.5">Confirm password</label>
          <input id="rp-confirm" type={showPw ? "text" : "password"} name="confirm-password" autocomplete="new-password"
            bind:value={confirm} required minlength="8" class="field !py-2.5 !px-3.5 text-sm" placeholder="Re-enter password" disabled={loading} />
        </div>
        <button type="submit" disabled={loading} class="btn btn-primary btn-glow w-full justify-center text-xs py-2.5 font-bold mt-2">
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>
    {/if}
  </main>

  <footer class="flex items-center justify-center text-[11px] text-text-muted font-medium gap-1">
    <Lock size={11} /> © 2026 VieRank
  </footer>
</div>
