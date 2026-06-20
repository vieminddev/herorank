<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import { ClipboardCheck, LoaderCircle, CircleAlert, ExternalLink, Plug } from "lucide-svelte";

  // One audited listing from GET /api/my-shop/audit (routes/myShop.ts), sorted worst-first.
  interface AuditRow {
    listingId: number;
    title: string;
    url: string | null;
    imageUrl: string | null;
    score: number;
    topIssues: string[];
  }

  interface AuditPayload {
    connected: boolean;
    shopName: string;
    count: number;
    listings: AuditRow[];
    estimated: { score: boolean };
  }

  let loading = $state(true);
  let error = $state<string | null>(null);
  let notConnected = $state(false);
  let audit = $state<AuditPayload | null>(null);

  // Average score across the shop (rounded), shown as the headline number.
  const shopScore = $derived(
    audit && audit.listings.length
      ? Math.round(audit.listings.reduce((s, l) => s + l.score, 0) / audit.listings.length)
      : 0
  );

  const band = (score: number): string =>
    score >= 70 ? "var(--score-high)" : score >= 40 ? "var(--score-medium)" : "var(--score-low)";

  const loadAudit = async () => {
    loading = true;
    error = null;
    notConnected = false;
    try {
      const res = await fetch("/api/my-shop/audit", { credentials: "same-origin" });
      if (res.status === 401) {
        window.location.href = "/auth/login";
        return;
      }
      const body = await res.json().catch(() => null);
      if (res.status === 404 && body?.error === "NOT_CONNECTED") {
        notConnected = true;
      } else if (!res.ok) {
        error = body?.message ?? "Could not audit your shop. Please try again.";
      } else {
        audit = body as AuditPayload;
      }
    } catch {
      error = "Could not audit your shop. Please try again.";
    }
    loading = false;
  };

  $effect(() => {
    loadAudit();
  });
</script>

<ToolPageLayout
  title="Shop Audit"
  prefix="Etsy"
  description="One pass over every listing in your shop, scored for SEO and sorted worst-first — so you always know which listing to fix next."
  icon={ClipboardCheck}
>
  {#if loading}
    <div class="flex items-center gap-2 text-text-muted text-sm">
      <LoaderCircle size={15} class="animate-spin" /> Auditing your shop…
    </div>
  {:else if notConnected}
    <ToolEmpty
      icon={Plug}
      title="Connect your Etsy shop"
      hint="Shop Audit scores the listings in your own shop. Connect your shop and we'll run the pass automatically."
    >
      {#snippet preview()}
        <a href="/settings/connections" class="copy-link !text-teal">Connect your shop →</a>
      {/snippet}
    </ToolEmpty>
  {:else if error}
    <div class="flex items-start gap-3 animate-fade-in" role="alert">
      <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="text-sm text-text-primary">{error}</p>
        <button type="button" onclick={loadAudit} class="copy-link mt-2 !text-teal">Try again</button>
      </div>
    </div>
  {:else if audit}
    <div class="animate-fade-in">
      <!-- Score summary -->
      <div class="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div>
          <p class="section-kicker mb-1 inline-flex items-center gap-2">
            Shop SEO score <EstimatedBadge label="Est." tooltip="Rule-based audit score estimated from public listing data — not an official Etsy figure." />
          </p>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-semibold tracking-tight" style="color: {band(shopScore)}">{shopScore}</span>
            <span class="text-sm text-text-muted">/ 100</span>
          </div>
        </div>
        <p class="text-sm text-text-muted">{audit.count} listing{audit.count === 1 ? "" : "s"} audited</p>
      </div>
      <p class="lead text-sm mb-5">Sorted worst-first — start at the top and work your way down.</p>
      <hr class="rule mb-1" />

      {#if audit.listings.length === 0}
        <div class="resting">
          <p class="text-sm text-text-secondary">No active listings to audit.</p>
          <p class="text-[0.8125rem]">Publish a listing and run the audit again.</p>
        </div>
      {:else}
        <div class="entry-list">
          {#each audit.listings as row (row.listingId)}
            <div class="entry items-start !py-4">
              {#if row.imageUrl}
                <img
                  src={row.imageUrl}
                  alt={row.title}
                  loading="lazy"
                  class="w-12 h-12 rounded-lg object-cover shrink-0"
                />
              {:else}
                <div class="w-12 h-12 rounded-lg bg-gradient-to-br from-bg-page to-border shrink-0"></div>
              {/if}

              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-3">
                  <p class="text-sm font-medium text-text-primary leading-snug min-w-0">{row.title}</p>
                  <span
                    class="text-sm font-semibold tabular-nums shrink-0"
                    style="color: {band(row.score)}"
                  >
                    {row.score}/100
                  </span>
                </div>

                <div class="score-bar mt-2 max-w-md">
                  <div
                    class="score-bar-fill"
                    style="width: {row.score}%; background: {band(row.score)}"
                  ></div>
                </div>

                {#if row.topIssues.length > 0}
                  <ul class="mt-2 space-y-1">
                    {#each row.topIssues as issue}
                      <li class="flex items-start gap-2 text-xs text-text-secondary">
                        <span class="w-1.5 h-1.5 rounded-full bg-warning shrink-0 mt-1.5"></span>
                        <span>{issue}</span>
                      </li>
                    {/each}
                  </ul>
                {/if}

                {#if row.url}
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="copy-link mt-2"
                  >
                    <ExternalLink size={11} /> View on Etsy
                  </a>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</ToolPageLayout>
