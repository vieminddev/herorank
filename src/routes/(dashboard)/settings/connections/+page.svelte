<script lang="ts">
  /**
   * Settings → Connections (Phase 4 — multi-shop).
   *
   * "Connect your Etsy shops" via OAuth — more than one shop can be linked. States:
   *   - no shops    → single Connect CTA → GET /api/connect/etsy/start (server 302 to Etsy)
   *   - has shops   → list of connected shops (name, id, scopes, dates, Default badge) with
   *                   per-shop "Make default" / "Disconnect", plus "Connect another shop"
   *   - error       → ?error=... from the OAuth callback
   *
   * Honesty + privacy copy is required, not optional: only AGGREGATE per-category review
   * rates are stored (BR-P4-OAUTH-04); raw sales are never exposed to other users.
   *
   * Connect is a plain navigation (the start route must set server-side state + redirect),
   * so it's a real <a>/form GET — not a fetch. Per-shop actions hit the API:
   *   DELETE /api/connect/etsy/:shopId   → disconnect one shop
   *   POST   /api/connect/etsy/primary   → set the default shop ({ shopId })
   * After either, the loader is re-run (invalidateAll) so the list reflects the new state.
   */
  import { Store, Link2, Plus, ShieldCheck, CircleAlert, CircleCheck, Info, BookOpen, ArrowRight, Eye, PencilLine, Clock } from "lucide-svelte";
  import PageHeader from "$lib/components/layout/PageHeader.svelte";
  import ShopList from "$lib/components/settings/ShopList.svelte";
  import { page } from "$app/state";
  import { goto, invalidateAll } from "$app/navigation";
  import { cheer } from "$lib/mascotCheer";

  let { data } = $props();

  // Callback signals (the OAuth callback redirects here with these query params).
  const justConnected = $derived(page.url.searchParams.get("connected") === "1");
  const callbackError = $derived(page.url.searchParams.get("error"));
  // Map the callback's error code to a specific, human reason (falls back to a generic line).
  const CALLBACK_ERRORS: Record<string, string> = {
    access_denied: "You declined the connection on Etsy. Approve access to link your shop.",
    exchange_failed: "We couldn't finish the secure handshake with Etsy. Please try again.",
    connect_failed: "Something went wrong saving the connection. Please try again.",
    invalid_state: "The connection link expired. Start again from the button below.",
    no_shop: "We connected to Etsy but couldn't find a shop on that account.",
    shop_limit: "You've reached your plan's connected-shop limit. Disconnect a shop or upgrade your plan to add another.",
  };
  const callbackErrorMsg = $derived(
    callbackError
      ? (CALLBACK_ERRORS[callbackError] ?? "The Etsy connection was cancelled or failed. Please try again below.")
      : null,
  );

  // Real win: a shop just linked → mascot cheer (fires once, when the flag flips true).
  $effect(() => {
    if (justConnected) cheer({ title: "Shop connected!", subtitle: "VieRank is now syncing your Etsy shop." });
  });

  const shops = $derived(data.connections ?? []);

  // --- Permission scope choice (read is always granted; write is opt-in) ---
  // Write can only be requested once Etsy has approved the app for the write scope
  // (server flag ETSY_WRITE_ENABLED, surfaced as data.writeAvailable). Until then the
  // option is shown but disabled ("pending Etsy approval").
  const writeAvailable = $derived(data.writeAvailable ?? false);
  let writeChecked = $state(false);
  const connectHref = $derived(
    writeChecked && writeAvailable ? "/api/connect/etsy/start?write=1" : "/api/connect/etsy/start",
  );

  // Features that only work with the optional write permission.
  const WRITE_FEATURES = [
    { label: "Listing Editor", desc: "save & push edits straight to Etsy" },
    { label: "Listing Builder", desc: "create & publish draft listings on Etsy" },
  ];

  // Only one row is actionable at a time; this id drives that row's spinner + disables others.
  let busyShopId = $state<number | null>(null);
  let actionError = $state<string | null>(null);

  /** Re-run the server loader and clear any stale ?connected=1/?error=... from the URL. */
  const refresh = async () => {
    await goto("/settings/connections", { replaceState: true, keepFocus: true });
    await invalidateAll();
  };

  const handleMakeDefault = async (shopId: number) => {
    if (busyShopId !== null) return;
    busyShopId = shopId;
    actionError = null;

    let res: Response;
    try {
      res = await fetch("/api/connect/etsy/primary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shopId }),
      });
    } catch {
      actionError = "Couldn't reach the server. Please try again.";
      busyShopId = null;
      return;
    }

    if (res.status === 401) {
      await goto("/auth/login");
      return;
    }
    if (!res.ok) {
      actionError = "Couldn't set that shop as your default. Please try again.";
      busyShopId = null;
      return;
    }

    await refresh();
    busyShopId = null;
  };

  const handleDisconnect = async (shopId: number) => {
    if (busyShopId !== null) return;

    const target = shops.find((s) => s.shopId === shopId);
    const label = target?.shopName ?? `Shop #${shopId}`;
    if (!confirm(`Disconnect ${label}? VieRank will lose read access to this shop.`)) return;

    busyShopId = shopId;
    actionError = null;

    let res: Response;
    try {
      res = await fetch(`/api/connect/etsy/${shopId}`, { method: "DELETE" });
    } catch {
      actionError = "Couldn't reach the server. Please try again.";
      busyShopId = null;
      return;
    }

    if (res.status === 401) {
      await goto("/auth/login");
      return;
    }
    if (!res.ok) {
      actionError = "Couldn't disconnect that shop. Please try again.";
      busyShopId = null;
      return;
    }

    await refresh();
    busyShopId = null;
  };
</script>

<svelte:head><title>Connections · VieRank</title></svelte:head>

<div class="max-w-5xl mx-auto animate-fade-in">
  <PageHeader title="Connect Shop" description="Connect and manage your Etsy shop connections." icon={Store} />

  <div class="max-w-3xl">
    {#if callbackError}
      <div class="mb-6 flex items-start gap-3 p-4 rounded-xl border border-danger/20 bg-danger/5" role="alert">
        <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
        <div class="flex-1">
          <p class="text-sm font-semibold text-text-primary">We couldn't connect that shop</p>
          <p class="text-xs text-text-secondary mt-1">{callbackErrorMsg}</p>
        </div>
      </div>
    {/if}

    {#if justConnected}
      <div class="mb-6 flex items-center gap-3 p-4 rounded-xl border border-success/20 bg-success/5" role="status">
        <CircleCheck size={18} class="text-success flex-shrink-0" />
        <p class="text-sm text-text-primary">Shop connected. You can connect another below.</p>
      </div>
    {/if}

    {#if actionError}
      <div class="mb-6 flex items-start gap-2 text-sm text-danger p-4 rounded-xl border border-danger/20 bg-danger/5" role="alert">
        <CircleAlert size={16} class="flex-shrink-0 mt-0.5 text-danger" /> <span>{actionError}</span>
      </div>
    {/if}

    <!-- Stepper Connections UI (DESIGN.md Stepper Task) -->
    {#if shops.length === 0}
      <div class="mb-6 p-6 bg-white border border-border rounded-xl shadow-sm animate-fade-in">
        <p class="section-kicker mb-4 uppercase tracking-wider text-[10px] text-text-muted">Connection Wizard</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="p-4 rounded-xl border border-teal bg-teal/5 flex items-start gap-3">
            <span class="w-6 h-6 rounded-full bg-teal text-white text-xs font-semibold flex items-center justify-center shrink-0">1</span>
            <div>
              <h4 class="text-xs font-bold text-text-primary">Etsy Auth</h4>
              <p class="text-[10px] text-text-secondary mt-0.5">Securely log in and link account</p>
            </div>
          </div>
          <div class="p-4 rounded-xl border border-border bg-bg-page/40 flex items-start gap-3 opacity-60">
            <span class="w-6 h-6 rounded-full bg-bg-page border border-border text-text-secondary text-xs font-semibold flex items-center justify-center shrink-0">2</span>
            <div>
              <h4 class="text-xs font-bold text-text-muted">Choose Shop</h4>
              <p class="text-[10px] text-text-muted mt-0.5">Set your default primary shop</p>
            </div>
          </div>
          <div class="p-4 rounded-xl border border-border bg-bg-page/40 flex items-start gap-3 opacity-60">
            <span class="w-6 h-6 rounded-full bg-bg-page border border-border text-text-secondary text-xs font-semibold flex items-center justify-center shrink-0">3</span>
            <div>
              <h4 class="text-xs font-bold text-text-muted">Initial Sync</h4>
              <p class="text-[10px] text-text-muted mt-0.5">Load active listings & reviews</p>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="mb-6 p-6 bg-white border border-border rounded-xl shadow-sm animate-fade-in">
        <p class="section-kicker mb-4 uppercase tracking-wider text-[10px] text-text-muted">Connection Wizard</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="p-4 rounded-xl border border-success/30 bg-success-bg/20 flex items-start gap-3">
            <span class="w-6 h-6 rounded-full bg-success text-white text-xs font-semibold flex items-center justify-center shrink-0">✓</span>
            <div>
              <h4 class="text-xs font-bold text-success">Etsy Auth</h4>
              <p class="text-[10px] text-text-secondary mt-0.5">Linked successfully</p>
            </div>
          </div>
          <div class="p-4 rounded-xl border border-teal bg-teal/5 flex items-start gap-3">
            <span class="w-6 h-6 rounded-full bg-teal text-white text-xs font-semibold flex items-center justify-center shrink-0">2</span>
            <div>
              <h4 class="text-xs font-bold text-text-primary">Choose Shop</h4>
              <p class="text-[10px] text-text-secondary mt-0.5">{shops.length} shop{shops.length === 1 ? '' : 's'} linked</p>
            </div>
          </div>
          <div class="p-4 rounded-xl border border-border bg-bg-page/40 flex items-start gap-3 opacity-60">
            <span class="w-6 h-6 rounded-full bg-bg-page border border-border text-text-secondary text-xs font-semibold flex items-center justify-center shrink-0">3</span>
            <div>
              <h4 class="text-xs font-bold text-text-muted">Sync Ready</h4>
              <p class="text-[10px] text-text-muted mt-0.5">Automated telemetry syncing</p>
            </div>
          </div>
        </div>
      </div>
    {/if}

    {#if shops.length}
      <div class="mb-6">
        <ShopList
          {shops}
          {busyShopId}
          onMakeDefault={handleMakeDefault}
          onDisconnect={handleDisconnect}
        />
      </div>
    {/if}

    <div class="card p-6 bg-white border border-border rounded-xl shadow-sm">
      {#if shops.length}
        <h2 class="text-sm font-bold text-text-primary">Add another shop</h2>
        <p class="text-xs text-text-secondary mt-1">
          Connect a different Etsy shop — sign in to that shop's Etsy account when prompted, then choose what access to grant.
        </p>
      {:else}
        <h2 class="text-sm font-bold text-text-primary">Connect your Etsy shop</h2>
        <p class="text-xs text-text-secondary mt-1">
          Securely link your shop with Etsy. Choose what VieRank may access — you approve it on Etsy's own page.
        </p>
      {/if}

      <!-- Permission scope chooser: read is mandatory; write is opt-in (and Etsy-approval gated). -->
      <fieldset class="mt-4 rounded-xl border border-border divide-y divide-border-light overflow-hidden">
        <legend class="sr-only">Choose permissions</legend>

        <!-- Read (always granted) -->
        <label class="flex items-start gap-3 p-3.5 bg-bg-page/40 cursor-default">
          <input type="checkbox" checked disabled class="mt-0.5 accent-teal" aria-label="Read access (required)" />
          <span class="min-w-0">
            <span class="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
              <Eye size={14} class="text-teal" /> Read access
              <span class="text-[10px] font-bold uppercase tracking-wide text-teal bg-teal/10 px-1.5 py-0.5 rounded">Required</span>
            </span>
            <span class="block text-xs text-text-secondary mt-0.5 leading-relaxed">
              Read your shop, listings & transactions to power stats, audits, research and SEO tools.
            </span>
          </span>
        </label>

        <!-- Write (optional) -->
        <label class="flex items-start gap-3 p-3.5 {writeAvailable ? 'cursor-pointer hover:bg-bg-page/40' : 'cursor-not-allowed opacity-80'} transition-colors">
          <input
            type="checkbox"
            bind:checked={writeChecked}
            disabled={!writeAvailable}
            class="mt-0.5 accent-teal"
            data-testid="write-scope-toggle"
            aria-label="Write access (optional)"
          />
          <span class="min-w-0">
            <span class="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
              <PencilLine size={14} class="text-teal" /> Write access
              <span class="text-[10px] font-medium text-text-muted">(optional)</span>
              {#if !writeAvailable}
                <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style="background: var(--warning-bg); color: var(--warning);">
                  <Clock size={10} /> Pending Etsy approval
                </span>
              {/if}
            </span>
            <span class="block text-xs text-text-secondary mt-0.5 leading-relaxed">
              Let VieRank save edits and publish drafts directly to your shop. Needed only for these tools:
            </span>
            <span class="mt-2 flex flex-col gap-1">
              {#each WRITE_FEATURES as f (f.label)}
                <span class="text-xs text-text-secondary flex items-start gap-1.5">
                  <PencilLine size={12} class="text-text-muted flex-shrink-0 mt-0.5" />
                  <span><strong class="text-text-primary font-semibold">{f.label}</strong> — {f.desc}</span>
                </span>
              {/each}
            </span>
            {#if !writeAvailable}
              <span class="block text-[11px] text-text-muted mt-2 leading-relaxed">
                Write access is awaiting approval from Etsy. Until then you can connect with read access — these tools will unlock automatically once approved.
              </span>
            {/if}
          </span>
        </label>
      </fieldset>

      <a
        href={connectHref}
        class="btn btn-primary inline-flex items-center gap-2 mt-4 !py-2.5 !px-5 text-xs font-bold"
        data-testid={shops.length ? "connect-another-shop" : "connect-shop"}
      >
        {#if shops.length}<Plus size={14} /> Connect another shop{:else}<Link2 size={14} /> Connect your Etsy shop{/if}
      </a>

      <p class="text-[11px] text-text-muted mt-2">
        You'll grant <strong class="text-text-secondary">read access{#if writeChecked && writeAvailable}<span> + write access</span>{/if}</strong> on Etsy's secure page. You can change or revoke this anytime.
      </p>
      <p class="text-[11px] text-text-muted mt-1.5">
        By connecting, you agree to VieRank's
        <a href="/terms" target="_blank" rel="noopener" class="text-teal font-semibold hover:underline">Terms</a>
        and
        <a href="/privacy" target="_blank" rel="noopener" class="text-teal font-semibold hover:underline">Privacy Policy</a>.
        For the shop data you authorize, you are the data controller and VieRank acts as your data processor.
      </p>

      <!-- First-timer help: link to the public step-by-step OAuth guide (new tab — stays in-app). -->
      <a href="/docs/connect-shop" target="_blank" rel="noopener" class="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-teal hover:text-teal-dark transition-colors">
        <BookOpen size={14} /> New here? Read the step-by-step guide <ArrowRight size={13} />
      </a>

      <!-- Privacy + benefit copy (required, BA §3.6 / BR-P4-OAUTH-04). -->
      <div class="mt-5 pt-5 border-t border-border-light space-y-3">
        <div class="flex items-start gap-2.5">
          <ShieldCheck size={16} class="text-teal flex-shrink-0 mt-0.5" />
          <p class="text-[11px] text-text-secondary leading-relaxed">
            <strong class="text-text-primary font-bold">Read-only by default & private.</strong>
            Read access covers your transactions, shop details, and listings. Write access is optional — when granted it's used only for edits and drafts you explicitly trigger. We never share your raw sales with anyone.
          </p>
        </div>
        <div class="flex items-start gap-2.5">
          <Info size={16} class="text-teal flex-shrink-0 mt-0.5" />
          <p class="text-[11px] text-text-secondary leading-relaxed">
            <strong class="text-text-primary font-bold">Only aggregate rates are stored.</strong>
            Your real sales improve estimate accuracy for every VieRank user — but only anonymized, per-category averages are saved. Individual transactions are never persisted.
          </p>
        </div>
      </div>
    </div>
  </div>
</div>
