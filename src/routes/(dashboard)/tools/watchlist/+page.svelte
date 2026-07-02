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
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Eye, LoaderCircle, Plus, Trash2, ArrowRight, CircleAlert, Pencil, Check, X } from "lucide-svelte";
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
  let noteInput = $state("");
  let loaded = $state(false);
  let error = $state<string | null>(null);
  let shops = $state<WatchedShop[]>([]);

  let adding = $state(false);
  let addError = $state<string | null>(null);
  let removing = $state<number | null>(null);
  let removeError = $state<string | null>(null);

  // Inline per-shop note editing. `editingId` is the row open for editing; `noteDraft` holds
  // the in-progress text; `savingNote` blocks double-submits while the PATCH-via-POST is in flight.
  let editingId = $state<number | null>(null);
  let noteDraft = $state("");
  let savingNote = $state(false);
  let noteError = $state<string | null>(null);

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

  // POST /api/watchlist is idempotent on (user, shop) via `ON CONFLICT DO UPDATE SET note`, so
  // re-posting an already-watched shop UPSERTS its note. Used for new shops; note edits on
  // existing rows go through saveNote (same endpoint), and a reload reflects the saved note.
  const add = async (e: SubmitEvent) => {
    e.preventDefault();
    const shop = input.trim();
    if (!shop || adding) return;
    adding = true;
    addError = null;
    const note = noteInput.trim();

    let res: Response;
    try {
      res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shop, ...(note ? { note } : {}) }),
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
    noteInput = "";
    await load();
    adding = false;
  };

  const startEdit = (shop: WatchedShop) => {
    editingId = shop.id;
    noteDraft = shop.note ?? "";
    noteError = null;
  };

  const cancelEdit = () => {
    editingId = null;
    noteDraft = "";
    noteError = null;
  };

  // Persist a note edit. The POST endpoint upserts on (user, shop); since the row already
  // exists, the note is updated server-side. We optimistically reflect it, then reload.
  const saveNote = async (shop: WatchedShop) => {
    if (savingNote) return;
    savingNote = true;
    noteError = null;
    const note = noteDraft.trim();

    let res: Response;
    try {
      res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shop: shop.shop_name, note }),
      });
    } catch {
      noteError = GENERIC_ERROR;
      savingNote = false;
      return;
    }
    if (await handleAuth(res.status)) return;
    if (!res.ok) {
      let body: any = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      noteError = typeof body?.message === "string" ? body.message : GENERIC_ERROR;
      savingNote = false;
      return;
    }
    editingId = null;
    noteDraft = "";
    savingNote = false;
    await load();
  };

  const remove = async (shop: WatchedShop) => {
    if (removing !== null) return;
    removing = shop.id;
    removeError = null;
    let res: Response;
    try {
      res = await fetch(`/api/watchlist/${shop.id}`, { method: "DELETE" });
    } catch {
      removeError = `Couldn't remove ${shop.shop_name}. Please try again.`;
      removing = null;
      return;
    }
    if (await handleAuth(res.status)) return;
    if (res.ok) {
      shops = shops.filter((s) => s.id !== shop.id);
    } else {
      let body: any = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      removeError = typeof body?.message === "string" ? body.message : `Couldn't remove ${shop.shop_name}. Please try again.`;
    }
    removing = null;
  };

  const analyzeHref = (shopName: string) =>
    `/tools/shop-analyzer?shop=${encodeURIComponent(shopName)}`;

  onMount(load);
</script>

<ToolPageLayout
  title="Watchlist"
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
      <label for="wl-note" class="field-label mt-3">Note <span class="text-text-muted font-normal">(optional)</span></label>
      <input id="wl-note" bind:value={noteInput} maxlength="300" placeholder="Why you're watching — e.g. great tag strategy" class="field" />
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
    <ToolEmpty
      icon={Eye}
      title="Nothing on your watchlist yet"
      hint="Add a competitor or inspiration shop on the left, jot a note, and jump into Shop Research for any of them in one click."
    >
      {#snippet preview()}
        <div class="space-y-2.5">
          {#each [{ n: "CaitlynMinimalist", note: "Pricing benchmark" }, { n: "ModParty", note: "Bundle ideas" }] as ex (ex.n)}
            <div class="flex items-center justify-between">
              <div class="min-w-0">
                <p class="text-sm font-medium text-text-primary truncate">{ex.n}</p>
                <p class="entry-meta">{ex.note}</p>
              </div>
              <span class="copy-link shrink-0">Analyze <ArrowRight size={11} /></span>
            </div>
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {:else}
    {#if removeError}
      <p class="mb-4 flex items-start gap-1.5 text-sm text-danger" role="alert">
        <CircleAlert size={14} class="flex-shrink-0 mt-0.5" /> {removeError}
      </p>
    {/if}
    <div class="entry-list entry-list--divided animate-fade-in">
      {#each shops as shop (shop.id)}
        <div class="entry hover-lift flex-col items-stretch !gap-0">
          <div class="flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-[0.9375rem] text-text-primary truncate">{shop.shop_name}</p>
              <p class="entry-meta mt-0.5">Added {fmtDate(shop.created_at)}</p>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <a href={analyzeHref(shop.shop_name)} class="copy-link">
                Analyze <ArrowRight size={13} />
              </a>
              <button
                type="button"
                onclick={() => startEdit(shop)}
                disabled={editingId === shop.id}
                class="text-text-muted hover:text-teal transition-colors disabled:opacity-50"
                aria-label="Edit note"
                title="Edit note"
              >
                <Pencil size={15} />
              </button>
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

          {#if editingId === shop.id}
            <div class="mt-2.5 flex items-center gap-2">
              <input
                bind:value={noteDraft}
                maxlength="300"
                placeholder="Add a note about this shop"
                class="field flex-1 !py-1.5 text-sm"
                aria-label="Note"
              />
              <button
                type="button"
                onclick={() => saveNote(shop)}
                disabled={savingNote}
                class="btn btn-primary px-2.5 py-1.5 shrink-0"
                aria-label="Save note"
                title="Save"
              >
                {#if savingNote}<LoaderCircle size={14} class="animate-spin" />{:else}<Check size={14} />{/if}
              </button>
              <button
                type="button"
                onclick={cancelEdit}
                disabled={savingNote}
                class="btn btn-secondary px-2.5 py-1.5 shrink-0"
                aria-label="Cancel"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
            {#if noteError}
              <p class="mt-1.5 flex items-start gap-1.5 text-xs text-danger" role="alert">
                <CircleAlert size={12} class="flex-shrink-0 mt-0.5" /> {noteError}
              </p>
            {/if}
          {:else if shop.note}
            <!-- Per-shop signal: the note you saved, surfaced as a tinted chip. -->
            <p class="mt-2 inline-flex w-fit items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-text-secondary bg-tint">
              {shop.note}
            </p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</ToolPageLayout>
