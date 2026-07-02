<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import ScoreBar from "$lib/components/ui/ScoreBar.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
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
    ArrowRight,
    TriangleAlert,
  } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { cheer } from "$lib/mascotCheer";

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
  type Snapshot = { title: string; description: string; tags: string[] };

  const GENERIC_ERROR = "Something went wrong. Please try again.";
  const TITLE_MAX = 140;
  const TAG_MAX = 13;

  let idInput = $state("");

  let loading = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let notConnected = $state(false);
  let needsReconnect = $state(false);
  let writePending = $state(false);
  let saved = $state(false);
  // Set when a hand-off (?title / ?addTags / ?description) pre-applied a suggested change on load.
  let prefillApplied = $state(false);

  let listingId = $state<number | null>(null);
  let listingUrl = $state<string | null>(null);
  let writeEnabled = $state(false);
  let backups = $state<Backup[]>([]);

  // Editable fields
  let title = $state("");
  let description = $state("");
  let tags = $state<string[]>([]);
  let tagDraft = $state("");

  // Original (as-loaded-from-Etsy) values, for the OLD → NEW diff.
  let original = $state<Snapshot>({ title: "", description: "", tags: [] });

  // Confirmation overlays.
  let showSaveConfirm = $state(false);
  let restoreTarget = $state<{ backupId: number; createdAt: number; snapshot: Snapshot } | null>(null);
  let restorePreviewLoading = $state(false);

  let showDrawer = $state(false);
  let showBackups = $state(false);

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

  /** Map a backend write error to a clear, seller-facing message. */
  const writeErrorMessage = (
    res: { status: number; error: string; message: string }
  ): string => {
    if (res.status === 429 || res.error === "RATE_LIMIT")
      return "Etsy is rate-limiting writes right now. Wait a moment and try again.";
    if (res.error === "VALIDATION")
      return res.message || "Etsy rejected one of the fields. Check the title, tags, and description.";
    if (res.error === "NOT_FOUND")
      return "That listing is no longer in your shop, so it can't be updated.";
    if (res.error === "ETSY_UNAVAILABLE")
      return res.message || "Etsy rejected the change. Please try again.";
    return res.message || GENERIC_ERROR;
  };

  const resetState = () => {
    error = null;
    notConnected = false;
    needsReconnect = false;
    writePending = false;
    saved = false;
  };

  const applyListing = (data: LoadResult) => {
    prevScore = -1; // loading a listing should never trigger the "crossed to Strong" cheer
    listingId = data.listing.listingId;
    listingUrl = data.listing.url;
    title = data.listing.title;
    description = data.listing.description;
    tags = [...data.listing.tags];
    writeEnabled = data.writeEnabled;
    backups = data.backups ?? [];
    original = {
      title: data.listing.title,
      description: data.listing.description,
      tags: [...data.listing.tags],
    };
  };

  /** Load a listing by numeric id, mapping the connection/ownership branches. Returns true on load. */
  async function doLoad(id: number): Promise<boolean> {
    loading = true;
    const res = await api<LoadResult>(`/listing/${id}`);
    let ok = false;
    if (res.ok) {
      applyListing(res.data);
      ok = true;
    } else if (res.status === 404 && res.error === "NOT_CONNECTED") {
      notConnected = true;
      listingId = null;
    } else if (res.error === "ETSY_REAUTH") {
      needsReconnect = true;
      listingId = null;
    } else if (res.status === 404) {
      error = "That listing isn't in your connected shop. You can only edit your own listings.";
      listingId = null;
    } else {
      error = res.message;
      listingId = null;
    }
    loading = false;
    return ok;
  }

  // A hand-off may carry a prefill but no ?listing (e.g. Tag Gap sends only addTags). Hold it and
  // apply once the seller loads any listing.
  let pendingPrefill: URLSearchParams | null = null;

  const handleLoad = async (e: Event) => {
    e.preventDefault();
    if (!idInput.trim() || loading) return;
    resetState();
    prefillApplied = false;
    showSaveConfirm = false;
    restoreTarget = null;
    const id = parseListingId(idInput);
    if (id == null) {
      error = "That doesn't look like an Etsy listing URL or ID. Double-check and try again.";
      return;
    }
    const ok = await doLoad(id);
    if (ok && pendingPrefill) {
      applyPrefill(pendingPrefill);
      pendingPrefill = null;
    }
  };

  /**
   * Apply a hand-off payload onto the loaded listing: replace title/description, MERGE addTags
   * (dedup case-insensitively, cap 13). Other tools deep-link here with a suggested change so the
   * seller only has to review + save. Returns whether anything was applied.
   */
  function applyPrefill(params: URLSearchParams): void {
    let applied = false;
    const t = params.get("title");
    if (t) {
      title = t.slice(0, TITLE_MAX);
      applied = true;
    }
    const d = params.get("description");
    if (d) {
      description = d.slice(0, 20_000);
      applied = true;
    }
    const add = params.get("addTags");
    if (add) {
      for (const rawTag of add.split(",")) {
        const tag = rawTag.trim().slice(0, 20);
        if (!tag || tags.length >= TAG_MAX) continue;
        if (tags.some((x) => x.toLowerCase() === tag.toLowerCase())) continue;
        tags = [...tags, tag];
        applied = true;
      }
    }
    if (applied) prefillApplied = true;
  }

  // Hand-off entry: ?listing=<id> auto-loads; ?title/?addTags/?description pre-apply a suggestion.
  // A prefill without ?listing is held (`pendingPrefill`) and applied after the seller loads one.
  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const hasPrefill = params.has("title") || params.has("addTags") || params.has("description");
    const lid = params.get("listing");
    if (!lid) {
      if (hasPrefill) pendingPrefill = params;
      return;
    }
    const id = parseListingId(lid);
    if (id == null) {
      if (hasPrefill) pendingPrefill = params;
      return;
    }
    idInput = String(id);
    resetState();
    const ok = await doLoad(id);
    if (ok) applyPrefill(params);
    else if (hasPrefill) pendingPrefill = params;
  });

  // --- Tag editing -------------------------------------------------------
  const addTag = () => {
    const t = tagDraft.trim();
    if (!t || tags.includes(t) || tags.length >= TAG_MAX) {
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

  // --- Edit-time SEO guidance (derived) ----------------------------------
  const titleLen = $derived(title.length);
  const titleOver = $derived(titleLen > TITLE_MAX);
  const titleShort = $derived(titleLen > 0 && titleLen < 40);

  // Duplicate tag detection (case-insensitive).
  const dupTags = $derived.by(() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const t of tags) {
      const k = t.toLowerCase();
      if (seen.has(k)) dups.add(t);
      seen.add(k);
    }
    return dups;
  });

  // Keyword coverage: how many tag phrases also appear in the title (a basic SEO signal —
  // your strongest keywords should live in BOTH title and tags).
  const titleWords = $derived(new Set(title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)));
  const tagsInTitle = $derived(
    tags.filter((t) => {
      const words = t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      return words.length > 0 && words.every((w) => titleWords.has(w));
    }).length
  );
  const coverageScore = $derived(
    tags.length === 0 ? 0 : Math.round((tagsInTitle / tags.length) * 100)
  );

  // Real win: SEO coverage crosses into "Strong" (≥60) while editing → mascot cheer (once per crossing).
  let prevScore = -1;
  $effect(() => {
    const s = coverageScore;
    if (prevScore >= 0 && prevScore < 60 && s >= 60) {
      cheer({ title: "Strong SEO!", subtitle: "Your tags now cover your title — search-ready." });
    }
    prevScore = s;
  });

  // SEO tips shown while editing.
  const seoTips = $derived.by(() => {
    const tips: string[] = [];
    if (titleOver) tips.push(`Title is ${titleLen - TITLE_MAX} characters over Etsy's ${TITLE_MAX} limit.`);
    else if (titleShort) tips.push("Title is short — Etsy lets you use up to 140 characters of keywords.");
    if (tags.length < TAG_MAX) tips.push(`Use all ${TAG_MAX} tags — you have ${tags.length}. Each tag is a search hook.`);
    if (dupTags.size > 0) tips.push(`Duplicate tag${dupTags.size > 1 ? "s" : ""}: ${[...dupTags].join(", ")}.`);
    if (tags.length > 0 && tagsInTitle === 0) tips.push("None of your tags appear in the title — repeat your top keywords in both.");
    if (description.trim().length < 160) tips.push("Description is thin — buyers (and search) reward detail. Aim for a few solid sentences.");
    return tips;
  });

  // --- Diff (OLD → NEW) ---------------------------------------------------
  const titleChanged = $derived(title.trim() !== original.title.trim());
  const descChanged = $derived(description !== original.description);
  const tagsAdded = $derived(tags.filter((t) => !original.tags.includes(t)));
  const tagsRemoved = $derived(original.tags.filter((t) => !tags.includes(t)));
  const tagsChanged = $derived(tagsAdded.length > 0 || tagsRemoved.length > 0);
  const hasChanges = $derived(titleChanged || descChanged || tagsChanged);

  const canSave = $derived(
    writeEnabled && !saving && title.trim().length > 0 && !titleOver && hasChanges
  );

  const truncate = (s: string, n = 200) => (s.length > n ? s.slice(0, n) + "…" : s);

  // --- Save (with confirm diff) ------------------------------------------
  const openSaveConfirm = () => {
    if (!canSave) return;
    resetState();
    showSaveConfirm = true;
  };

  const confirmSave = async () => {
    if (listingId == null || saving) return;
    resetState();
    showSaveConfirm = false;
    saving = true;
    const res = await api<{ ok: true; listingId: number }>(`/listing/${listingId}/update`, {
      method: "POST",
      body: JSON.stringify({ title: title.trim(), description, tags }),
    });
    if (res.ok) {
      saved = true;
      cheer({ title: "Listing updated!", subtitle: "Your optimized title, tags & description are live on Etsy." });
      const reload = await api<LoadResult>(`/listing/${listingId}`);
      if (reload.ok) applyListing(reload.data);
      setTimeout(() => (saved = false), 3000);
    } else if (res.status === 503 && res.error === "WRITE_PENDING_APPROVAL") {
      writePending = true;
      error = res.message;
    } else {
      error = writeErrorMessage(res);
    }
    saving = false;
  };

  // --- Restore (with preview) --------------------------------------------
  /** Open the restore preview for a backup — fetches its snapshot values first. */
  const openRestorePreview = async (backup: Backup) => {
    if (listingId == null || saving || !writeEnabled) return;
    resetState();
    restorePreviewLoading = true;
    restoreTarget = null;
    const res = await api<{ snapshot: Snapshot }>(`/listing/${listingId}/backup/${backup.id}`);
    restorePreviewLoading = false;
    if (res.ok && res.data?.snapshot) {
      restoreTarget = { backupId: backup.id, createdAt: backup.created_at, snapshot: res.data.snapshot };
    } else {
      error = res.ok ? "Could not read that backup." : writeErrorMessage(res);
    }
  };

  const confirmRestore = async () => {
    if (listingId == null || saving || !restoreTarget) return;
    const backupId = restoreTarget.backupId;
    resetState();
    restoreTarget = null;
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
      error = writeErrorMessage(res);
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
  description="Edit a listing's title, tags, and description right here, then push the changes straight to Etsy. Every save is backed up so you can roll back any time."
  icon={PencilLine}
>
  {#if error && !writePending}
    <div class="mb-7 flex items-start gap-3 animate-fade-in" role="alert">
      <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="text-sm text-text-primary">{error}</p>
      </div>
    </div>
  {/if}

  {#if notConnected || needsReconnect}
    <ToolEmpty
      icon={PencilLine}
      title={needsReconnect ? "Reconnect your Etsy shop" : "Connect your Etsy shop first"}
      hint={needsReconnect
        ? "Your Etsy connection has expired, so we can't load your listings right now. Reconnect your shop and you'll be editing again in seconds."
        : "The Listing Editor works on your own shop. Connect your Etsy account, then paste one of your listing URLs to start editing."}
    >
      <a href="/settings/connections" class="btn btn-secondary !py-2 !px-4 text-xs font-bold inline-flex items-center gap-1.5">
        {needsReconnect ? "Reconnect your shop →" : "Connect your shop →"}
      </a>
    </ToolEmpty>
  {:else if listingId == null}
    <!-- Centered Listing Loader (DMMT & Single Column UX) -->
    <div class="card p-6 sm:p-8 bg-white border border-border rounded-xl shadow-sm max-w-md mx-auto mt-6">
      <h3 class="text-base font-semibold text-text-primary mb-2">Load your Etsy Listing</h3>
      <p class="text-xs text-text-muted mb-1">Enter a listing ID or Etsy URL from your connected shop to load and edit its metadata.</p>
      <p class="text-xs text-text-muted mb-4">Editing works on your own shop. <a href="/settings/connections" class="copy-link !text-teal">Manage shop connection →</a></p>
      <form onsubmit={handleLoad}>
        <div class="flex flex-col gap-3">
          <input id="le-id" bind:value={idInput} placeholder="e.g. 1782406284 or etsy.com/listing/..." class="field" />
          <button type="submit" disabled={loading || !idInput.trim()} class="btn btn-primary w-full justify-center">
            {#if loading}<LoaderCircle size={14} class="animate-spin" /> Loading…{:else}Load listing{/if}
          </button>
        </div>
      </form>
    </div>
  {:else}
    <div class="animate-fade-in">
      <!-- Action Bar (Floating panel controls for single column) -->
      <div class="flex items-center justify-between gap-3 mb-6 p-3 bg-white border border-border rounded-xl shadow-sm flex-wrap">
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={() => showBackups = !showBackups}
            class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-bg-page border border-border text-text-secondary hover:text-teal hover:border-teal/40 rounded-full shadow-sm transition-colors"
          >
            <History size={12} />
            <span>Backups ({backups.length})</span>
          </button>
          
          {#if writeEnabled}
            <button
              type="button"
              onclick={() => showDrawer = !showDrawer}
              class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-teal text-white hover:bg-teal-dark rounded-full shadow-sm transition-colors"
            >
              <span>📈 Check SEO Score: {coverageScore}%</span>
            </button>
          {/if}
        </div>

        <button
          type="button"
          onclick={() => { listingId = null; idInput = ""; resetState(); }}
          class="text-xs font-medium text-text-muted hover:text-text-primary px-3 py-1"
        >
          ← Load another listing
        </button>
      </div>

      <!-- Collapsible Backups List -->
      {#if showBackups}
        <div class="mb-6 p-4 bg-white border border-border rounded-xl shadow-sm animate-fade-in">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5"><History size={13} /> Backups</h3>
            <button type="button" onclick={() => showBackups = false} class="text-text-muted hover:text-text-primary"><X size={14} /></button>
          </div>
          {#if backups.length === 0}
            <p class="text-xs text-text-muted">No backups found for this listing yet. Saving changes creates backups automatically.</p>
          {:else}
            <ul class="divide-y divide-border-light">
              {#each backups as b}
                <li class="flex items-center justify-between py-2 text-xs">
                  <span class="text-text-secondary font-medium tabular-nums">{fmtDate(b.created_at)}</span>
                  <button
                    type="button"
                    onclick={() => openRestorePreview(b)}
                    disabled={saving || !writeEnabled || restorePreviewLoading}
                    class="copy-link text-teal disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <RotateCcw size={10} /> Restore
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
          {#if !writeEnabled}
            <p class="field-hint mt-2">Restore is only available with write access.</p>
          {/if}
        </div>
      {/if}

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

      {#if prefillApplied && hasChanges && !saved}
        <div class="mb-6 flex items-start gap-3 p-3.5 rounded-lg border border-teal/40 bg-teal/5 animate-fade-in">
          <ArrowRight size={16} class="text-teal flex-shrink-0 mt-0.5" />
          <div class="flex-1">
            <p class="text-sm font-medium text-text-primary">Suggested change applied</p>
            <p class="text-[0.8125rem] text-text-secondary mt-0.5">
              We pre-filled the change from the other tool. Review it below, then <strong>Review &amp; save</strong> to push it to Etsy.
            </p>
          </div>
          <button type="button" onclick={() => (prefillApplied = false)} class="text-text-muted hover:text-text-primary shrink-0" aria-label="Dismiss"><X size={14} /></button>
        </div>
      {/if}

      <p class="section-kicker mb-1">Editing listing #{listingId}</p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-5">
        {writeEnabled ? "Make your changes, then save" : "Review your listing"}
      </h2>

      <!-- TITLE -->
      <div class="flex justify-between items-baseline mb-1">
        <label for="le-title" class="field-label !mb-0">Title</label>
        <span class="text-[0.8125rem] tabular-nums {titleOver ? 'text-danger font-semibold' : 'text-text-muted'}">
          {titleLen}/{TITLE_MAX}
        </span>
      </div>
      <input id="le-title" bind:value={title} class="field" disabled={!writeEnabled} />
      {#if titleOver}
        <p class="mt-1.5 flex items-center gap-1.5 text-[0.8125rem] text-danger">
          <TriangleAlert size={13} /> Over the {TITLE_MAX}-character limit — Etsy will reject this.
        </p>
      {:else if titleShort}
        <p class="mt-1.5 text-[0.8125rem] text-text-muted">
          Plenty of room left — add more keyword-rich detail to rank for more searches.
        </p>
      {/if}

      <!-- TAGS -->
      <label for="le-tags" class="field-label mt-5">
        Tags
        <span class="font-normal {tags.length === TAG_MAX ? 'text-teal' : 'text-text-muted'}">({tags.length}/{TAG_MAX})</span>
      </label>
      <div class="flex flex-wrap gap-2 mb-2">
        {#each tags as tag}
          <span
            class="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border {dupTags.has(tag)
              ? 'border-danger/50 text-danger bg-danger/5'
              : 'border-border text-text-secondary'}"
            title={dupTags.has(tag) ? "Duplicate tag" : undefined}
          >
            {tag}
            {#if writeEnabled}
              <button type="button" onclick={() => removeTag(tag)} class="text-text-muted hover:text-danger" aria-label="Remove {tag}">
                <X size={12} />
              </button>
            {/if}
          </span>
        {/each}
        {#if tags.length === 0}
          <span class="text-sm text-text-muted">No tags yet.</span>
        {/if}
      </div>
      {#if writeEnabled && tags.length < TAG_MAX}
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

      <!-- DESCRIPTION -->
      <label for="le-desc" class="field-label mt-5">Description</label>
      <textarea id="le-desc" bind:value={description} rows={10} class="field resize-none" maxlength="20000" disabled={!writeEnabled}></textarea>

      <!-- SEO GUIDANCE Drawer is rendered globally at the layout level when toggled -->

      <!-- ACTIONS -->
      <div class="flex items-center gap-3 mt-5">
        <button type="button" onclick={openSaveConfirm} disabled={!canSave} class="btn btn-primary">
          {#if saving}<LoaderCircle size={14} class="animate-spin" /> Saving…{:else}Review &amp; save{/if}
        </button>
        {#if writeEnabled && !hasChanges}
          <span class="text-[0.8125rem] text-text-muted">No changes yet.</span>
        {/if}
        {#if listingUrl}
          <a href={listingUrl} target="_blank" rel="noopener noreferrer" class="copy-link">View on Etsy</a>
        {/if}
      </div>

      <!-- SAVE DIFF / CONFIRM -->
      {#if showSaveConfirm}
        <div class="mt-6 card-accent rounded-lg p-5 animate-fade-in">
          <p class="section-kicker mb-1">Confirm changes</p>
          <h3 class="text-base font-semibold text-text-primary mb-4">Review what gets written to Etsy</h3>

          {#if titleChanged}
            <div class="mb-4">
              <p class="field-label">Title</p>
              <p class="text-sm text-text-muted line-through">{truncate(original.title) || "(empty)"}</p>
              <p class="text-sm text-text-primary flex items-start gap-1.5 mt-0.5">
                <ArrowRight size={14} class="text-teal mt-0.5 shrink-0" />{truncate(title.trim())}
              </p>
            </div>
          {/if}

          {#if tagsChanged}
            <div class="mb-4">
              <p class="field-label">Tags</p>
              {#if tagsRemoved.length > 0}
                <p class="text-sm text-text-muted">
                  Removed: {#each tagsRemoved as t}<span class="line-through">{t}</span>{" "}{/each}
                </p>
              {/if}
              {#if tagsAdded.length > 0}
                <p class="text-sm text-teal">Added: {tagsAdded.join(", ")}</p>
              {/if}
            </div>
          {/if}

          {#if descChanged}
            <div class="mb-4">
              <p class="field-label">Description</p>
              <p class="text-sm text-text-muted">{original.description.length} → {description.length} characters</p>
            </div>
          {/if}

          <div class="flex items-center gap-3 mt-4">
            <button type="button" onclick={confirmSave} disabled={saving} class="btn btn-primary">
              {#if saving}<LoaderCircle size={14} class="animate-spin" /> Pushing…{:else}<Check size={15} /> Push to Etsy{/if}
            </button>
            <button type="button" onclick={() => (showSaveConfirm = false)} disabled={saving} class="btn btn-secondary">Cancel</button>
          </div>
        </div>
      {/if}

      <!-- RESTORE PREVIEW / CONFIRM -->
      {#if restoreTarget}
        <div class="mt-6 card-accent rounded-lg p-5 animate-fade-in">
          <p class="section-kicker mb-1 flex items-center gap-1.5"><History size={12} /> Restore backup from {fmtDate(restoreTarget.createdAt)}</p>
          <h3 class="text-base font-semibold text-text-primary mb-4">This will overwrite the current listing with the backup below</h3>

          <div class="mb-4">
            <p class="field-label">Title</p>
            <p class="text-sm text-text-primary">{truncate(restoreTarget.snapshot.title) || "(empty)"}</p>
          </div>
          <div class="mb-4">
            <p class="field-label">Tags ({restoreTarget.snapshot.tags.length})</p>
            <p class="text-sm text-text-secondary">{restoreTarget.snapshot.tags.join(", ") || "(none)"}</p>
          </div>
          <div class="mb-4">
            <p class="field-label">Description</p>
            <p class="text-sm text-text-secondary">{truncate(restoreTarget.snapshot.description) || "(empty)"}</p>
          </div>

          <div class="flex items-center gap-3 mt-4">
            <button type="button" onclick={confirmRestore} disabled={saving} class="btn btn-primary">
              {#if saving}<LoaderCircle size={14} class="animate-spin" /> Restoring…{:else}<RotateCcw size={15} /> Restore this version{/if}
            </button>
            <button type="button" onclick={() => (restoreTarget = null)} disabled={saving} class="btn btn-secondary">Cancel</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</ToolPageLayout>

<!-- SEO GUIDANCE Side Drawer (Single Column & DMMT) -->
{#if showDrawer}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 bg-black/40 z-50 flex justify-end animate-fade-in"
    onclick={() => showDrawer = false}
    role="presentation"
  >
    <!-- Drawer Content Box -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-[360px] max-w-full h-full bg-white shadow-2xl p-6 overflow-y-auto flex flex-col drawer-slide-transition transform translate-x-0"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="SEO Guidance"
    >
      <div class="flex justify-between items-center border-b border-border-light pb-4 mb-4">
        <div>
          <h3 class="text-sm font-bold text-text-primary uppercase tracking-wider">📈 SEO Score &amp; Guidance</h3>
          <p class="text-[10px] text-text-muted mt-0.5">Keyword and tag coverage analysis</p>
        </div>
        <button
          type="button"
          onclick={() => showDrawer = false}
          class="p-1 rounded-full hover:bg-bg-page text-text-muted hover:text-text-primary"
          aria-label="Close drawer"
        >
          <X size={16} />
        </button>
      </div>

      <div class="flex-1">
        <div class="mb-5 bg-bg-page border border-border p-4 rounded-xl">
          <div class="flex items-center justify-between gap-3 mb-2">
            <span class="text-xs font-semibold text-text-primary">Keyword coverage</span>
            <Badge
              level={coverageScore >= 60 ? "low" : coverageScore >= 30 ? "medium" : "high"}
              label={coverageScore >= 60 ? "Strong" : coverageScore >= 30 ? "Fair" : "Weak"}
            />
          </div>
          <ScoreBar score={coverageScore} label="Tags also in the title" />
        </div>

        <h4 class="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Suggestions</h4>
        {#if seoTips.length > 0}
          <ul class="space-y-3">
            {#each seoTips as tip}
              <li class="flex items-start gap-2.5 text-xs text-text-secondary leading-relaxed bg-warning-bg/40 border border-warning-light/30 p-3 rounded-lg">
                <span class="mt-1.5 size-1.5 rounded-full bg-warning shrink-0"></span>
                <span>{tip}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="flex items-center gap-2 p-3 bg-success-bg/40 border border-success-light/30 text-success text-xs rounded-lg">
            <Check size={14} class="shrink-0" />
            <span>Looking good — your title and tags are perfectly aligned.</span>
          </div>
        {/if}
      </div>

      <div class="border-t border-border-light pt-4 mt-6">
        <button type="button" onclick={() => showDrawer = false} class="btn btn-secondary w-full justify-center text-xs py-2">Close panel</button>
      </div>
    </div>
  </div>
{/if}
