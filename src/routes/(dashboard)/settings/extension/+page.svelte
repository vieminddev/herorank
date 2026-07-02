<script lang="ts">
  import { onMount } from "svelte";
  import { Puzzle, LoaderCircle, Copy, Check, RefreshCw, CircleAlert, Eye, EyeOff, Download, Chrome } from "lucide-svelte";
  import PageHeader from "$lib/components/layout/PageHeader.svelte";
  import { env } from "$env/dynamic/public";

  // Honest download affordance: only show "Get the extension" when an artifact/store URL is
  // actually configured. Otherwise show a "coming soon" state — never tell users to download
  // something that doesn't exist. Set PUBLIC_EXTENSION_DOWNLOAD_URL when the artifact ships.
  const downloadUrl = env.PUBLIC_EXTENSION_DOWNLOAD_URL ?? "";
  const storeUrl = env.PUBLIC_EXTENSION_STORE_URL ?? "";
  const hasDownload = downloadUrl.length > 0 || storeUrl.length > 0;

  let loading = $state(true);
  let token = $state<string | null>(null);
  let error = $state<string | null>(null);
  let copied = $state(false);
  let rotating = $state(false);
  // Token is a secret — masked by default so it doesn't leak in screen-shares/screenshots.
  let revealed = $state(false);
  const masked = (t: string) => t.slice(0, 4) + "•".repeat(Math.max(8, t.length - 6)) + t.slice(-2);

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

<div class="max-w-5xl mx-auto animate-fade-in">
  <PageHeader
    title="Browser Extension"
    description="Install the VieRank extension to see SEO score, favourites and search competition right on Etsy — connect it with the token below."
    icon={Puzzle}
  />

  <div class="max-w-3xl space-y-6">
    <div class="card p-5 bg-white border border-border rounded-xl shadow-sm">
      <p class="section-kicker !text-teal font-semibold tracking-wide uppercase text-[10px] mb-3">Your extension token</p>
      {#if loading}
        <div class="flex items-center gap-2 text-text-muted text-sm py-4">
          <LoaderCircle size={15} class="animate-spin text-teal" /> Loading token…
        </div>
      {:else if error}
        <div class="flex items-start gap-2 text-sm text-danger" role="alert">
          <CircleAlert size={16} class="flex-shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
        <button
          type="button"
          onclick={loadToken}
          class="mt-3 btn btn-secondary !py-2 !px-4 text-xs font-semibold"
        >
          <RefreshCw size={12} /> Try again
        </button>
      {:else if token}
        <div class="flex items-center gap-2">
          <code class="flex-1 min-w-0 truncate px-3 py-2 rounded-lg bg-bg-page border border-border text-sm text-text-primary font-mono {revealed ? 'select-all' : 'select-none'}">{revealed ? token : masked(token)}</code>
          <button
            type="button"
            onclick={() => (revealed = !revealed)}
            class="flex-shrink-0 btn btn-secondary !py-2.5 !px-3 text-xs font-bold"
            aria-label={revealed ? "Hide token" : "Reveal token"}
            title={revealed ? "Hide token" : "Reveal token"}
          >
            {#if revealed}<EyeOff size={13} />{:else}<Eye size={13} />{/if}
          </button>
          <button
            type="button"
            onclick={copyToken}
            class="flex-shrink-0 btn btn-secondary !py-2.5 !px-4 text-xs font-bold"
          >
            {#if copied}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
          </button>
        </div>
        <button
          type="button"
          onclick={regenerate}
          disabled={rotating}
          class="mt-4 inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-teal font-semibold transition-colors disabled:opacity-50"
        >
          {#if rotating}
            <LoaderCircle size={12} class="animate-spin" /> Regenerating…
          {:else}
            <RefreshCw size={12} /> Regenerate token
          {/if}
        </button>
        <p class="field-hint text-[10px] text-text-secondary mt-1">Regenerating disconnects any extension using the old token.</p>
      {/if}
    </div>

    {#if hasDownload}
      <div class="card p-5 bg-white border border-border rounded-xl shadow-sm">
        <p class="section-kicker !text-teal font-semibold tracking-wide uppercase text-[10px] mb-3">Get the extension</p>
        <div class="flex flex-wrap items-center gap-2.5">
          {#if storeUrl}
            <a href={storeUrl} target="_blank" rel="noopener noreferrer" class="btn btn-primary !py-2.5 !px-4 text-xs font-bold">
              <Chrome size={14} /> Add to Chrome
            </a>
          {/if}
          {#if downloadUrl}
            <a href={downloadUrl} class="btn btn-secondary !py-2.5 !px-4 text-xs font-bold" download>
              <Download size={14} /> Download extension
            </a>
          {/if}
        </div>
        <p class="field-hint text-[10px] text-text-secondary mt-3">After installing, click the VieRank icon, paste the token above, and save.</p>
      </div>

      <div class="card p-5 bg-white border border-border rounded-xl shadow-sm">
        <p class="section-kicker !text-teal font-semibold tracking-wide uppercase text-[10px] mb-4">How to install</p>
        {#if storeUrl}
          <ol class="space-y-3 text-xs text-text-secondary list-decimal list-inside">
            <li class="leading-relaxed">Click <strong class="text-text-primary font-bold">Add to Chrome</strong> above and confirm the install.</li>
            <li class="leading-relaxed">Click the VieRank icon, paste the token above, and save.</li>
            <li class="leading-relaxed">Open any Etsy listing or search page — your insights appear automatically.</li>
          </ol>
        {:else}
          <ol class="space-y-3 text-xs text-text-secondary list-decimal list-inside">
            <li class="leading-relaxed">Download the extension above and unzip it, then open <code class="text-text-primary font-bold bg-bg-page px-1.5 py-0.5 border border-border rounded">chrome://extensions</code> in Chrome.</li>
            <li class="leading-relaxed">Turn on <strong class="text-text-primary font-bold">Developer mode</strong>, click <strong class="text-text-primary font-bold">Load unpacked</strong>, and select the unzipped <code class="text-text-primary font-bold bg-bg-page px-1.5 py-0.5 border border-border rounded">extension</code> folder.</li>
            <li class="leading-relaxed">Click the VieRank icon, paste the token above, and save.</li>
            <li class="leading-relaxed">Open any Etsy listing or search page — your insights appear automatically.</li>
          </ol>
        {/if}
      </div>
    {:else}
      <div class="card p-5 bg-white border border-border rounded-xl shadow-sm">
        <p class="section-kicker !text-teal font-semibold tracking-wide uppercase text-[10px] mb-4">Install the extension (beta)</p>
        <p class="text-xs text-text-secondary leading-relaxed mb-4">
          The VieRank extension ships in the app repo under <code class="text-text-primary font-bold bg-bg-page px-1.5 py-0.5 border border-border rounded">extension/</code>. Load it unpacked in Chrome or Edge:
        </p>
        <ol class="space-y-3 text-xs text-text-secondary list-decimal list-inside">
          <li class="leading-relaxed">Open <code class="text-text-primary font-bold bg-bg-page px-1.5 py-0.5 border border-border rounded">chrome://extensions</code> and turn on <strong class="text-text-primary font-bold">Developer mode</strong>.</li>
          <li class="leading-relaxed">Click <strong class="text-text-primary font-bold">Load unpacked</strong> and select the <code class="text-text-primary font-bold bg-bg-page px-1.5 py-0.5 border border-border rounded">extension</code> folder (run <code class="text-text-primary font-bold bg-bg-page px-1.5 py-0.5 border border-border rounded">npm run ext:zip</code> for a shareable .zip).</li>
          <li class="leading-relaxed">Click the VieRank icon, paste the token above, and save.</li>
          <li class="leading-relaxed">Open any Etsy listing or search page — your insights appear bottom-right, every estimate labeled “Est.”.</li>
        </ol>
        <p class="field-hint text-[10px] text-text-secondary mt-3">A one-click Chrome Web Store install will replace these steps once published (set <code class="bg-bg-page px-1 rounded">PUBLIC_EXTENSION_STORE_URL</code>).</p>
      </div>
    {/if}
  </div>
</div>
