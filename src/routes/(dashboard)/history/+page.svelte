<script lang="ts">
  import { History, ArrowRight, LoaderCircle } from "lucide-svelte";
  import PageHeader from "$lib/components/layout/PageHeader.svelte";
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
    "rank-check": { label: "Search Position", href: "/tools/rank-check" },
    "listing-analyzer": { label: "Listing Optimizer", href: "/tools/listing-analyzer" },
    "tag-gap": { label: "Tag Gaps", href: "/tools/tag-generator" },
    "shop-analyzer": { label: "Shop Analyzer", href: "/tools/shop-analyzer" },
    "niche-finder": { label: "Niche Finder", href: "/tools/niche-finder" },
    "best-sellers": { label: "Best Sellers", href: "/tools/best-sellers" },
    "selling-now": { label: "Selling Now", href: "/tools/selling-now" },
    "etsy-trends": { label: "Etsy Trends", href: "/tools/etsy-trends" },
    "whitespace-finder": { label: "Whitespace Finder", href: "/tools/whitespace-finder" },
    "buyer-check": { label: "Buyer Check", href: "/tools/buyer-check" },
  };

  const toolLabel = (tool: string) =>
    TOOLS[tool]?.label ?? tool.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // Re-open a saved result. There is no id-addressable "get saved result" endpoint, so we
  // re-open the tool with the subject pre-filled as a query param the target can pick up.
  // rank-check subject = "{listingId}:{keyword}", listing-analyzer subject = "{listingId}",
  // tag-gap subject = keyword.
  const toolHref = (item: HistoryItem): string => {
    const base = TOOLS[item.tool]?.href ?? "/dashboard";
    const subj = item.subject?.trim();
    if (!subj) return base;
    if (item.tool === "rank-check") {
      const [listing, ...kw] = subj.split(":");
      const keyword = kw.join(":");
      const qs = new URLSearchParams();
      if (listing) qs.set("listing", listing);
      if (keyword) qs.set("keyword", keyword);
      return `${base}?${qs.toString()}`;
    }
    if (item.tool === "listing-analyzer") return `${base}?listing=${encodeURIComponent(subj)}`;
    if (item.tool === "tag-gap") return `${base}?keyword=${encodeURIComponent(subj)}`;
    return base;
  };

  // A short, human preview built from the saved `summary` payload (shapes differ per tool).
  const summaryPreview = (item: HistoryItem): string | null => {
    const s = item.summary ?? {};
    if (item.tool === "rank-check") {
      const pos = s.position;
      const kw = typeof s.keyword === "string" ? s.keyword : null;
      const rank = pos == null ? "Not in top 100" : `Ranked #${pos}`;
      return kw ? `${rank} for "${kw}"` : rank;
    }
    if (item.tool === "listing-analyzer") {
      const title = typeof s.title === "string" ? s.title : null;
      const grade = typeof s.grade === "string" ? s.grade : null;
      if (title && grade) return `Grade ${grade} · ${title}`;
      return grade ? `Grade ${grade}` : title;
    }
    if (item.tool === "tag-gap") {
      const gaps = Array.isArray(s.gaps) ? (s.gaps as unknown[]).filter((g) => typeof g === "string") : [];
      if (gaps.length) return `${gaps.length} tag gap${gaps.length === 1 ? "" : "s"}: ${gaps.slice(0, 3).join(", ")}`;
    }
    return null;
  };

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

<div class="max-w-5xl mx-auto animate-fade-in">
  <PageHeader title="History" description="Your recent analyses, saved automatically." icon={History} />

  <div class="max-w-3xl">
    {#if loading}
      <div class="flex items-center gap-2 text-text-muted text-sm py-8 justify-center card bg-white border border-border rounded-xl">
        <LoaderCircle size={16} class="animate-spin text-teal" /> Loading history…
      </div>
    {:else if error}
      <div class="card p-5 bg-white border border-danger/20 rounded-xl text-center">
        <p class="text-sm text-danger">{error}</p>
      </div>
    {:else if items.length}
      <div class="card p-4 bg-white border border-border rounded-xl shadow-sm">
        <div class="entry-list entry-list--divided">
          {#each items as item (item.id)}
            {@const preview = summaryPreview(item)}
            <a href={toolHref(item)} class="entry hover-lift group items-center">
              <div class="flex-1 min-w-0">
                <p class="text-[0.9375rem] font-bold text-text-primary group-hover:text-teal transition-colors">
                  {toolLabel(item.tool)}
                </p>
                {#if preview}
                  <p class="mt-0.5 truncate text-xs text-text-secondary">{preview}</p>
                {/if}
                <p class="entry-meta mt-0.5 truncate text-[11px] text-text-muted">{item.subject}</p>
              </div>
              <span class="text-[11px] text-text-muted shrink-0 tabular-nums mr-2">{formatDate(item.createdAt)}</span>
              <ArrowRight size={14} class="shrink-0 text-teal opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          {/each}
        </div>
      </div>
    {:else}
      <div class="card p-8 bg-white border border-dashed border-border rounded-xl text-center text-text-secondary">
        <History size={24} class="mx-auto text-text-muted mb-2" />
        <p class="text-sm font-semibold text-text-primary">No analyses yet</p>
        <p class="text-xs text-text-muted mt-1">Run an SEO tool and your results history will appear here.</p>
        <a href="/dashboard" class="btn btn-primary text-xs mt-4 inline-flex w-auto">Run your first tool →</a>
      </div>
    {/if}
  </div>
</div>
