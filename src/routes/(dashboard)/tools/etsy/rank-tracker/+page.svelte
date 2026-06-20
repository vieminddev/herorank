<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import { TrendingUp, LoaderCircle, CircleAlert, Plus, Trash2 } from "lucide-svelte";
  import { trackListing, untrackListing } from "$lib/tools-client";

  // Tracking is plan-gated and FREE (BR-P4-TRACK-02). Free plan can't track → a 403
  // TRACK_LIMIT comes back from the add call and is surfaced as an upgrade CTA below.

  // Shape from GET /api/tools/tracked-listings (routes/jobs.ts).
  interface TrackedListing {
    id: number;
    listingId: number;
    keyword: string;
    lastRank: number | null;
    lastCheckedAt: number | null;
    createdAt: number;
  }

  let listing = $state("");
  let keyword = $state("");

  let loading = $state(true); // initial list load
  let adding = $state(false);
  let listings = $state<TrackedListing[]>([]);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let removingId = $state<number | null>(null);

  const fmtDate = (epochSec: number | null): string => {
    if (!epochSec) return "—";
    return new Date(epochSec * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  const loadList = async () => {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/tools/tracked-listings", { credentials: "same-origin" });
      if (res.status === 401) {
        window.location.href = "/auth/login";
        return;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        error = body?.message ?? "Could not load your tracked listings.";
      } else {
        listings = (body?.listings ?? []) as TrackedListing[];
      }
    } catch {
      error = "Could not load your tracked listings.";
    }
    loading = false;
  };

  $effect(() => {
    loadList();
  });

  const handleAdd = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!listing.trim() || !keyword.trim() || adding) return;
    adding = true;
    error = null;
    needsUpgrade = false;

    const res = await trackListing({ listing: listing.trim(), keyword: keyword.trim() });

    if (res.ok) {
      listing = "";
      keyword = "";
      await loadList();
    } else if (res.status === 403 && res.error === "TRACK_LIMIT") {
      needsUpgrade = true;
      error = res.message;
    } else {
      error = res.message;
    }
    adding = false;
  };

  const handleRemove = async (id: number) => {
    if (removingId !== null) return;
    removingId = id;
    const res = await untrackListing(id);
    if (res.ok) {
      listings = listings.filter((l) => l.id !== id);
    } else {
      error = res.message;
    }
    removingId = null;
  };
</script>

<ToolPageLayout
  title="Rank Tracker"
  prefix="Etsy"
  description="Keep an eye on where your listings land for the searches that matter. We check the rankings for you and chart how they move over time."
  icon={TrendingUp}
  credits={0}
>
  {#snippet controls()}
    <form onsubmit={handleAdd}>
      <p class="section-kicker mb-3">Track a listing</p>
      <label for="rt-listing" class="field-label">Listing URL or ID</label>
      <input
        id="rt-listing"
        bind:value={listing}
        placeholder="etsy.com/listing/123456789/…"
        class="field"
      />
      <label for="rt-keyword" class="field-label mt-4">Keyword to watch</label>
      <input
        id="rt-keyword"
        bind:value={keyword}
        placeholder="personalized necklace"
        class="field"
      />
      <button
        type="submit"
        disabled={!listing.trim() || !keyword.trim() || adding}
        class="btn btn-primary w-full justify-center mt-4"
      >
        {#if adding}<LoaderCircle size={14} class="animate-spin" /> Adding…{:else}<Plus size={14} /> Track this{/if}
      </button>
      <p class="field-hint">
        We sweep rankings automatically and build history over time. Free to track — limits depend on your plan.
      </p>
    </form>
  {/snippet}

  {#if error}
    <div class="mb-7 flex items-start gap-3 animate-fade-in" role="alert">
      <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="text-sm text-text-primary">{error}</p>
        {#if needsUpgrade}
          <a href="/pricing" class="copy-link mt-2 !text-teal">Upgrade your plan →</a>
        {/if}
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center gap-2 text-text-muted text-sm">
      <LoaderCircle size={15} class="animate-spin" /> Loading…
    </div>
  {:else if listings.length === 0}
    <ToolEmpty
      icon={TrendingUp}
      title="Nothing tracked yet"
      hint="Add a listing and a keyword on the left, and we'll watch where it ranks — checking automatically and charting how it moves over time."
    >
      {#snippet preview()}
        <div class="space-y-3">
          {#each [{ kw: "personalized necklace", rank: 12 }, { kw: "custom name ring", rank: 28 }] as ex (ex.kw)}
            <div class="flex items-center justify-between">
              <div class="min-w-0">
                <p class="text-sm font-medium text-text-primary truncate">{ex.kw}</p>
                <p class="entry-meta">Listing 1234567890</p>
              </div>
              <span class="text-sm font-semibold text-teal tabular-nums">#{ex.rank}</span>
            </div>
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {:else}
    <div class="animate-fade-in">
      <div class="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div>
          <p class="section-kicker mb-1 inline-flex items-center gap-2">
            Tracked listings <EstimatedBadge label="Est. rank" tooltip="Estimated position (Etsy sort=score) — not the personalized rank a buyer sees." />
          </p>
          <h2 class="text-lg font-semibold tracking-tight text-text-primary">What you're watching</h2>
        </div>
      </div>
      <p class="lead text-sm mb-5">
        We re-check these automatically and build history over time. Open Search Position to see the full trend for any one.
      </p>
      <hr class="rule mb-1" />

      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border-light">
              <th class="text-left pr-4 py-3 text-xs font-medium text-text-secondary">Keyword</th>
              <th class="text-left px-4 py-3 text-xs font-medium text-text-secondary">Listing</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary">Last rank</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary">Checked</th>
              <th class="text-right pl-4 py-3 text-xs font-medium text-text-secondary"></th>
            </tr>
          </thead>
          <tbody>
            {#each listings as row (row.id)}
              <tr class="border-b border-border-light hover:bg-bg-page/50 transition-colors">
                <td class="pr-4 py-3 text-sm font-medium text-text-primary">{row.keyword}</td>
                <td class="px-4 py-3 text-sm text-text-muted tabular-nums">
                  <a
                    href="https://www.etsy.com/listing/{row.listingId}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="hover:text-teal transition-colors"
                  >
                    {row.listingId}
                  </a>
                </td>
                <td class="px-4 py-3 text-sm text-right font-semibold tabular-nums">
                  {#if row.lastRank !== null}
                    <span class="text-teal">#{row.lastRank}</span>
                  {:else}
                    <span class="text-text-muted">—</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-sm text-text-muted text-right tabular-nums">{fmtDate(row.lastCheckedAt)}</td>
                <td class="pl-4 py-3 text-right">
                  <button
                    type="button"
                    onclick={() => handleRemove(row.id)}
                    disabled={removingId === row.id}
                    class="inline-flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                    aria-label="Stop tracking"
                  >
                    {#if removingId === row.id}<LoaderCircle size={14} class="animate-spin" />{:else}<Trash2 size={14} />{/if}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</ToolPageLayout>
