<script lang="ts">
  /**
   * Settings → Connections (Phase 4, Engineer E / BA §3.6).
   *
   * "Connect your Etsy shop" via OAuth. Three states:
   *   - not connected → Connect button → GET /api/connect/etsy/start (server 302 to Etsy)
   *   - connected     → shop name + last calibrated + Disconnect
   *   - error         → ?error=... from the OAuth callback
   *
   * Honesty + privacy copy is required, not optional: only AGGREGATE per-category review
   * rates are stored (BR-P4-OAUTH-04); raw sales are never exposed to other users.
   *
   * Connect is a plain navigation (the start route must set server-side state + redirect),
   * so it's a real <a>/form GET — not a fetch. Disconnect is a DELETE via the API.
   */
  import { Store, Link2, Unlink, ShieldCheck, LoaderCircle, CircleAlert, CircleCheck, Info } from "lucide-svelte";
  import { page } from "$app/state";
  import { invalidateAll, goto } from "$app/navigation";

  let { data } = $props();

  // Callback signals (Engineer H redirects here with these query params).
  const justConnected = $derived(page.url.searchParams.get("connected") === "1");
  const callbackError = $derived(page.url.searchParams.get("error"));

  let disconnecting = $state(false);
  let disconnectError = $state<string | null>(null);

  const fmtDate = (epoch: number | null): string => {
    if (!epoch) return "—";
    return new Date(epoch * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleDisconnect = async () => {
    if (disconnecting) return;
    disconnecting = true;
    disconnectError = null;

    let res: Response;
    try {
      res = await fetch("/api/connect/etsy", { method: "DELETE" });
    } catch {
      disconnectError = "Couldn't reach the server. Please try again.";
      disconnecting = false;
      return;
    }

    if (res.status === 401) {
      await goto("/auth/login");
      return;
    }
    if (!res.ok) {
      disconnectError = "Couldn't disconnect your shop. Please try again.";
      disconnecting = false;
      return;
    }

    // Clear any stale ?connected=1 in the URL and re-run the loader for fresh state.
    await goto("/settings/connections", { replaceState: true, invalidateAll: true });
    disconnecting = false;
  };
</script>

<svelte:head><title>Connections · VieRank</title></svelte:head>

<div class="max-w-3xl mx-auto animate-fade-in">
  <div class="mb-8">
    <h1 class="text-2xl font-bold text-text-primary">Connections</h1>
    <p class="text-sm text-text-secondary mt-1">
      Connect your own Etsy shop to make VieRank's sales estimates more accurate.
    </p>
  </div>

  {#if callbackError && !data.connection}
    <div class="mb-6 flex items-start gap-3 p-4 rounded-lg border border-danger/30 bg-danger/5" role="alert">
      <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="text-sm font-semibold text-text-primary">We couldn't connect your shop</p>
        <p class="text-xs text-text-muted mt-1">The Etsy connection was cancelled or failed. You can try again below.</p>
      </div>
    </div>
  {/if}

  {#if justConnected && data.connection}
    <div class="mb-6 flex items-center gap-3 p-4 rounded-lg border border-success/30 bg-success/5" role="status">
      <CircleCheck size={18} class="text-success flex-shrink-0" />
      <p class="text-sm text-text-primary">Your Etsy shop is connected. Thanks — you're helping make estimates better for everyone.</p>
    </div>
  {/if}

  <div class="card p-6">
    <div class="flex items-start gap-4">
      <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-teal to-teal-dark flex items-center justify-center flex-shrink-0">
        <Store size={22} class="text-white" />
      </div>

      <div class="flex-1 min-w-0">
        {#if data.connection}
          <!-- Connected state -->
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h2 class="text-base font-bold text-text-primary truncate">
                  {data.connection.shopName ?? `Shop #${data.connection.shopId}`}
                </h2>
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-success/15 text-success">
                  <CircleCheck size={10} /> Connected
                </span>
              </div>
              <p class="text-xs text-text-muted mt-1">
                Connected {fmtDate(data.connection.connectedAt)} ·
                Last calibrated {fmtDate(data.connection.lastCalibratedAt)}
              </p>
            </div>

            <button
              type="button"
              onclick={handleDisconnect}
              disabled={disconnecting}
              class="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border text-text-primary hover:bg-bg-page disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="disconnect-shop"
            >
              {#if disconnecting}<LoaderCircle size={14} class="animate-spin" /> Disconnecting...{:else}<Unlink size={14} /> Disconnect{/if}
            </button>
          </div>

          {#if disconnectError}
            <div class="mt-3 flex items-start gap-2 text-sm text-danger" role="alert">
              <CircleAlert size={16} class="flex-shrink-0 mt-0.5" /> {disconnectError}
            </div>
          {/if}
        {:else}
          <!-- Not connected state -->
          <h2 class="text-base font-bold text-text-primary">Connect your Etsy shop</h2>
          <p class="text-sm text-text-secondary mt-1">
            Securely link your shop with Etsy. VieRank reads only your shop's transactions and reviews — read-only, no write access — to calibrate sales estimates.
          </p>

          <a
            href="/api/connect/etsy/start"
            class="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
            style="background: var(--teal)"
            data-testid="connect-shop"
          >
            <Link2 size={15} /> Connect your Etsy shop
          </a>
        {/if}
      </div>
    </div>

    <!-- Privacy + benefit copy (required, BA §3.6 / BR-P4-OAUTH-04). -->
    <div class="mt-5 pt-5 border-t border-border-light space-y-3">
      <div class="flex items-start gap-2.5">
        <ShieldCheck size={16} class="text-teal flex-shrink-0 mt-0.5" />
        <p class="text-xs text-text-secondary">
          <strong class="text-text-primary">Read-only & private.</strong>
          We request only read access to your shop's transactions, shop details, and listings. We never write to your shop, and we never share your raw sales with anyone.
        </p>
      </div>
      <div class="flex items-start gap-2.5">
        <Info size={16} class="text-teal flex-shrink-0 mt-0.5" />
        <p class="text-xs text-text-secondary">
          <strong class="text-text-primary">Only aggregate rates are stored.</strong>
          Your real sales improve estimate accuracy for every VieRank user — but only anonymized, per-category averages are saved. Individual transactions are never persisted.
        </p>
      </div>
    </div>
  </div>
</div>
