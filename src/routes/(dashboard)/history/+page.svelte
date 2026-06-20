<script lang="ts">
  import { History, ArrowRight, LoaderCircle } from "lucide-svelte";
  import { onMount } from "svelte";

  type HistoryItem = {
    id: number;
    tool: string;
    subject: string;
    createdAt: number; // epoch seconds
    summary: Record<string, unknown>;
  };

  let items = $state<HistoryItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Map a stored tool key to its label + the page that produced it.
  const TOOLS: Record<string, { label: string; href: string }> = {
    "rank-check": { label: "Search Position", href: "/tools/etsy/rank-check" },
    "listing-analyzer": { label: "Listing Optimizer", href: "/tools/etsy/listing-analyzer" },
    "tag-gap": { label: "Tag Gaps", href: "/tools/etsy/tag-generator" },
    "shop-analyzer": { label: "Shop Analyzer", href: "/tools/etsy/shop-analyzer" },
    "niche-finder": { label: "Niche Finder", href: "/tools/etsy/niche-finder" },
    "best-sellers": { label: "Best Sellers", href: "/tools/etsy/best-sellers" },
    "etsy-trends": { label: "Etsy Trends", href: "/tools/etsy/etsy-trends" },
    "buyer-check": { label: "Buyer Check", href: "/tools/etsy/buyer-check" },
  };

  const toolLabel = (tool: string) =>
    TOOLS[tool]?.label ?? tool.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const toolHref = (tool: string) => TOOLS[tool]?.href ?? "/dashboard";

  const formatDate = (sec: number) =>
    new Date(sec * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  onMount(async () => {
    try {
      const res = await fetch("/api/me/history", { credentials: "same-origin" });
      const body = (await res.json()) as { items?: HistoryItem[] };
      items = body.items ?? [];
    } catch {
      error = "Couldn't load your history. Please try again.";
    }
    loading = false;
  });
</script>

<div class="max-w-2xl mx-auto py-8 px-4">
  <div class="flex items-center gap-3 mb-6">
    <span class="w-10 h-10 rounded-xl bg-teal/8 text-teal flex items-center justify-center">
      <History size={20} />
    </span>
    <div>
      <h1 class="text-xl font-semibold tracking-tight text-text-primary">History</h1>
      <p class="text-sm text-text-muted">Your recent analyses, saved automatically.</p>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center gap-2 text-text-muted text-sm">
      <LoaderCircle size={15} class="animate-spin" /> Loading…
    </div>
  {:else if error}
    <p class="text-sm text-danger">{error}</p>
  {:else if items.length}
    <div class="entry-list">
      {#each items as item (item.id)}
        <a href={toolHref(item.tool)} class="entry group items-center">
          <div class="flex-1 min-w-0">
            <p class="text-[0.9375rem] font-medium text-text-primary group-hover:text-teal transition-colors">
              {toolLabel(item.tool)}
            </p>
            <p class="entry-meta mt-0.5 truncate">{item.subject}</p>
          </div>
          <span class="text-xs text-text-muted shrink-0 tabular-nums">{formatDate(item.createdAt)}</span>
          <ArrowRight size={16} class="shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      {/each}
    </div>
  {:else}
    <p class="text-sm text-text-muted">No analyses yet. Run a tool and it'll show up here.</p>
  {/if}
</div>
