<script lang="ts">
  /**
   * ShopList — renders every connected Etsy shop with per-shop actions (Settings → Connections).
   *
   * Pure presentational + action-dispatch: the parent owns the data (server load) and the
   * fetch calls. This component reports intent via callbacks and reflects in-flight state via
   * the `busyShopId` prop, so only one row spins at a time.
   *
   * Honesty design system "The Honest Storefront": Starbucks-green (teal), no beige. Reuses the
   * shared .card / .btn classes. The primary/default shop carries a solid green "Default" badge.
   */
  import { Store, Unlink, Star, LoaderCircle, CircleCheck, ShieldCheck } from "lucide-svelte";
  import type { ConnectionView } from "../../../routes/(dashboard)/settings/connections/+page.server";

  let {
    shops,
    busyShopId = null,
    onMakeDefault,
    onDisconnect,
  }: {
    shops: ConnectionView[];
    busyShopId?: number | null;
    onMakeDefault: (shopId: number) => void;
    onDisconnect: (shopId: number) => void;
  } = $props();

  const fmtDate = (epoch: number | null): string => {
    if (!epoch) return "—";
    return new Date(epoch * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Etsy grants space-joined scopes (e.g. "shops_r transactions_r listings_r"). Show them as chips.
  const scopeList = (scopes: string): string[] => scopes.trim().split(/\s+/).filter(Boolean);
</script>

<div class="space-y-3">
  {#each shops as shop (shop.shopId)}
    <div
      class="card p-5 bg-white border rounded-xl shadow-sm {shop.isPrimary
        ? 'border-teal/30 ring-1 ring-teal/10'
        : 'border-border'}"
      data-testid="shop-row"
    >
      <div class="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div class="flex items-start gap-3.5 min-w-0">
          <div
            class="w-11 h-11 rounded-xl bg-teal/5 border border-teal/10 text-teal flex items-center justify-center flex-shrink-0 shadow-sm"
          >
            <Store size={20} />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-sm font-bold text-text-primary truncate">
                {shop.shopName ?? `Shop #${shop.shopId}`}
              </h2>
              {#if shop.isPrimary}
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-teal text-white"
                  data-testid="primary-badge"
                >
                  <Star size={9} /> Default
                </span>
              {:else}
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-success/10 text-success border border-success/15"
                >
                  <CircleCheck size={9} /> Linked
                </span>
              {/if}
            </div>

            <p class="text-[11px] text-text-secondary mt-1">
              Etsy shop ID {shop.shopId} · Connected {fmtDate(shop.connectedAt)} · Last calibrated
              {fmtDate(shop.lastCalibratedAt)}
            </p>

            {#if scopeList(shop.scopes).length}
              <div class="mt-2 flex items-center gap-1.5 flex-wrap">
                <ShieldCheck size={11} class="text-teal flex-shrink-0" />
                {#each scopeList(shop.scopes) as scope}
                  <span
                    class="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold text-text-secondary bg-teal/5 border border-teal/10 font-mono"
                  >
                    {scope}
                  </span>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
          {#if !shop.isPrimary}
            <button
              type="button"
              onclick={() => onMakeDefault(shop.shopId)}
              disabled={busyShopId !== null}
              class="btn btn-secondary !py-2 !px-3.5 text-xs font-semibold disabled:opacity-50 transition-colors flex-1 sm:flex-none justify-center"
              data-testid="make-default"
            >
              {#if busyShopId === shop.shopId}
                <LoaderCircle size={13} class="animate-spin" /> Saving…
              {:else}
                <Star size={13} /> Make default
              {/if}
            </button>
          {/if}
          <button
            type="button"
            onclick={() => onDisconnect(shop.shopId)}
            disabled={busyShopId !== null}
            class="btn btn-secondary !py-2 !px-3.5 text-xs font-semibold text-danger border border-danger/25 hover:bg-danger/5 disabled:opacity-50 transition-colors flex-1 sm:flex-none justify-center"
            data-testid="disconnect-shop"
          >
            {#if busyShopId === shop.shopId}
              <LoaderCircle size={13} class="animate-spin text-danger" /> Disconnecting…
            {:else}
              <Unlink size={13} /> Disconnect
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/each}
</div>
