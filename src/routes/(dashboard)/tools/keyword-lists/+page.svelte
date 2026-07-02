<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import {
    ListChecks,
    FolderOpen,
    Plus,
    LoaderCircle,
    Copy,
    Check,
    Pencil,
    Trash2,
    X,
    CircleAlert,
  } from "lucide-svelte";
  import { onMount } from "svelte";

  type Level = "low" | "medium" | "high";
  type ListSummary = { id: number; name: string; created_at: number; item_count: number };
  type ListItem = {
    id: number;
    keyword: string;
    demand_score: number | null;
    result_count: number | null;
    competition: Level | null;
    added_at: number;
  };
  type ListWithItems = ListSummary & { items: ListItem[] };

  let lists = $state<ListSummary[]>([]);
  let newName = $state("");
  let selected = $state<ListWithItems | null>(null);
  let loading = $state(true);
  let detailLoading = $state(false);
  let error = $state<string | null>(null);

  // Inline rename + add-keyword state for the open list.
  let renaming = $state(false);
  let renameValue = $state("");
  let newKeyword = $state("");
  let copied = $state(false);

  // Transient toast for write failures (and successes worth confirming). Auto-dismisses.
  let toast = $state<{ kind: "error" | "success"; text: string } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const showToast = (kind: "error" | "success", text: string) => {
    toast = { kind, text };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 4000);
  };

  // In-flight guards so double-clicks can't fire duplicate writes.
  let busy = $state(false);
  // Inline delete confirmation (replaces native confirm()).
  let confirmingDelete = $state(false);

  const api = (path: string, init?: RequestInit) =>
    fetch(`/api/collections${path}`, { credentials: "same-origin", ...init });

  /** Pull a human message out of an error JSON body, falling back to a default. */
  const errMessage = async (res: Response, fallback: string) => {
    try {
      const body = (await res.json()) as { message?: string };
      return typeof body?.message === "string" && body.message ? body.message : fallback;
    } catch {
      return fallback;
    }
  };

  const loadLists = async () => {
    loading = true;
    error = null;
    try {
      const res = await api("");
      if (!res.ok) {
        error = "Couldn't load your lists. Please try again.";
        lists = [];
      } else {
        const body = (await res.json()) as { lists?: ListSummary[] };
        lists = body.lists ?? [];
      }
    } catch {
      error = "Couldn't load your lists. Please try again.";
    }
    loading = false;
  };

  onMount(loadLists);

  const createList = async (e: SubmitEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    busy = true;
    try {
      const res = await api("", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        showToast("error", await errMessage(res, "Couldn't create that list. Please try again."));
        return;
      }
      const body = (await res.json()) as { list?: ListSummary };
      newName = "";
      await loadLists();
      if (body.list) await openList(body.list.id);
    } catch {
      showToast("error", "Couldn't create that list. Please try again.");
    } finally {
      busy = false;
    }
  };

  const openList = async (id: number) => {
    detailLoading = true;
    renaming = false;
    confirmingDelete = false;
    try {
      const res = await api(`/${id}`);
      if (res.ok) {
        const body = (await res.json()) as { list: ListWithItems };
        selected = body.list;
      } else {
        showToast("error", await errMessage(res, "Couldn't open that list. Please try again."));
      }
    } catch {
      showToast("error", "Couldn't open that list. Please try again.");
    } finally {
      detailLoading = false;
    }
  };

  const startRename = () => {
    if (!selected) return;
    renameValue = selected.name;
    renaming = true;
  };

  const saveRename = async () => {
    if (!selected || busy) return;
    const name = renameValue.trim();
    if (!name) return;
    busy = true;
    try {
      const res = await api(`/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        showToast("error", await errMessage(res, "Couldn't rename the list. Please try again."));
        return;
      }
      selected = { ...selected, name };
      renaming = false;
      await loadLists();
    } catch {
      showToast("error", "Couldn't rename the list. Please try again.");
    } finally {
      busy = false;
    }
  };

  const deleteList = async () => {
    if (!selected || busy) return;
    busy = true;
    try {
      const res = await api(`/${selected.id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("error", await errMessage(res, "Couldn't delete the list. Please try again."));
        return;
      }
      confirmingDelete = false;
      selected = null;
      await loadLists();
    } catch {
      showToast("error", "Couldn't delete the list. Please try again.");
    } finally {
      busy = false;
    }
  };

  const addKeyword = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!selected || busy) return;
    const keyword = newKeyword.trim();
    if (!keyword) return;
    busy = true;
    try {
      const res = await api(`/${selected.id}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: [{ keyword }] }),
      });
      if (!res.ok) {
        showToast("error", await errMessage(res, "Couldn't add that keyword. Please try again."));
        return;
      }
      newKeyword = "";
      await openList(selected.id);
      await loadLists();
    } catch {
      showToast("error", "Couldn't add that keyword. Please try again.");
    } finally {
      busy = false;
    }
  };

  const removeItem = async (itemId: number) => {
    if (!selected || busy) return;
    busy = true;
    try {
      const res = await api(`/${selected.id}/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("error", await errMessage(res, "Couldn't remove that keyword. Please try again."));
        return;
      }
      await openList(selected.id);
      await loadLists();
    } catch {
      showToast("error", "Couldn't remove that keyword. Please try again.");
    } finally {
      busy = false;
    }
  };

  const copyAll = () => {
    if (!selected) return;
    navigator.clipboard.writeText(selected.items.map((i) => i.keyword).join(", "));
    copied = true;
    setTimeout(() => (copied = false), 2000);
  };
</script>

<ToolPageLayout
  title="Keyword Lists"
  description="Save the keywords worth keeping. Build lists for each product or season, then copy them straight into a listing when you're ready."
  icon={ListChecks}
>
  {#snippet controls()}
    <form onsubmit={createList}>
      <label for="kl-name" class="field-label">New list</label>
      <div class="flex gap-2">
        <input
          id="kl-name"
          bind:value={newName}
          placeholder="Holiday necklaces"
          class="field flex-1"
          maxlength="80"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          class="btn btn-primary px-3 shrink-0"
          aria-label="Create"
        >
          <Plus size={15} />
        </button>
      </div>
    </form>

    {#if lists.length}
      <p class="section-kicker mt-6 mb-2">Your lists</p>
      <div class="space-y-1">
        {#each lists as l (l.id)}
          <button
            type="button"
            onclick={() => openList(l.id)}
            class={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${selected?.id === l.id ? "bg-teal/8 text-teal" : "hover:bg-surface-2 text-text-primary"}`}
          >
            <FolderOpen size={15} class="shrink-0" />
            <span class="flex-1 text-sm truncate">{l.name}</span>
            <span class="text-[0.75rem] text-text-muted tabular-nums">{l.item_count}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/snippet}

  {#if toast}
    <div
      class="mb-5 flex items-start gap-3 p-3.5 rounded-lg border animate-fade-in {toast.kind === 'error' ? 'bg-danger/5 border-danger/20' : 'panel-tint'}"
      role="status"
    >
      {#if toast.kind === "error"}
        <CircleAlert size={16} class="text-danger flex-shrink-0 mt-0.5" />
      {:else}
        <Check size={16} class="text-success flex-shrink-0 mt-0.5" />
      {/if}
      <p class="text-sm text-text-primary flex-1">{toast.text}</p>
      <button type="button" class="copy-link shrink-0" onclick={() => (toast = null)} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center gap-2 text-text-muted text-sm">
      <LoaderCircle size={15} class="animate-spin" /> Loading…
    </div>
  {:else if error}
    <p class="text-sm text-danger">{error}</p>
  {:else if selected}
    <div class="animate-fade-in">
      <div class="flex items-start justify-between gap-4 mb-5">
        <div class="min-w-0 flex-1">
          {#if renaming}
            <div class="flex items-center gap-2">
              <input
                bind:value={renameValue}
                class="field"
                maxlength="80"
                onkeydown={(e) => e.key === "Enter" && saveRename()}
              />
              <button type="button" class="btn btn-primary px-3" onclick={saveRename} aria-label="Save">
                <Check size={15} />
              </button>
              <button type="button" class="copy-link" onclick={() => (renaming = false)} aria-label="Cancel">
                <X size={15} />
              </button>
            </div>
          {:else}
            <h2 class="text-lg font-semibold tracking-tight text-text-primary truncate">{selected.name}</h2>
            <p class="text-sm text-text-muted mt-0.5">
              {selected.items.length} keyword{selected.items.length === 1 ? "" : "s"}
            </p>
          {/if}
        </div>
        {#if !renaming}
          <div class="flex items-center gap-3 shrink-0 pt-1">
            <button type="button" class="copy-link" onclick={copyAll} disabled={!selected.items.length}>
              {#if copied}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy all{/if}
            </button>
            <button type="button" class="copy-link" onclick={startRename}><Pencil size={13} /> Rename</button>
            {#if !confirmingDelete}
              <button type="button" class="copy-link !text-danger" onclick={() => (confirmingDelete = true)}>
                <Trash2 size={13} /> Delete
              </button>
            {/if}
          </div>
        {/if}
      </div>

      {#if confirmingDelete}
        <div class="panel-tint p-3.5 mb-5 flex items-center justify-between gap-4 animate-fade-in" role="alertdialog" aria-label="Confirm delete">
          <p class="text-sm text-text-primary">
            Delete <span class="font-medium">{selected.name}</span> and its {selected.items.length} keyword{selected.items.length === 1 ? "" : "s"}? This can't be undone.
          </p>
          <div class="flex items-center gap-2 shrink-0">
            <button type="button" class="btn btn-secondary" onclick={() => (confirmingDelete = false)} disabled={busy}>Cancel</button>
            <button type="button" class="btn btn-primary !bg-danger !border-danger" onclick={deleteList} disabled={busy}>
              {#if busy}<LoaderCircle size={14} class="animate-spin" /> Deleting…{:else}Delete{/if}
            </button>
          </div>
        </div>
      {/if}

      <form onsubmit={addKeyword} class="flex gap-2 mb-6">
        <input bind:value={newKeyword} placeholder="Add a keyword" class="field flex-1" maxlength="140" />
        <button type="submit" disabled={!newKeyword.trim()} class="btn btn-primary px-3 shrink-0" aria-label="Add keyword">
          <Plus size={15} />
        </button>
      </form>

      {#if detailLoading}
        <div class="flex items-center gap-2 text-text-muted text-sm">
          <LoaderCircle size={15} class="animate-spin" /> Loading…
        </div>
      {:else if selected.items.length}
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Keyword</th>
                <th class="text-right">Results</th>
                <th>Competition</th>
                <th class="w-9"><span class="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {#each selected.items as item (item.id)}
                <tr class="group">
                  <td class="text-[0.9375rem] text-text-primary">{item.keyword}</td>
                  <td class="text-right text-text-primary tabular-nums">
                    {item.result_count != null ? item.result_count.toLocaleString() : "—"}
                  </td>
                  <td>
                    {#if item.competition}<Badge level={item.competition} />{:else}<span class="text-text-muted">—</span>{/if}
                  </td>
                  <td class="text-right">
                    <button
                      type="button"
                      class="copy-link !text-danger opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-40"
                      onclick={() => removeItem(item.id)}
                      disabled={busy}
                      aria-label="Remove keyword"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="text-sm text-text-muted">No keywords yet — add one above.</p>
      {/if}
    </div>
  {:else if lists.length}
    <ToolEmpty
      icon={FolderOpen}
      title="Pick a list to open it"
      hint="Choose a list on the left to see its keywords, or create a new one to start saving."
    />
  {:else}
    <ToolEmpty
      icon={ListChecks}
      title="Your keyword lists will appear here"
      hint="Create a list on the left, then add the keywords worth keeping. Build one per product or season and copy them into a listing when you're ready."
    >
      {#snippet preview()}
        <div class="flex items-center gap-2 mb-2">
          <FolderOpen size={15} class="text-text-muted" />
          <p class="text-[0.9375rem] font-medium text-text-primary">Holiday necklaces</p>
          <span class="text-[0.75rem] text-text-muted">3 keywords</span>
        </div>
        <table class="w-full">
          <tbody>
            {#each [{ k: "christmas necklace gift", v: 27100, c: "high" }, { k: "personalized snowflake necklace", v: 6600, c: "medium" }, { k: "stocking stuffer jewelry", v: 3200, c: "low" }] as r (r.k)}
              <tr class="border-b border-border-light">
                <td class="py-2 text-[0.9375rem] text-text-primary">{r.k}</td>
                <td class="py-2 text-sm text-right text-text-primary tabular-nums pr-4">{r.v.toLocaleString()}</td>
                <td class="py-2"><Badge level={r.c as "low" | "medium" | "high"} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>
