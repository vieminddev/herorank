<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Search, TrendingUp, LoaderCircle, CircleAlert, Bell, BellRing, Check, FileText } from "lucide-svelte";
  import { callTool, trackListing } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";

  // Plan comes from the dashboard layout data (+layout.server.ts → subscription.plan).
  // Tracking is plan-gated and FREE (BR-P4-TRACK-02): free plan cannot track, so we hide
  // the button behind an upgrade CTA instead of letting a doomed request 403.
  const plan = $derived(page.data?.subscription?.plan ?? "free");
  const canTrack = $derived(plan !== "free");

  type RankPoint = { date: string; rank: number };

  // Response shape per BA spec §4.3. `currentRank` is an ESTIMATED position (sort=score,
  // not the personalized rank a buyer sees) → null when not in top 100. `rankHistory` is
  // REAL collected history (grows over time); early on it has few points.
  interface RankResult {
    currentRank: number | null;
    bestRank: number | null;
    bestRankDate: string | null;
    delta: number | null; // spots gained since prior history point (+ = improved)
    keyword: string;
    competingListings: number;
    rankHistory: RankPoint[];
  }

  let listingUrl = $state("");
  let keyword = $state("");
  let hasSearched = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let notFound = $state(false);
  let result = $state<RankResult | null>(null);

  // --- Track this listing (Phase 4) ---
  let tracking = $state(false);
  let tracked = $state(false);
  // Soft, non-blocking notice under the Track button (limit reached / error).
  let trackNotice = $state<{ text: string; upgrade: boolean } | null>(null);

  // Chart shows history oldest -> newest. Few points early = honest "collecting data".
  const chartHistory = $derived(result ? [...result.rankHistory] : []);

  const handleSearch = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!listingUrl.trim() || !keyword.trim() || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;
    notFound = false;
    // A new search is a new listing/keyword → reset track state.
    tracked = false;
    trackNotice = null;

    const res = await callTool<RankResult>("rank-check", {
      listing: listingUrl.trim(),
      keyword: keyword.trim(),
    });

    if (res.ok) {
      result = res.data;
      hasSearched = true;
      await invalidateAll();
    } else if (res.status === 402) {
      needsUpgrade = true;
      error = res.message;
    } else if (res.status === 404) {
      notFound = true;
      result = null;
      hasSearched = true;
    } else {
      error = res.message;
    }
    loading = false;
  };

  // Track is FREE (plan feature) → no credit charge shown, no invalidateAll for credits.
  // A 403 TRACK_LIMIT means the user is at their plan's tracked-listing cap → upgrade CTA.
  const handleTrack = async () => {
    if (!result || tracking || tracked || !canTrack) return;
    tracking = true;
    trackNotice = null;

    const res = await trackListing({
      listing: listingUrl.trim(),
      keyword: keyword.trim(),
    });

    if (res.ok) {
      tracked = true;
    } else if (res.status === 403 && res.error === "TRACK_LIMIT") {
      trackNotice = {
        text: res.message || "You've reached your plan's tracked-listing limit.",
        upgrade: true,
      };
    } else if (res.status === 409) {
      // Already tracking this listing+keyword → treat as success (idempotent UX).
      tracked = true;
    } else {
      trackNotice = { text: res.message, upgrade: false };
    }
    tracking = false;
  };
</script>

<ToolPageLayout title="Search Position" description="See where your listing lands for a keyword on Etsy, and watch its spot move as you work on it. Positions are estimated.">
  {#snippet controls()}
    <form onsubmit={handleSearch}>
      <div class="space-y-4">
        <div>
          <label class="field-label" for="rank-url">Which listing?</label>
          <div class="field-wrap"><span class="field-affix"><Search size={16} /></span><input id="rank-url" type="text" bind:value={listingUrl} placeholder="e.g. 4511075902" class="field" data-testid="rank-url" /></div>
        </div>
        <div>
          <label class="field-label" for="rank-keyword">Searching for which keyword?</label>
          <div class="field-wrap"><span class="field-affix"><Search size={16} /></span><input id="rank-keyword" type="text" bind:value={keyword} placeholder="e.g. personalized necklace" class="field" data-testid="rank-keyword" /></div>
          <p class="field-hint">The exact phrase a buyer would type to find this kind of item.</p>
        </div>
      </div>
      <button type="submit" disabled={loading || !listingUrl.trim() || !keyword.trim()} class="btn btn-primary w-full justify-center mt-4" data-testid="rank-submit">
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Looking...{:else}Find your spot{/if}
      </button>
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

  {#if notFound}
    <ToolEmpty icon={FileText} title="We couldn't find that listing" hint="Check the URL or ID and try again — a full Etsy link or just the listing ID both work." />
  {/if}

  {#if hasSearched && result}
    <div class="animate-fade-in">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-5">
        <div>
          <div class="section-kicker mb-1 flex items-center gap-1.5">Current spot <EstimatedBadge label="Est." tooltip="Estimated position (Etsy sort=score) — not the personalized rank a buyer sees." /></div>
          {#if result.currentRank !== null}
            <div class="text-3xl font-semibold tracking-tight text-teal">#{result.currentRank}</div>
            {#if result.delta !== null && result.delta !== 0}
              <div class="flex items-center gap-1 mt-1 text-xs" style="color: {result.delta > 0 ? 'var(--success)' : 'var(--danger)'}">
                <TrendingUp size={12} /> {result.delta > 0 ? `Up ${result.delta}` : `Down ${Math.abs(result.delta)}`} spots
              </div>
            {/if}
          {:else}
            <div class="text-base font-semibold text-text-muted mt-1.5">Not in the top 100 yet</div>
          {/if}
        </div>
        <div>
          <div class="section-kicker mb-1">Best so far</div>
          {#if result.bestRank !== null}
            <div class="text-3xl font-semibold tracking-tight text-success">#{result.bestRank}</div>
            {#if result.bestRankDate}<div class="text-xs text-text-muted mt-1">{result.bestRankDate}</div>{/if}
          {:else}
            <div class="text-base font-semibold text-text-muted mt-1.5">—</div>
          {/if}
        </div>
        <div>
          <div class="section-kicker mb-1">Keyword</div>
          <div class="text-base font-semibold text-text-primary">{result.keyword}</div>
          <div class="text-xs text-text-muted mt-1">{result.competingListings.toLocaleString()} other listings in the running</div>
        </div>
      </div>

      <hr class="rule my-8" />

      <!-- Track this listing (Phase 4). FREE plan feature: no credit charge. The daily cron
           re-checks this keyword so the Rank History chart grows automatically over time. -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <BellRing size={16} class="text-teal flex-shrink-0" />
            <h3 class="text-base font-semibold tracking-tight text-text-primary">Keep an eye on this one</h3>
          </div>
          <p class="text-xs text-text-muted mt-1">
            We'll re-check this keyword each day and quietly fill in the history below — no credits, nothing to remember.
          </p>
        </div>

        {#if !canTrack}
          <!-- Free plan: tracking is plan-gated. Show an upgrade CTA instead of a doomed call. -->
          <a
            href="/pricing"
            class="btn btn-primary flex-shrink-0"
            title="Listing tracking is available on paid plans"
            data-testid="track-upgrade"
          >
            <Bell size={14} /> Upgrade to track
          </a>
        {:else if tracked}
          <span
            class="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-success bg-success/10"
            data-testid="track-done"
          >
            <Check size={14} /> Watching it
          </span>
        {:else}
          <button
            type="button"
            onclick={handleTrack}
            disabled={tracking}
            class="btn btn-primary flex-shrink-0"
            data-testid="track-button"
          >
            {#if tracking}<LoaderCircle size={14} class="animate-spin" /> Setting up...{:else}<Bell size={14} /> Watch this listing{/if}
          </button>
        {/if}
      </div>

      {#if trackNotice}
        <div class="mt-4 flex items-start gap-3 animate-fade-in" role="alert">
          <CircleAlert size={18} class="text-warning flex-shrink-0 mt-0.5" />
          <div class="flex-1">
            <p class="text-sm text-text-primary">{trackNotice.text}</p>
            {#if trackNotice.upgrade}
              <a href="/pricing" class="copy-link mt-2 !text-teal">Upgrade your plan →</a>
            {/if}
          </div>
        </div>
      {/if}

      <hr class="rule my-8" />

      <p class="section-kicker mb-1">Over time</p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-5">How its position has moved</h2>
      {#if chartHistory.length < 2}
        <div class="resting">
          <p class="text-sm text-text-secondary">Still collecting data.</p>
          <p class="text-[0.8125rem]">The history fills in as this keyword gets re-checked. Come back tomorrow to see the trend take shape.</p>
        </div>
      {:else}
        <div class="flex items-end gap-2 h-40">
          {#each chartHistory as d, i (i)}
            {@const maxRank = 40}
            {@const height = ((maxRank - Math.min(d.rank, maxRank)) / maxRank) * 100}
            <div class="flex-1 flex flex-col items-center gap-1">
              <span class="text-[10px] font-semibold tabular-nums text-text-primary">#{d.rank}</span>
              <div class="w-full rounded-t" style="height: {height}%; background: var(--teal); opacity: {0.5 + (i / chartHistory.length) * 0.5}"></div>
              <span class="text-[10px] text-text-muted">{d.date}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else if !error && !notFound}
    <ToolEmpty icon={TrendingUp} title="Your position will appear here" hint="Add a listing and keyword on the left, and we'll find where you land — then watch the spot move as you work on it.">
      {#snippet preview()}
        <div class="grid grid-cols-2 gap-x-8 gap-y-3">
          <div>
            <div class="section-kicker mb-1">Current spot</div>
            <div class="text-3xl font-semibold tracking-tight text-teal">#12</div>
          </div>
          <div>
            <div class="section-kicker mb-1">Best so far</div>
            <div class="text-3xl font-semibold tracking-tight text-success">#8</div>
          </div>
        </div>
        <div class="mt-5 flex items-end gap-2 h-24">
          {#each [22, 18, 15, 14, 11, 12, 8] as r, i (i)}
            {@const height = ((40 - Math.min(r, 40)) / 40) * 100}
            <div class="flex-1 rounded-t" style="height: {height}%; background: var(--teal); opacity: {0.5 + (i / 7) * 0.5}"></div>
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>
