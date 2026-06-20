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

  const api = (path: string, init?: RequestInit) =>
    fetch(`/api/collections${path}`, { credentials: "same-origin", ...init });

  const loadLists = async () => {
    loading = true;
    error = null;
    try {
      const res = await api("");
      const body = (await res.json()) as { lists?: ListSummary[] };
      lists = body.lists ?? [];
    } catch {
      error = "Couldn't load your lists. Please try again.";
    }
    loading = false;
  };

  onMount(loadLists);

  const createList = async (e: SubmitEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const res = await api("", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const body = (await res.json()) as { list?: ListSummary };
      newName = "";
      await loadLists();
      if (body.list) openList(body.list.id);
    }
  };

  const openList = async (id: number) => {
    detailLoading = true;
    renaming = false;
    try {
      const res = await api(`/${id}`);
      if (res.ok) {
        const body = (await res.json()) as { list: ListWithItems };
        selected = body.list;
      }
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
    if (!selected) return;
    const name = renameValue.trim();
    if (!name) return;
    const res = await api(`/${selected.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      selected = { ...selected, name };
      renaming = false;
      await loadLists();
    }
  };

  const deleteList = async () => {
    if (!selected) return;
    if (!confirm(`Delete "${selected.name}" and its keywords?`)) return;
    const res = await api(`/${selected.id}`, { method: "DELETE" });
    if (res.ok) {
      selected = null;
      await loadLists();
    }
  };

  const addKeyword = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!selected) return;
    const keyword = newKeyword.trim();
    if (!keyword) return;
    const res = await api(`/${selected.id}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ keyword }] }),
    });
    if (res.ok) {
      newKeyword = "";
      await openList(selected.id);
      await loadLists();
    }
  };

  const removeItem = async (itemId: number) => {
    if (!selected) return;
    const res = await api(`/${selected.id}/items/${itemId}`, { method: "DELETE" });
    if (res.ok) {
      await openList(selected.id);
      await loadLists();
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
            <button type="button" class="copy-link !text-danger" onclick={deleteList}><Trash2 size={13} /> Delete</button>
          </div>
        {/if}
      </div>

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
          <table class="w-full">
            <tbody>
              {#each selected.items as item (item.id)}
                <tr class="border-b border-border-light group">
                  <td class="py-2.5 text-[0.9375rem] text-text-primary">{item.keyword}</td>
                  <td class="py-2.5 text-sm text-right text-text-primary tabular-nums pr-4">
                    {item.result_count != null ? item.result_count.toLocaleString() : ""}
                  </td>
                  <td class="py-2.5">
                    {#if item.competition}<Badge level={item.competition} />{/if}
                  </td>
                  <td class="py-2.5 text-right">
                    <button
                      type="button"
                      class="copy-link !text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                      onclick={() => removeItem(item.id)}
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
    />
  {/if}
</ToolPageLayout>
