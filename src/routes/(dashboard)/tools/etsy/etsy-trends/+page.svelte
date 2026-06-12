<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { Search, TrendingUp, TrendingDown, Minus } from "lucide-svelte";

  const MOCK_TRENDS = [
    { keyword: "personalized gifts", searches: 142000, trend: "up", change: "+12%", category: "Jewelry" },
    { keyword: "cottagecore decor", searches: 98000, trend: "up", change: "+28%", category: "Home & Living" },
    { keyword: "digital planner", searches: 87000, trend: "up", change: "+45%", category: "Digital Downloads" },
    { keyword: "custom pet portrait", searches: 76000, trend: "up", change: "+18%", category: "Art" },
    { keyword: "beaded bracelets", searches: 65000, trend: "stable", change: "+2%", category: "Jewelry" },
    { keyword: "vintage clothing", searches: 54000, trend: "down", change: "-5%", category: "Clothing" },
    { keyword: "resin art", searches: 48000, trend: "up", change: "+22%", category: "Art" },
    { keyword: "baby shower favors", searches: 42000, trend: "stable", change: "+1%", category: "Party Supplies" },
    { keyword: "macrame wall hanging", searches: 38000, trend: "down", change: "-8%", category: "Home & Living" },
    { keyword: "sticker sheets", searches: 35000, trend: "up", change: "+15%", category: "Stickers" },
    { keyword: "crochet patterns", searches: 32000, trend: "up", change: "+10%", category: "Craft Supplies" },
    { keyword: "wedding invitations", searches: 29000, trend: "stable", change: "+3%", category: "Paper & Party" },
  ];

  let filter = $state("");
  const filtered = $derived(
    MOCK_TRENDS.filter((t) =>
      !filter || t.keyword.toLowerCase().includes(filter.toLowerCase()) || t.category.toLowerCase().includes(filter.toLowerCase())
    )
  );
</script>

<ToolPageLayout title="Etsy Trends" description="Stay ahead of the curve — see what buyers are searching for right now and spot emerging trends before they peak.">
  <div class="mb-6">
    <div class="relative max-w-md">
      <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input type="text" bind:value={filter} placeholder="Filter by keyword or category..." class="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal bg-white" />
    </div>
  </div>
  <div class="card overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-border-light bg-bg-page/50">
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">#</th>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Keyword</th>
            <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Category</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Monthly Searches</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Trend</th>
            <th class="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Change</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as item, i (item.keyword)}
            <tr class="border-b border-border-light hover:bg-bg-page/50 transition-colors">
              <td class="px-4 py-3 text-sm text-text-muted">{i + 1}</td>
              <td class="px-4 py-3 text-sm font-semibold text-text-primary">{item.keyword}</td>
              <td class="px-4 py-3"><span class="text-xs px-2 py-0.5 bg-bg-page rounded-full text-text-secondary">{item.category}</span></td>
              <td class="px-4 py-3 text-sm text-right text-text-primary">{item.searches.toLocaleString()}</td>
              <td class="px-4 py-3 text-right">
                {#if item.trend === "up"}<TrendingUp size={14} class="text-success" />{:else if item.trend === "down"}<TrendingDown size={14} class="text-danger" />{:else}<Minus size={14} class="text-text-muted" />{/if}
              </td>
              <td class="px-4 py-3 text-sm text-right font-medium" style="color: {item.trend === 'up' ? 'var(--success)' : item.trend === 'down' ? 'var(--danger)' : 'var(--text-muted)'}">{item.change}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</ToolPageLayout>
