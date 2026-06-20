<script lang="ts">
  /**
   * My Shop — the connected seller's real 90-day numbers, straight from Etsy.
   *
   * GET /api/my-shop/overview (read-only). Four states:
   *   - loading     → spinner
   *   - 404         → "Connect your Etsy shop" CTA (no OAuth-connected shop)
   *   - error       → message
   *   - data        → real-data badge + 90d totals + last-30 line + bestsellers
   *
   * The active shop is remembered in localStorage (multi-shop accounts); the shop
   * selector only appears when more than one shop is known.
   */
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { Store, LoaderCircle, Plug, ArrowRight, BadgeCheck } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  const GENERIC_ERROR = "Something went wrong. Please try again.";
  const ACTIVE_SHOP_KEY = "vr_active_shop";

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
  interface ShopRef {
    shopId: number;
    shopName: string | null;
  }
  type ApiResult<T> =
    | { ok: true; data: T }
    | { ok: false; status: number; error: string; message: string };

  function getActiveShopId(): number | null {
    try {
      const v = Number(localStorage.getItem(ACTIVE_SHOP_KEY));
      return Number.isInteger(v) && v > 0 ? v : null;
    } catch {
      return null;
    }
  }
  function setActiveShopId(shopId: number | null): void {
    try {
      if (shopId == null) localStorage.removeItem(ACTIVE_SHOP_KEY);
      else localStorage.setItem(ACTIVE_SHOP_KEY, String(shopId));
    } catch {
      /* ignore */
    }
  }
  function withShop(path: string): string {
    const id = getActiveShopId();
    if (id == null) return path;
    return path + (path.includes("?") ? "&" : "?") + `shopId=${id}`;
  }

  async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
    let res: Response;
    try {
      res = await fetch(`/api/my-shop${withShop(path)}`, {
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
  let error = $state<string | null>(null);
  let shops = $state<ShopRef[]>([]);
  let activeShop = $state<number | null>(null);

  const loadOverview = async () => {
    loaded = false;
    error = null;
    const res = await getShopOverview();
    if (res.ok) {
      data = res.data;
      connected = true;
    } else if (res.status === 404) {
      connected = false;
    } else if (res.status !== 401) {
      error = res.message;
    }
    loaded = true;
  };

  const onShopChange = async (id: number) => {
    activeShop = id;
    setActiveShopId(id);
    await loadOverview();
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
    activeShop = getActiveShopId();
    loadOverview();
  });
</script>

<ToolPageLayout
  title="My Shop"
  prefix="Etsy"
  description="Your real numbers, straight from Etsy — the sales, orders, and bestsellers from your connected shop. No estimates here."
  icon={Store}
>
  {#if shops.length > 1}
    <div class="flex items-center gap-2.5 mb-6">
      <label for="shop-select" class="text-sm text-text-secondary shrink-0">Shop</label>
      <select
        id="shop-select"
        value={activeShop}
        onchange={(e) => onShopChange(Number(e.currentTarget.value))}
        class="field !py-2 !text-sm appearance-none cursor-pointer max-w-xs"
      >
        {#each shops as s}
          <option value={s.shopId}>{s.shopName ?? `Shop #${s.shopId}`}</option>
        {/each}
      </select>
    </div>
  {/if}

  {#if !loaded}
    <div class="flex items-center gap-2 text-text-muted text-sm">
      <LoaderCircle size={15} class="animate-spin" /> Loading your shop…
    </div>
  {:else if !connected}
    <div class="max-w-md mx-auto text-center py-12 animate-fade-in">
      <div class="w-12 h-12 rounded-xl bg-teal/8 text-teal flex items-center justify-center mx-auto mb-4">
        <Plug size={22} />
      </div>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-2">Connect your Etsy shop</h2>
      <p class="lead text-sm mb-6">
        Link your shop once and this page shows your real sales, orders, and top listings — read-only and private.
      </p>
      <a href="/settings/connections" class="btn btn-primary">
        Connect shop <ArrowRight size={15} />
      </a>
    </div>
  {:else if error}
    <p class="text-sm text-danger">{error}</p>
  {:else if data}
    <div class="animate-fade-in">
      <div class="flex items-center gap-2 mb-6">
        <span class="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold px-2 py-1 rounded-full bg-success/10 text-success">
          <BadgeCheck size={13} /> Real data
        </span>
        {#if data.calibrated}
          <span
            class="inline-flex items-center gap-1.5 text-[0.75rem] font-medium px-2 py-1 rounded-full bg-teal/8 text-teal"
            title="Sales estimates across VieRank are calibrated using real review rates from connected shops."
          >Estimates calibrated</span>
        {/if}
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
