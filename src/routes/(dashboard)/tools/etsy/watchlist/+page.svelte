<script lang="ts">
  /**
   * Watchlist — the shops you want to keep an eye on.
   *
   * GET    /api/watchlist        this user's watched shops, newest-first
   * POST   /api/watchlist        watch a shop ({ shop }) — idempotent on shop name
   * DELETE /api/watchlist/:id    unwatch
   *
   * We don't fetch anything until you open a shop in the analyzer — this is just a list.
   */
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { Eye, LoaderCircle, Plus, Trash2, ArrowRight, CircleAlert } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  const GENERIC_ERROR = "Something went wrong. Please try again.";

  interface WatchedShop {
    id: number;
    shop_name: string;
    note: string | null;
    created_at: number;
  }

  let input = $state("");
  let loaded = $state(false);
  let error = $state<string | null>(null);
  let shops = $state<WatchedShop[]>([]);

  let adding = $state(false);
  let addError = $state<string | null>(null);
  let removing = $state<number | null>(null);

  const fmtDate = (epoch: number): string =>
    new Date(epoch * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const handleAuth = async (status: number): Promise<boolean> => {
    if (status === 401) {
      await goto("/auth/login");
      return true;
    }
    return false;
  };

  const load = async () => {
    loaded = false;
    error = null;
    let res: Response;
    try {
      res = await fetch("/api/watchlist");
    } catch {
      error = GENERIC_ERROR;
      loaded = true;
      return;
    }
    if (await handleAuth(res.status)) return;
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      error = typeof body?.message === "string" ? body.message : GENERIC_ERROR;
      loaded = true;
      return;
    }
    shops = (body?.shops ?? []) as WatchedShop[];
    loaded = true;
  };

  const add = async (e: SubmitEvent) => {
    e.preventDefault();
    const shop = input.trim();
    if (!shop || adding) return;
    adding = true;
    addError = null;

    let res: Response;
    try {
      res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shop }),
      });
    } catch {
      addError = GENERIC_ERROR;
      adding = false;
      return;
    }
    if (await handleAuth(res.status)) return;
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      addError = typeof body?.message === "string" ? body.message : GENERIC_ERROR;
      adding = false;
      return;
    }
    input = "";
    await load();
    adding = false;
  };

  const remove = async (shop: WatchedShop) => {
    if (removing !== null) return;
    removing = shop.id;
    let res: Response;
    try {
      res = await fetch(`/api/watchlist/${shop.id}`, { method: "DELETE" });
    } catch {
      removing = null;
      return;
    }
    if (await handleAuth(res.status)) return;
    if (res.ok) {
      shops = shops.filter((s) => s.id !== shop.id);
    }
    removing = null;
  };

  const analyzeHref = (shopName: string) =>
    `/tools/etsy/shop-analyzer?shop=${encodeURIComponent(shopName)}`;

  onMount(load);
</script>

<ToolPageLayout
  title="Watchlist"
  prefix="Etsy"
  description="Keep an eye on the competition. Save the shops you want to watch and jump back into a fresh analysis any time."
  icon={Eye}
>
  {#snippet controls()}
    <form onsubmit={add}>
      <label for="wl-shop" class="field-label">Add a shop</label>
      <div class="flex gap-2">
        <input id="wl-shop" bind:value={input} placeholder="etsy.com/shop/ShopName" class="field flex-1" />
        <button type="submit" disabled={!input.trim() || adding} class="btn btn-primary px-3 shrink-0" aria-label="Add">
          {#if adding}<LoaderCircle size={15} class="animate-spin" />{:else}<Plus size={15} />{/if}
        </button>
      </div>
      {#if addError}
        <p class="mt-2 flex items-start gap-1.5 text-xs text-danger" role="alert">
          <CircleAlert size={13} class="flex-shrink-0 mt-0.5" /> {addError}
        </p>
      {/if}
      <p class="field-hint">Paste a shop URL or name. We don't fetch anything until you open it.</p>
    </form>
  {/snippet}

  {#if !loaded}
    <div class="flex items-center gap-2 text-text-muted text-sm">
      <LoaderCircle size={15} class="animate-spin" /> Loading…
    </div>
  {:else if error}
    <p class="text-sm text-danger">{error}</p>
  {:else if shops.length === 0}
    <p class="text-sm text-text-muted">
      No shops yet. Add one on the left to start your watchlist.
    </p>
  {:else}
    <div class="entry-list animate-fade-in">
      {#each shops as shop}
        <div class="entry">
          <div class="flex-1 min-w-0">
            <p class="text-[0.9375rem] text-text-primary truncate">{shop.shop_name}</p>
            <p class="entry-meta mt-0.5">Added {fmtDate(shop.created_at)}{shop.note ? ` · ${shop.note}` : ""}</p>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <a href={analyzeHref(shop.shop_name)} class="copy-link">
              Analyze <ArrowRight size={13} />
            </a>
            <button
              type="button"
              onclick={() => remove(shop)}
              disabled={removing === shop.id}
              class="text-text-muted hover:text-danger transition-colors disabled:opacity-50"
              aria-label="Remove"
              title="Remove"
            >
              {#if removing === shop.id}<LoaderCircle size={15} class="animate-spin" />{:else}<Trash2 size={15} />{/if}
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</ToolPageLayout>
