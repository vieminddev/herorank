<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import {
    PencilLine,
    LoaderCircle,
    CircleAlert,
    Check,
    X,
    Lock,
    History,
    RotateCcw,
    Plus,
  } from "lucide-svelte";
  import { goto } from "$app/navigation";

  interface OwnListing {
    listingId: number;
    title: string;
    description: string;
    tags: string[];
    state: string | null;
    url: string | null;
  }
  type Backup = { id: number; created_at: number };
  interface LoadResult {
    listing: OwnListing;
    writeEnabled: boolean;
    backups: Backup[];
  }

  const GENERIC_ERROR = "Something went wrong. Please try again.";

  let idInput = $state("");

  let loading = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let notConnected = $state(false);
  let writePending = $state(false);
  let saved = $state(false);

  let listingId = $state<number | null>(null);
  let listingUrl = $state<string | null>(null);
  let writeEnabled = $state(false);
  let backups = $state<Backup[]>([]);

  // Editable fields
  let title = $state("");
  let description = $state("");
  let tags = $state<string[]>([]);
  let tagDraft = $state("");

  /** Extract a numeric Etsy listing id from a raw URL or bare id. */
  const parseListingId = (raw: string): number | null => {
    const trimmed = raw.trim();
    const m = trimmed.match(/listing\/(\d+)/i) ?? trimmed.match(/(\d{6,})/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isInteger(n) ? n : null;
  };

  async function api<T>(path: string, init?: RequestInit): Promise<
    { ok: true; data: T } | { ok: false; status: number; error: string; message: string }
  > {
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

  const resetState = () => {
    error = null;
    notConnected = false;
    writePending = false;
    saved = false;
  };

  const applyListing = (data: LoadResult) => {
    listingId = data.listing.listingId;
    listingUrl = data.listing.url;
    title = data.listing.title;
    description = data.listing.description;
    tags = [...data.listing.tags];
    writeEnabled = data.writeEnabled;
    backups = data.backups ?? [];
  };

  const handleLoad = async (e: Event) => {
    e.preventDefault();
    if (!idInput.trim() || loading) return;
    resetState();
    const id = parseListingId(idInput);
    if (id == null) {
      error = "That doesn't look like an Etsy listing URL or ID. Double-check and try again.";
      return;
    }
    loading = true;
    const res = await api<LoadResult>(`/listing/${id}`);
    if (res.ok) {
      applyListing(res.data);
    } else if (res.status === 404 && res.error === "NOT_CONNECTED") {
      notConnected = true;
      listingId = null;
    } else if (res.status === 404) {
      error = "That listing isn't in your connected shop. You can only edit your own listings.";
      listingId = null;
    } else {
      error = res.message;
      listingId = null;
    }
    loading = false;
  };

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t || tags.includes(t) || tags.length >= 13) {
      tagDraft = "";
      return;
    }
    tags = [...tags, t];
    tagDraft = "";
  };

  const removeTag = (t: string) => {
    tags = tags.filter((x) => x !== t);
  };

  const onTagKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  const handleSave = async () => {
    if (listingId == null || saving) return;
    resetState();
    saving = true;
    const res = await api<{ ok: true; listingId: number }>(`/listing/${listingId}/update`, {
      method: "POST",
      body: JSON.stringify({ title: title.trim(), description, tags }),
    });
    if (res.ok) {
      saved = true;
      // Refresh to pick up the new backup snapshot.
      const reload = await api<LoadResult>(`/listing/${listingId}`);
      if (reload.ok) applyListing(reload.data);
      setTimeout(() => (saved = false), 3000);
    } else if (res.status === 503 && res.error === "WRITE_PENDING_APPROVAL") {
      writePending = true;
      error = res.message;
    } else {
      error = res.message;
    }
    saving = false;
  };

  const handleRestore = async (backupId: number) => {
    if (listingId == null || saving) return;
    resetState();
    saving = true;
    const res = await api<{ ok: true }>(`/listing/${listingId}/restore`, {
      method: "POST",
      body: JSON.stringify({ backupId }),
    });
    if (res.ok) {
      const reload = await api<LoadResult>(`/listing/${listingId}`);
      if (reload.ok) applyListing(reload.data);
      saved = true;
      setTimeout(() => (saved = false), 3000);
    } else if (res.status === 503 && res.error === "WRITE_PENDING_APPROVAL") {
      writePending = true;
      error = res.message;
    } else {
      error = res.message;
    }
    saving = false;
  };

  const fmtDate = (epochSec: number) =>
    new Date(epochSec * 1000).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
</script>

<ToolPageLayout
  title="Listing Editor"
  prefix="Etsy"
  description="Edit a listing's title, tags, and description right here, then push the changes straight to Etsy. Every save is backed up so you can roll back any time."
  icon={PencilLine}
>
  {#snippet controls()}
    <form onsubmit={handleLoad}>
      <label for="le-id" class="field-label">Listing URL or ID</label>
      <input id="le-id" bind:value={idInput} placeholder="etsy.com/listing/123456789/…" class="field" />
      <button type="submit" disabled={loading || !idInput.trim()} class="btn btn-primary w-full justify-center mt-4">
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Loading…{:else}Load listing{/if}
      </button>
      <p class="field-hint">Must be a listing in your own connected shop.</p>
    </form>

    {#if listingId != null && backups.length > 0}
      <div class="mt-6 pt-4 border-t border-border-light">
        <p class="section-kicker mb-2 flex items-center gap-1.5"><History size={12} /> Backups</p>
        <ul class="space-y-1.5">
          {#each backups as b}
            <li class="flex items-center justify-between gap-2 text-[0.8125rem]">
              <span class="text-text-muted tabular-nums">{fmtDate(b.created_at)}</span>
              <button
                type="button"
                onclick={() => handleRestore(b.id)}
                disabled={saving || !writeEnabled}
                class="copy-link disabled:opacity-50"
              >
                <RotateCcw size={11} /> Restore
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/snippet}

  {#if error && !writePending}
    <div class="mb-7 flex items-start gap-3 animate-fade-in" role="alert">
      <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="text-sm text-text-primary">{error}</p>
      </div>
    </div>
  {/if}

  {#if notConnected}
    <ToolEmpty icon={PencilLine} title="Connect your Etsy shop first" hint="The Listing Editor works on your own shop. Connect your Etsy account, then paste one of your listing URLs to start editing.">
    </ToolEmpty>
  {:else if listingId != null}
    <div class="animate-fade-in">
      {#if writePending}
        <div class="mb-6 flex items-start gap-3 p-4 rounded-lg border border-warning/40 bg-warning/5">
          <Lock size={18} class="text-warning flex-shrink-0 mt-0.5" />
          <div class="flex-1">
            <p class="text-sm font-medium text-text-primary">Editing is awaiting Etsy approval</p>
            <p class="text-sm text-text-secondary mt-0.5">{error}</p>
          </div>
        </div>
      {:else if !writeEnabled}
        <div class="mb-6 flex items-start gap-3 p-4 rounded-lg border border-warning/40 bg-warning/5">
          <Lock size={18} class="text-warning flex-shrink-0 mt-0.5" />
          <div class="flex-1">
            <p class="text-sm font-medium text-text-primary">Read-only for now</p>
            <p class="text-sm text-text-secondary mt-0.5">
              You can review your listing here, but saving back to Etsy is awaiting write-access approval. It will switch on automatically once granted.
            </p>
          </div>
        </div>
      {/if}

      {#if saved}
        <div class="mb-6 flex items-center gap-2 text-sm text-success animate-fade-in">
          <Check size={16} /> Saved and pushed to Etsy.
        </div>
      {/if}

      <p class="section-kicker mb-1">Editing listing #{listingId}</p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-5">Make your changes, then save</h2>

      <label for="le-title" class="field-label">Title</label>
      <input id="le-title" bind:value={title} class="field" maxlength="140" disabled={!writeEnabled} />
      <p class="field-hint tabular-nums">{title.length}/140</p>

      <label for="le-tags" class="field-label mt-5">Tags <span class="text-text-muted font-normal">({tags.length}/13)</span></label>
      <div class="flex flex-wrap gap-2 mb-2">
        {#each tags as tag}
          <span class="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border border-border text-text-secondary">
            {tag}
            {#if writeEnabled}
              <button type="button" onclick={() => removeTag(tag)} class="text-text-muted hover:text-danger" aria-label="Remove {tag}">
                <X size={12} />
              </button>
            {/if}
          </span>
        {/each}
      </div>
      {#if writeEnabled && tags.length < 13}
        <div class="flex gap-2">
          <input
            id="le-tags"
            bind:value={tagDraft}
            onkeydown={onTagKeydown}
            placeholder="Add a tag and press Enter"
            class="field flex-1"
            maxlength="20"
          />
          <button type="button" onclick={addTag} class="btn btn-secondary shrink-0"><Plus size={15} /> Add</button>
        </div>
      {/if}

      <label for="le-desc" class="field-label mt-5">Description</label>
      <textarea id="le-desc" bind:value={description} rows={10} class="field resize-none" maxlength="20000" disabled={!writeEnabled}></textarea>

      <div class="flex items-center gap-3 mt-5">
        <button type="button" onclick={handleSave} disabled={saving || !writeEnabled || !title.trim()} class="btn btn-primary">
          {#if saving}<LoaderCircle size={14} class="animate-spin" /> Saving…{:else}Save to Etsy{/if}
        </button>
        {#if listingUrl}
          <a href={listingUrl} target="_blank" rel="noopener noreferrer" class="copy-link">View on Etsy</a>
        {/if}
      </div>
    </div>
  {:else if !error}
    <ToolEmpty
      icon={PencilLine}
      title="Load a listing to edit"
      hint="Paste one of your own Etsy listing URLs on the left. You'll be able to edit the title, tags, and description — with automatic backups."
    />
  {/if}
</ToolPageLayout>
