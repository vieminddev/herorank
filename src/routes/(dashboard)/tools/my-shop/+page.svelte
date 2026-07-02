<script lang="ts">
  /**
   * My Shop — the connected seller's real 90-day numbers, straight from Etsy.
   *
   * GET /api/my-shop/overview (read-only). Four states:
   *   - loading     → spinner
   *   - 404         → "Connect your Etsy shop" CTA (no OAuth-connected shop)
   *   - error       → message
   *   - data        → real-data badge + 90d totals + last-30 line + bestsellers
   */
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ConnectShopEmpty from "$lib/components/ui/ConnectShopEmpty.svelte";
  import { Store, LoaderCircle, BadgeCheck } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";

  const GENERIC_ERROR = "Something went wrong. Please try again.";

  interface TopListing {
    title: string;
    units: number;
    orders: number;
  }
  interface Overview {
    connected: boolean;
    real: boolean;
    calibrated: boolean;
    shopName: string | null;
    currency: string;
    rangeDays: number;
    totals: { orders: number; revenue: number; units: number; aov: number };
    last30: { orders: number; revenue: number };
    topListings: TopListing[];
  }
  type ApiResult<T> =
    | { ok: true; data: T }
    | { ok: false; status: number; error: string; message: string };

  async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
    let res: Response;
    try {
      res = await fetch(`/api/my-shop${path}`, {
        headers: init?.body ? { "content-type": "application/json" } : undefined,
        ...init,
      });
    } catch {
      return { ok: false, status: 0, error: "NETWORK", message: GENERIC_ERROR };
    }
    if (res.status === 401) {
      await goto("/auth/login");
      return { ok: false, status: 401, error: "UNAUTHENTICATED", message: "Please sign in again." };
    }
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: typeof body?.error === "string" ? body.error : "ERROR",
        message: typeof body?.message === "string" ? body.message : GENERIC_ERROR,
      };
    }
    return { ok: true, data: (body ?? {}) as T };
  }

  const getShopOverview = () => api<Overview>("/overview");

  let data = $state<Overview | null>(null);
  let loaded = $state(false);
  let connected = $state(true);
  let needsReconnect = $state(false);
  let error = $state<string | null>(null);

  const loadOverview = async () => {
    loaded = false;
    error = null;
    // No connected shop (known from the layout) → show the connect state without a 404 round-trip.
    if (!$page.data.shopConnected) {
      connected = false;
      loaded = true;
      return;
    }
    const res = await getShopOverview();
    if (res.ok) {
      data = res.data;
      connected = true;
    } else if (res.status === 404) {
      connected = false;
    } else if (res.error === "ETSY_REAUTH") {
      needsReconnect = true;
    } else if (res.status !== 401) {
      error = res.message;
    }
    loaded = true;
  };

  const cur = (n: number): string => {
    const code = data?.currency ?? "USD";
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(n);
    } catch {
      return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  };

  onMount(() => {
    loadOverview();
  });
</script>

<ToolPageLayout
  title="Sales Overview"
  description="Your real numbers, straight from Etsy — the sales, orders, and bestsellers from your connected shop. No estimates here."
  icon={Store}
>
  {#if !loaded}
    <div class="flex items-center gap-2 text-text-muted text-sm">
      <LoaderCircle size={15} class="animate-spin" /> Loading your shop…
    </div>
  {:else if !connected}
    <ConnectShopEmpty
      hint="Link your shop once and this page shows your real sales, orders, and top listings — read-only and private."
    />
  {:else if needsReconnect}
    <div class="panel-tint p-6 max-w-md">
      <p class="text-sm font-semibold text-text-primary mb-1">Reconnect your Etsy shop</p>
      <p class="text-sm text-text-secondary mb-3">Your Etsy connection has expired, so we can't load your real numbers right now. Reconnect and they'll be back in seconds.</p>
      <a href="/settings/connections" class="btn btn-secondary !py-2 !px-4 text-xs font-bold inline-flex items-center gap-1.5">Reconnect your shop →</a>
    </div>
  {:else if error}
    <p class="text-sm text-danger">{error}</p>
  {:else if data}
    <div class="animate-fade-in">
      <div class="flex items-center gap-2 mb-6">
        <span class="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold px-2 py-1 rounded-full bg-success/10 text-success">
          <BadgeCheck size={13} /> Real data
        </span>
        {#if data.shopName}
          <span class="text-sm text-text-muted">{data.shopName}</span>
        {/if}
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div class="p-4 rounded-xl border border-border">
          <p class="section-kicker mb-1">Revenue · 90d</p>
          <p class="text-2xl font-semibold tracking-tight text-text-primary tabular-nums">{cur(data.totals.revenue)}</p>
        </div>
        <div class="p-4 rounded-xl border border-border">
          <p class="section-kicker mb-1">Orders · 90d</p>
          <p class="text-2xl font-semibold tracking-tight text-text-primary tabular-nums">{data.totals.orders.toLocaleString()}</p>
        </div>
        <div class="p-4 rounded-xl border border-border">
          <p class="section-kicker mb-1">Avg order</p>
          <p class="text-2xl font-semibold tracking-tight text-text-primary tabular-nums">{cur(data.totals.aov)}</p>
        </div>
        <div class="p-4 rounded-xl border border-border">
          <p class="section-kicker mb-1">Units sold</p>
          <p class="text-2xl font-semibold tracking-tight text-text-primary tabular-nums">{data.totals.units.toLocaleString()}</p>
        </div>
      </div>

      <div class="flex items-center gap-6 mb-8 text-sm">
        <span class="text-text-secondary">Last 30 days:</span>
        <span class="text-text-primary"><span class="font-semibold tabular-nums">{cur(data.last30.revenue)}</span> revenue</span>
        <span class="text-text-primary"><span class="font-semibold tabular-nums">{data.last30.orders}</span> orders</span>
      </div>

      <p class="section-kicker mb-3">Your bestsellers · 90d</p>
      {#if data.topListings.length}
        <div class="entry-list">
          {#each data.topListings as item, i}
            <div class="entry">
              <span class="entry-index">{String(i + 1).padStart(2, "0")}</span>
              <div class="flex-1 min-w-0">
                <p class="text-[0.9375rem] text-text-primary truncate">{item.title}</p>
                <p class="entry-meta mt-0.5">{item.units} sold · {item.orders} order{item.orders === 1 ? "" : "s"}</p>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-sm text-text-muted">No orders in the last 90 days yet.</p>
      {/if}

      <p class="field-hint mt-8">
        Pulled live from your connected Etsy shop (read-only). Revenue is what you earn — item sales plus the shipping you charged — over the last 90 days. Sales tax collected is excluded (it's remitted, not income).
      </p>
    </div>
  {/if}
</ToolPageLayout>
