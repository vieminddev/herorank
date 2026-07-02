<script lang="ts">
  import { getSession } from "$lib/auth-client";
  import { CheckCircle2, MailWarning, Lock, ArrowRight } from "lucide-svelte";
  import MascotLogo from "$lib/components/ui/MascotLogo.svelte";

  import { onMount } from "svelte";

  // Better Auth redirects here after hitting /api/auth/verify-email. On failure it appends
  // ?error=<reason> (e.g. token_expired / invalid_token); on success there's no error param.
  let view = $state<"checking" | "signedIn" | "verified" | "error">("checking");
  let errorReason = $state("");

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      errorReason = err.replace(/_/g, " ");
      view = "error";
      return;
    }
    // Verification succeeded. autoSignInAfterVerification may have set a session cookie —
    // detect it so we can route straight into the app, otherwise ask them to sign in.
    try {
      const res = await getSession();
      const hasSession = !!(res && "data" in res ? res.data?.user : (res as any)?.user);
      if (hasSession) {
        view = "signedIn";
        setTimeout(() => window.location.assign("/dashboard"), 1400);
      } else {
        view = "verified";
      }
    } catch {
      view = "verified";
    }
  });
</script>

<svelte:head>
  <title>Email Verified — VieRank</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="lp min-h-screen bg-bg-page/30 text-text-primary flex flex-col p-6 md:p-10">
  <header class="flex items-center justify-between">
    <a href="/" class="flex items-center gap-2 group">
      <MascotLogo size={32} animate="hover" />
      <span class="text-lg font-bold tracking-tight text-text-primary">VieRank</span>
    </a>

  </header>

  <main class="w-full max-w-sm mx-auto my-auto py-10 text-center">
    {#if view === "checking"}
      <div class="animate-fade-in">
        <span class="w-12 h-12 rounded-xl bg-teal/10 flex items-center justify-center mx-auto mb-4">
          <span class="w-5 h-5 border-2 border-teal/30 border-t-teal rounded-full animate-spin"></span>
        </span>
        <p class="text-sm text-text-secondary">Confirming your email…</p>
      </div>
    {:else if view === "signedIn"}
      <div class="animate-fade-in">
        <span class="w-12 h-12 rounded-xl bg-teal/10 flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={24} class="text-teal" /></span>
        <h1 class="text-2xl font-bold tracking-tight text-text-primary">Email verified 🎉</h1>
        <p class="text-sm text-text-secondary mt-2 leading-relaxed">You're all set — taking you to your dashboard…</p>
        <a href="/dashboard" class="btn btn-primary w-full justify-center text-xs py-2.5 font-bold mt-6 inline-flex items-center gap-1.5">
          Go to dashboard <ArrowRight size={14} />
        </a>
      </div>
    {:else if view === "verified"}
      <div class="animate-fade-in">
        <span class="w-12 h-12 rounded-xl bg-teal/10 flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={24} class="text-teal" /></span>
        <h1 class="text-2xl font-bold tracking-tight text-text-primary">Email verified 🎉</h1>
        <p class="text-sm text-text-secondary mt-2 leading-relaxed">Your account is active. Sign in to start using your 30 free credits.</p>
        <a href="/auth/login" class="btn btn-primary w-full justify-center text-xs py-2.5 font-bold mt-6">Sign in</a>
      </div>
    {:else}
      <div class="animate-fade-in">
        <span class="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mx-auto mb-4"><MailWarning size={24} class="text-amber-600" /></span>
        <h1 class="text-2xl font-bold tracking-tight text-text-primary">Link expired or invalid</h1>
        <p class="text-sm text-text-secondary mt-2 leading-relaxed">
          This verification link {errorReason ? `(${errorReason}) ` : ""}is no longer valid. Sign in and we'll send you a fresh one.
        </p>
        <a href="/auth/login" class="btn btn-primary w-full justify-center text-xs py-2.5 font-bold mt-6">Back to sign in</a>
      </div>
    {/if}
  </main>

  <footer class="flex items-center justify-center text-[11px] text-text-muted font-medium gap-1">
    <Lock size={11} /> © 2026 VieRank
  </footer>
</div>
