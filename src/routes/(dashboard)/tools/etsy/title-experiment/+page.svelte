<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { FlaskConical, LoaderCircle, CircleAlert, Plus, Trash2 } from "lucide-svelte";
  import { getRankHistory, type RankPoint } from "$lib/tools-client";

  // A logged title change (journal entry) from GET /api/tools/experiments.
  interface Experiment {
    id: number;
    label: string;
    note: string | null;
    changed_at: number;
  }

  let listing = $state("");
  let keyword = $state("");

  // The (listing, keyword) currently loaded into the work surface.
  let loaded = $state<{ listing: string; keyword: string } | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  let history = $state<RankPoint[]>([]);
  let experiments = $state<Experiment[]>([]);

  // Add-a-marker form (shown once a listing+keyword is loaded).
  let label = $state("");
  let note = $state("");
  let savingMarker = $state(false);
  let removingId = $state<number | null>(null);

  const fmtDate = (epochSec: number): string =>
    new Date(epochSec * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // Chart bounds: history points oldest → newest (API already orders ascending).
  const maxRank = 40;
  const chart = $derived(history.filter((p) => p.position !== null));

  const fetchExperiments = async (l: string, k: string) => {
    const qs = new URLSearchParams({ listing: l, keyword: k }).toString();
    const res = await fetch(`/api/tools/experiments?${qs}`, { credentials: "same-origin" });
    if (res.status === 401) {
      window.location.href = "/auth/login";
      return;
    }
    const body = await res.json().catch(() => null);
    if (res.ok) experiments = (body?.experiments ?? []) as Experiment[];
  };

  const handleLoad = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!listing.trim() || !keyword.trim() || loading) return;
    loading = true;
    error = null;

    const l = listing.trim();
    const k = keyword.trim();

    const res = await getRankHistory(l, k);
    if (res.ok) {
      history = res.data.history ?? [];
      loaded = { listing: l, keyword: k };
      await fetchExperiments(l, k);
    } else {
      error = res.message;
    }
    loading = false;
  };

  const handleAddMarker = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!loaded || !label.trim() || savingMarker) return;
    savingMarker = true;
    error = null;

    const res = await fetch("/api/tools/experiments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        listing: loaded.listing,
        keyword: loaded.keyword,
        label: label.trim(),
        note: note.trim() || undefined,
      }),
    });
    if (res.status === 401) {
      window.location.href = "/auth/login";
      return;
    }
    const body = await res.json().catch(() => null);
    if (res.ok) {
      label = "";
      note = "";
      await fetchExperiments(loaded.listing, loaded.keyword);
    } else {
      error = body?.message ?? "Could not log that change.";
    }
    savingMarker = false;
  };

  const handleDeleteMarker = async (id: number) => {
    if (removingId !== null) return;
    removingId = id;
    const res = await fetch(`/api/tools/experiments/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (res.ok) {
      experiments = experiments.filter((x) => x.id !== id);
    } else {
      const body = await res.json().catch(() => null);
      error = body?.message ?? "Could not remove that marker.";
    }
    removingId = null;
  };
</script>

<ToolPageLayout
  title="Title Experiment"
  prefix="Etsy"
  description="Changed a title to chase a keyword? Mark the date and watch what happens to your rank. See the before-and-after, in black and white."
  icon={FlaskConical}
  credits={0}
>
  {#snippet controls()}
    <form onsubmit={handleLoad}>
      <label for="te-listing" class="field-label">Listing URL or ID</label>
      <input
        id="te-listing"
        bind:value={listing}
        placeholder="etsy.com/listing/123…"
        class="field"
      />
      <label for="te-keyword" class="field-label mt-4">Keyword</label>
      <input
        id="te-keyword"
        bind:value={keyword}
        placeholder="personalized necklace"
        class="field"
      />
      <button
        type="submit"
        disabled={!listing.trim() || !keyword.trim() || loading}
        class="btn btn-primary w-full justify-center mt-4"
      >
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Loading…{:else}Load{/if}
      </button>
      <p class="field-hint">Track the listing+keyword in Rank Tracker first so history builds up.</p>
    </form>
  {/snippet}

  {#if error}
    <div class="mb-7 flex items-start gap-3 animate-fade-in" role="alert">
      <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
      <p class="text-sm text-text-primary flex-1">{error}</p>
    </div>
  {/if}

  {#if loaded}
    <div class="animate-fade-in">
      <p class="section-kicker mb-1">{loaded.keyword}</p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-5">Rank over time</h2>

      {#if chart.length < 2}
        <div class="resting">
          <p class="text-sm text-text-secondary">Not enough history yet.</p>
          <p class="text-[0.8125rem]">
            Track this listing+keyword in Rank Tracker so we re-check it daily — the trend fills in over time.
          </p>
        </div>
      {:else}
        <div class="flex items-end gap-2 h-40">
          {#each chart as d, i (i)}
            {@const rank = d.position ?? maxRank}
            {@const height = ((maxRank - Math.min(rank, maxRank)) / maxRank) * 100}
            <div class="flex-1 flex flex-col items-center gap-1">
              <span class="text-[10px] font-semibold tabular-nums text-text-primary">#{rank}</span>
              <div
                class="w-full rounded-t"
                style="height: {height}%; background: var(--teal); opacity: {0.5 + (i / chart.length) * 0.5}"
              ></div>
              <span class="text-[10px] text-text-muted">{fmtDate(d.capturedAt)}</span>
            </div>
          {/each}
        </div>
      {/if}

      <hr class="rule my-8" />

      <p class="section-kicker mb-1">Change log</p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">When you changed the title</h2>
      <p class="lead text-sm mb-5">Log each title change so you can line it up against the rank above.</p>

      <form onsubmit={handleAddMarker} class="mb-6">
        <label for="te-label" class="field-label">What changed?</label>
        <input
          id="te-label"
          bind:value={label}
          placeholder="e.g. Moved keyword to the front"
          class="field"
        />
        <label for="te-note" class="field-label mt-4">Note <span class="text-text-muted font-normal">(optional)</span></label>
        <input id="te-note" bind:value={note} placeholder="Anything worth remembering" class="field" />
        <button
          type="submit"
          disabled={!label.trim() || savingMarker}
          class="btn btn-primary mt-4"
        >
          {#if savingMarker}<LoaderCircle size={14} class="animate-spin" /> Saving…{:else}<Plus size={14} /> Log change{/if}
        </button>
      </form>

      {#if experiments.length === 0}
        <p class="text-sm text-text-muted">No changes logged yet.</p>
      {:else}
        <div class="entry-list">
          {#each experiments as x (x.id)}
            <div class="entry items-start">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-text-primary">{x.label}</p>
                {#if x.note}<p class="entry-meta mt-0.5">{x.note}</p>{/if}
                <p class="entry-meta mt-0.5">{fmtDate(x.changed_at)}</p>
              </div>
              <button
                type="button"
                onclick={() => handleDeleteMarker(x.id)}
                disabled={removingId === x.id}
                class="inline-flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50 shrink-0"
                aria-label="Delete marker"
              >
                {#if removingId === x.id}<LoaderCircle size={14} class="animate-spin" />{:else}<Trash2 size={14} />{/if}
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else if !error}
    <ToolEmpty
      icon={FlaskConical}
      title="Measure a title change"
      hint="Enter a tracked listing and keyword on the left to see its rank over time — then log when you changed the title to measure the impact."
    />
  {/if}
</ToolPageLayout>
