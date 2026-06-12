<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { Search, Star, ShieldCheck, ShieldAlert, ShieldX } from "lucide-svelte";

  const MOCK_BUYER = {
    username: "sarah_crafts",
    memberSince: "March 2019",
    totalReviews: 47,
    avgRating: 4.8,
    riskLevel: "low",
    reviews: [
      { shop: "CaitlynMinimalist", rating: 5, text: "Beautiful necklace, arrived quickly!", date: "2 weeks ago" },
      { shop: "BeadBoat1", rating: 5, text: "Perfect beads, great selection!", date: "1 month ago" },
      { shop: "PlannerKate1", rating: 4, text: "Nice stickers but one sheet was missing.", date: "2 months ago" },
      { shop: "HandmadeByAnna", rating: 5, text: "Gorgeous earrings! Will buy again.", date: "3 months ago" },
    ],
  };

  let username = $state("");
  let hasSearched = $state(false);

  const handleSearch = (e: SubmitEvent) => {
    e.preventDefault();
    if (username.trim()) hasSearched = true;
  };
</script>

<ToolPageLayout title="Buyer Check" description="Check any Etsy buyer before fulfilling a custom or high-value order. See review history, risk signals, and account age.">
  <form onsubmit={handleSearch} class="mb-8">
    <label class="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1" for="buyer-username">Buyer username <span class="text-danger text-xs font-normal">(required)</span></label>
    <div class="flex gap-3">
      <div class="relative flex-1"><Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input id="buyer-username" type="text" bind:value={username} placeholder="e.g. sarah_crafts" class="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal bg-white" data-testid="buyer-username" /></div>
      <button type="submit" class="px-8 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90" style="background: var(--navy)" data-testid="buyer-submit">Check</button>
    </div>
  </form>
  {#if hasSearched}
    <div class="animate-fade-in space-y-4">
      <div class="card p-6">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-14 h-14 rounded-full bg-gradient-to-br from-teal/20 to-teal/10 flex items-center justify-center text-lg font-bold text-teal">{MOCK_BUYER.username.charAt(0).toUpperCase()}</div>
          <div class="flex-1"><h3 class="text-lg font-bold text-text-primary">{MOCK_BUYER.username}</h3><p class="text-xs text-text-muted">Member since {MOCK_BUYER.memberSince}</p></div>
          <div class="flex items-center gap-2 px-4 py-2 rounded-lg" style="background: {MOCK_BUYER.riskLevel === 'low' ? 'var(--success-bg)' : 'var(--danger-bg)'}">
            {#if MOCK_BUYER.riskLevel === "low"}
              <ShieldCheck size={20} class="text-success" />
            {:else if MOCK_BUYER.riskLevel === "medium"}
              <ShieldAlert size={20} class="text-warning" />
            {:else}
              <ShieldX size={20} class="text-danger" />
            {/if}
            <span class="text-sm font-semibold capitalize" style="color: {MOCK_BUYER.riskLevel === 'low' ? 'var(--success)' : 'var(--danger)'}">{MOCK_BUYER.riskLevel} Risk</span>
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="text-center p-3 bg-bg-page rounded-lg"><div class="text-2xl font-bold text-text-primary">{MOCK_BUYER.totalReviews}</div><div class="text-xs text-text-muted">Total Reviews</div></div>
          <div class="text-center p-3 bg-bg-page rounded-lg"><div class="text-2xl font-bold text-text-primary">{MOCK_BUYER.avgRating}</div><div class="text-xs text-text-muted">Avg Rating</div></div>
          <div class="text-center p-3 bg-bg-page rounded-lg"><div class="text-2xl font-bold text-success">92%</div><div class="text-xs text-text-muted">Positive</div></div>
          <div class="text-center p-3 bg-bg-page rounded-lg"><div class="text-2xl font-bold text-text-primary">5y</div><div class="text-xs text-text-muted">Account Age</div></div>
        </div>
      </div>
      <div class="card p-5">
        <h3 class="text-base font-bold text-text-primary mb-4">Recent Reviews</h3>
        <div class="space-y-4">
          {#each MOCK_BUYER.reviews as r}
            <div class="pb-4 border-b border-border-light last:border-0">
              <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-semibold text-teal">{r.shop}</span>
                <span class="text-xs text-text-muted">{r.date}</span>
              </div>
              <div class="flex gap-0.5 mb-1">{#each [1,2,3,4,5] as s}<Star size={12} class={s <= r.rating ? "text-warning fill-warning" : "text-border"} />{/each}</div>
              <p class="text-sm text-text-secondary">{r.text}</p>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</ToolPageLayout>
