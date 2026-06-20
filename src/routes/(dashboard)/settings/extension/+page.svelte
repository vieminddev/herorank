<script lang="ts">
  import { onMount } from "svelte";
  import { Puzzle, LoaderCircle, Copy, Check, RefreshCw, CircleAlert } from "lucide-svelte";

  let loading = $state(true);
  let token = $state<string | null>(null);
  let error = $state<string | null>(null);
  let copied = $state(false);
  let rotating = $state(false);

  async function loadToken() {
    loading = true;
    error = null;
    let res: Response;
    try {
      res = await fetch("/api/ext/token", { credentials: "same-origin" });
    } catch {
      error = "Couldn't reach the server. Please try again.";
      loading = false;
      return;
    }
    if (!res.ok) {
      error = "Couldn't load your extension token. Please try again.";
      loading = false;
      return;
    }
    const data = (await res.json()) as { token: string };
    token = data.token;
    loading = false;
  }

  async function regenerate() {
    if (rotating) return;
    rotating = true;
    error = null;
    let res: Response;
    try {
      res = await fetch("/api/ext/token", { method: "POST", credentials: "same-origin" });
    } catch {
      error = "Couldn't reach the server. Please try again.";
      rotating = false;
      return;
    }
    if (!res.ok) {
      error = "Couldn't regenerate your token. Please try again.";
      rotating = false;
      return;
    }
    const data = (await res.json()) as { token: string };
    token = data.token;
    rotating = false;
  }

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  onMount(loadToken);
</script>

<svelte:head><title>Browser Extension · VieRank</title></svelte:head>

<div class="max-w-2xl mx-auto py-8 px-4">
  <div class="flex items-center gap-3 mb-2">
    <span class="w-10 h-10 rounded-xl bg-teal/8 text-teal flex items-center justify-center">
      <Puzzle size={20} />
    </span>
    <h1 class="text-xl font-semibold tracking-tight text-text-primary">Browser Extension</h1>
  </div>
  <p class="lead text-sm mb-8">
    Install the VieRank extension to see SEO score, favourites and search competition right on Etsy. Connect it with the token below.
  </p>

  <div class="rounded-xl border border-border p-5 mb-6">
    <p class="section-kicker mb-2">Your extension token</p>
    {#if loading}
      <div class="flex items-center gap-2 text-text-muted text-sm">
        <LoaderCircle size={15} class="animate-spin" /> Loading…
      </div>
    {:else if error}
      <div class="flex items-start gap-2 text-sm text-danger" role="alert">
        <CircleAlert size={16} class="flex-shrink-0 mt-0.5" /> {error}
      </div>
      <button
        type="button"
        onclick={loadToken}
        class="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-border text-text-primary hover:bg-bg-page transition-colors"
      >
        <RefreshCw size={14} /> Try again
      </button>
    {:else if token}
      <div class="flex items-center gap-2">
        <code class="flex-1 min-w-0 truncate px-3 py-2 rounded-lg bg-surface-2 text-sm text-text-primary font-mono">{token}</code>
        <button
          type="button"
          onclick={copyToken}
          class="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border text-text-primary hover:bg-bg-page transition-colors"
        >
          {#if copied}<Check size={14} class="text-success" /> Copied{:else}<Copy size={14} /> Copy{/if}
        </button>
      </div>
      <button
        type="button"
        onclick={regenerate}
        disabled={rotating}
        class="mt-3 inline-flex items-center gap-2 text-[0.8125rem] text-text-muted hover:text-text-primary disabled:opacity-50 transition-colors"
      >
        {#if rotating}<LoaderCircle size={13} class="animate-spin" /> Regenerating…{:else}<RefreshCw size={13} /> Regenerate token{/if}
      </button>
      <p class="field-hint mt-2">Regenerating disconnects any extension using the old token.</p>
    {/if}
  </div>

  <div class="rounded-xl border border-border p-5">
    <p class="section-kicker mb-3">How to install</p>
    <ol class="space-y-2 text-sm text-text-secondary list-decimal list-inside">
      <li>Download the extension folder and open <code class="text-text-primary">chrome://extensions</code>.</li>
      <li>Turn on <strong>Developer mode</strong>, click <strong>Load unpacked</strong>, and select the <code class="text-text-primary">extension</code> folder.</li>
      <li>Click the VieRank icon, paste the token above, and save.</li>
      <li>Open any Etsy listing or search page — your insights appear automatically.</li>
    </ol>
  </div>
</div>
