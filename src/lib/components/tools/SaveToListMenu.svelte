<script lang="ts">
  /**
   * Save-to-list control shared by the keyword tools (keyword-generator, keyword-bulk).
   *
   * Given a set of keyword items (with optional AI-estimated metrics), this dropdown lets the
   * seller drop them into one of their Keyword Lists — picking an existing list or creating a
   * new one inline — by POSTing to the owner-scoped `/api/collections` endpoints. Metrics are
   * forwarded so the list's columns populate (volume → resultCount + demandScore, plus
   * competition). Purely additive: it owns no page state and only talks to the collections API.
   */
  import { BookmarkPlus, Plus, Check, LoaderCircle, CircleAlert, X } from "lucide-svelte";

  type Level = "low" | "medium" | "high";
  export type SaveItem = {
    keyword: string;
    /** AI-estimated search volume; stored as both demandScore and resultCount so columns fill. */
    volume?: number;
    competition?: Level;
  };
  type ListSummary = { id: number; name: string; item_count: number };

  let { items, label = "Save to list", disabled = false }: {
    items: SaveItem[];
    label?: string;
    disabled?: boolean;
  } = $props();

  let open = $state(false);
  let lists = $state<ListSummary[]>([]);
  let loadingLists = $state(false);
  let saving = $state(false);
  let newName = $state("");
  let creating = $state(false);
  let error = $state<string | null>(null);
  let done = $state<string | null>(null); // success message after a save
  let doneTimer: ReturnType<typeof setTimeout> | undefined;

  const api = (path: string, init?: RequestInit) =>
    fetch(`/api/collections${path}`, { credentials: "same-origin", ...init });

  const errMessage = async (res: Response, fallback: string) => {
    try {
      const body = (await res.json()) as { message?: string };
      return typeof body?.message === "string" && body.message ? body.message : fallback;
    } catch {
      return fallback;
    }
  };

  // Backend caps additions at 50 items per call (collections itemsSchema).
  const payload = $derived(
    items.slice(0, 50).map((i) => ({
      keyword: i.keyword,
      demandScore: typeof i.volume === "number" ? Math.round(i.volume) : null,
      resultCount: typeof i.volume === "number" ? Math.round(i.volume) : null,
      competition: i.competition ?? null,
    })),
  );

  const toggle = async () => {
    if (disabled) return;
    open = !open;
    error = null;
    if (open && !lists.length) await loadLists();
  };

  const loadLists = async () => {
    loadingLists = true;
    try {
      const res = await api("");
      if (res.ok) {
        const body = (await res.json()) as { lists?: ListSummary[] };
        lists = body.lists ?? [];
      } else {
        error = await errMessage(res, "Couldn't load your lists.");
      }
    } catch {
      error = "Couldn't load your lists.";
    }
    loadingLists = false;
  };

  const flashDone = (text: string) => {
    done = text;
    clearTimeout(doneTimer);
    doneTimer = setTimeout(() => (done = null), 3000);
  };

  const saveToList = async (listId: number, listName: string) => {
    if (saving || !payload.length) return;
    saving = true;
    error = null;
    try {
      const res = await api(`/${listId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      if (!res.ok) {
        error = await errMessage(res, "Couldn't save those keywords. Please try again.");
        return;
      }
      const body = (await res.json()) as { added?: number };
      const added = body.added ?? 0;
      flashDone(
        added > 0
          ? `Saved ${added} keyword${added === 1 ? "" : "s"} to ${listName}.`
          : `Already in ${listName} — nothing new to add.`,
      );
      open = false;
      void loadLists();
    } catch {
      error = "Couldn't save those keywords. Please try again.";
    }
    saving = false;
  };

  const createAndSave = async (e: SubmitEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || saving) return;
    saving = true;
    error = null;
    try {
      const res = await api("", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        error = await errMessage(res, "Couldn't create that list. Please try again.");
        saving = false;
        return;
      }
      const body = (await res.json()) as { list?: { id: number; name: string } };
      newName = "";
      creating = false;
      if (body.list) {
        await saveToList(body.list.id, body.list.name);
      } else {
        saving = false;
      }
    } catch {
      error = "Couldn't create that list. Please try again.";
      saving = false;
    }
  };
</script>

<div class="relative inline-block text-left">
  <button
    type="button"
    class="copy-link disabled:opacity-40 disabled:cursor-not-allowed"
    onclick={toggle}
    {disabled}
    aria-haspopup="menu"
    aria-expanded={open}
  >
    {#if saving}
      <LoaderCircle size={13} class="animate-spin" /> Saving…
    {:else if done}
      <Check size={13} class="text-success" /> {done}
    {:else}
      <BookmarkPlus size={13} /> {label}{items.length ? ` (${Math.min(items.length, 50)})` : ""}
    {/if}
  </button>

  {#if open}
    <!-- Click-away backdrop -->
    <button
      type="button"
      class="fixed inset-0 z-10 cursor-default"
      aria-label="Close menu"
      onclick={() => (open = false)}
    ></button>
    <div
      class="absolute right-0 z-20 mt-2 w-64 card !p-2 shadow-lg animate-fade-in"
      role="menu"
    >
      <div class="flex items-center justify-between px-2 py-1.5">
        <p class="section-kicker !mb-0">Save to</p>
        <button type="button" class="copy-link" onclick={() => (open = false)} aria-label="Close"><X size={13} /></button>
      </div>

      {#if error}
        <p class="flex items-start gap-1.5 px-2 py-1.5 text-[0.8125rem] text-danger">
          <CircleAlert size={14} class="flex-shrink-0 mt-0.5" />{error}
        </p>
      {/if}

      {#if loadingLists}
        <p class="flex items-center gap-2 px-2 py-2 text-sm text-text-muted">
          <LoaderCircle size={14} class="animate-spin" /> Loading lists…
        </p>
      {:else}
        <div class="max-h-52 overflow-y-auto">
          {#each lists as l (l.id)}
            <button
              type="button"
              role="menuitem"
              class="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-md text-left text-sm hover:bg-bg-tint disabled:opacity-50"
              onclick={() => saveToList(l.id, l.name)}
              disabled={saving}
            >
              <span class="truncate text-text-primary">{l.name}</span>
              <span class="text-[0.75rem] text-text-muted tabular-nums shrink-0">{l.item_count}</span>
            </button>
          {/each}
          {#if !lists.length}
            <p class="px-2 py-2 text-[0.8125rem] text-text-muted">No lists yet — create one below.</p>
          {/if}
        </div>

        <div class="border-t border-border-light mt-1 pt-1">
          {#if creating}
            <form onsubmit={createAndSave} class="flex gap-1.5 p-1">
              <!-- svelte-ignore a11y_autofocus -->
              <input
                bind:value={newName}
                placeholder="New list name"
                class="field flex-1 !py-1.5 text-sm"
                maxlength="80"
                autofocus
              />
              <button type="submit" class="btn btn-primary px-2.5 shrink-0" disabled={!newName.trim() || saving} aria-label="Create and save">
                <Check size={14} />
              </button>
            </form>
          {:else}
            <button
              type="button"
              class="w-full flex items-center gap-2 px-2 py-2 rounded-md text-left text-sm text-teal hover:bg-bg-tint"
              onclick={() => { creating = true; error = null; }}
            >
              <Plus size={14} /> New list…
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
