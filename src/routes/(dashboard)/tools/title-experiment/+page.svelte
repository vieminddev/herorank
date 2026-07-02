<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import RankChart from "$lib/components/ui/RankChart.svelte";
  import { FlaskConical, LoaderCircle, CircleAlert, Plus, Trash2, TrendingUp, ArrowRight } from "lucide-svelte";
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

  // Chart: history points oldest → newest (API already orders ascending). Drop null ranks.
  const chart = $derived(history.filter((p) => p.position !== null));

  // Marker overlays for the chart: a vertical line at each logged title change.
  const chartMarkers = $derived(
    experiments.map((x) => ({ date: x.changed_at, label: x.label })),
  );

  // Before/after rank delta around a marker: compare the nearest real rank point just BEFORE
  // the change to the nearest just AFTER. Lower rank number = better, so a drop in the number
  // is an improvement (returned as positive "spots gained").
  const deltaForChange = (changedAt: number): { before: number; after: number; gained: number } | null => {
    const pts = chart;
    let before: RankPoint | null = null;
    let after: RankPoint | null = null;
    for (const p of pts) {
      if (p.position == null) continue;
      if (p.capturedAt <= changedAt) before = p; // last point at/before the change
      else if (after === null) after = p; // first point after the change
    }
    if (!before || !after || before.position == null || after.position == null) return null;
    return { before: before.position, after: after.position, gained: before.position - after.position };
  };

  const fetchExperiments = async (l: string, k: string) => {
    const qs = new URLSearchParams({ listing: l, keyword: k }).toString();
    const res = await fetch(`/api/tools/experiments?${qs}`, { credentials: "same-origin" });
    if (res.status === 401) {
      window.location.href = "/auth/login";
      return;
    }
    const body = (await res.json().catch(() => null)) as { experiments?: Experiment[]; message?: string } | null;
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
    const body = (await res.json().catch(() => null)) as { experiments?: Experiment[]; message?: string } | null;
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
      const body = (await res.json().catch(() => null)) as { experiments?: Experiment[]; message?: string } | null;
      error = body?.message ?? "Could not remove that marker.";
    }
    removingId = null;
  };
</script>

<ToolPageLayout
  title="Title Experiment"
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
            Track this listing+keyword so we re-check it daily — the trend fills in over time, then your title changes show up as markers right on the chart.
          </p>
          <a href="/tools/rank-tracker" class="btn btn-primary mt-3 inline-flex w-auto">
            <TrendingUp size={14} /> Start tracking <ArrowRight size={14} />
          </a>
        </div>
      {:else}
        <RankChart
          points={chart.map((d) => ({ date: d.capturedAt, rank: d.position }))}
          markers={chartMarkers}
          ariaLabel="Rank over time for {loaded.keyword}, with title-change markers"
        />
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
        <div class="entry-list entry-list--divided">
          {#each experiments as x (x.id)}
            {@const d = deltaForChange(x.changed_at)}
            <div class="entry items-start">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-text-primary">{x.label}</p>
                {#if x.note}<p class="entry-meta mt-0.5">{x.note}</p>{/if}
                <p class="entry-meta mt-0.5">{fmtDate(x.changed_at)}</p>
                {#if d}
                  <p class="mt-1.5 text-xs font-semibold tabular-nums" style="color: {d.gained > 0 ? 'var(--success)' : d.gained < 0 ? 'var(--danger)' : 'var(--text-muted)'}">
                    #{d.before} → #{d.after}
                    {#if d.gained > 0}· up {d.gained} {d.gained === 1 ? 'spot' : 'spots'}{:else if d.gained < 0}· down {Math.abs(d.gained)} {Math.abs(d.gained) === 1 ? 'spot' : 'spots'}{:else}· no change{/if}
                  </p>
                {:else}
                  <p class="mt-1.5 text-xs text-text-muted italic">Not enough history around this change yet.</p>
                {/if}
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
      hint="Works on a listing you're already tracking in Rank Tracker (so there's rank history to chart). Load it on the left, then log when you changed the title to see the before-and-after."
    >
      {#snippet preview()}
        <p class="section-kicker !mb-2">personalized necklace · rank over time</p>
        <div class="flex items-end gap-2 h-24 mb-3">
          {#each [12, 11, 9, 6, 4] as rank, i (i)}
            <div class="flex-1 flex flex-col items-center gap-1">
              <span class="text-[10px] font-semibold tabular-nums text-text-primary">#{rank}</span>
              <div class="w-full rounded-t" style="height: {((15 - rank) / 15) * 100}%; background: var(--teal); opacity: {0.5 + (i / 5) * 0.5}"></div>
            </div>
          {/each}
        </div>
        <p class="text-[0.8125rem] text-text-secondary">Moved keyword to the front · Jun 3</p>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>
