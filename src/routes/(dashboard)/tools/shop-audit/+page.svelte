<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ConnectShopEmpty from "$lib/components/ui/ConnectShopEmpty.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import { ClipboardCheck, LoaderCircle, CircleAlert, ExternalLink } from "lucide-svelte";
  import { page } from "$app/stores";

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
  let needsReconnect = $state(false);
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
    needsReconnect = false;
    // No connected shop (known from the layout) → connect state, no 404 round-trip.
    if (!$page.data.shopConnected) {
      notConnected = true;
      loading = false;
      return;
    }
    try {
      const res = await fetch("/api/my-shop/audit", { credentials: "same-origin" });
      if (res.status === 401) {
        window.location.href = "/auth/login";
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | (Partial<AuditPayload> & { error?: string; message?: string })
        | null;
      if (res.status === 404 && body?.error === "NOT_CONNECTED") {
        notConnected = true;
      } else if (body?.error === "ETSY_REAUTH") {
        needsReconnect = true;
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
  description="One pass over every listing in your shop, scored for SEO and sorted worst-first — so you always know which listing to fix next."
  icon={ClipboardCheck}
>
  {#if loading}
    <div class="flex items-center gap-2 text-text-muted text-sm">
      <LoaderCircle size={15} class="animate-spin" /> Auditing your shop…
    </div>
  {:else if notConnected}
    <ConnectShopEmpty
      hint="Shop Audit scores the listings in your own shop. Connect your shop and we'll run the pass automatically."
    />
  {:else if needsReconnect}
    <div class="panel-tint p-6 max-w-md">
      <p class="text-sm font-semibold text-text-primary mb-1">Reconnect your Etsy shop</p>
      <p class="text-sm text-text-secondary mb-3">Your Etsy connection has expired, so we can't read your listings to audit them. Reconnect and we'll run the pass automatically.</p>
      <a href="/settings/connections" class="btn btn-secondary !py-2 !px-4 text-xs font-bold inline-flex items-center gap-1.5">Reconnect your shop →</a>
    </div>
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
      <!-- Score summary with Premium Radial SVG Circular Gauge -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 p-6 bg-white border border-border rounded-xl shadow-sm">
        <div class="flex items-center gap-5">
          <!-- Radial Gauge SVG -->
          <div class="relative w-20 h-20 shrink-0" style="--gauge-percent: {shopScore}; --gauge-offset: {100 - shopScore}">
            <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <!-- Background Path -->
              <path
                class="text-border-light"
                stroke-width="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <!-- Animated Forepath -->
              <path
                class="gauge-animate transition-all duration-500"
                style="stroke: {band(shopScore)}"
                stroke-width="3.5"
                stroke-linecap="round"
                stroke-dasharray="100, 100"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <!-- Center Text -->
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-2xl font-bold tracking-tight text-text-primary leading-none">{shopScore}</span>
              <span class="text-[9px] text-text-secondary font-semibold mt-0.5">/100</span>
            </div>
          </div>

          <div>
            <p class="section-kicker mb-1 inline-flex items-center gap-1.5">
              Shop SEO score
              <EstimatedBadge label="Est." tooltip="Rule-based audit score estimated from public listing data — not an official Etsy figure." />
            </p>
            <h3 class="text-base font-semibold text-text-primary">
              {#if shopScore >= 70}
                🟢 Good Standing SEO
              {:else}
                🟡 Optimization Recommended
              {/if}
            </h3>
            <p class="text-xs text-text-secondary mt-0.5">Calculated across your active listings.</p>
          </div>
        </div>

        <div class="text-left sm:text-right">
          <p class="text-2xl font-semibold text-text-primary tabular-nums">{audit.count}</p>
          <p class="text-xs text-text-muted mt-0.5">active listings audited</p>
        </div>
      </div>

      <p class="lead text-sm mb-5">Sorted worst-first — start at the top and work your way down.</p>
      <hr class="rule mb-5" />

      {#if audit.listings.length === 0}
        <div class="resting">
          <p class="text-sm text-text-secondary">No active listings to audit.</p>
          <p class="text-[0.8125rem]">Publish a listing and run the audit again.</p>
        </div>
      {:else}
        <div class="entry-list">
          {#each audit.listings as row (row.listingId)}
            <div class="entry items-start !py-4 hover-lift">
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
                  <div class="mt-3">
                    <details class="group">
                      <summary class="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-teal font-medium cursor-pointer focus:outline-none select-none">
                        <svg class="w-3 h-3 transform transition-transform duration-200 group-open:rotate-90 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <span>Show {row.topIssues.length} SEO issue{row.topIssues.length === 1 ? '' : 's'}</span>
                      </summary>
                      <ul class="mt-2 pl-4 space-y-1.5 border-l border-warning-light animate-fade-in">
                        {#each row.topIssues as issue}
                          <li class="flex items-start gap-2 text-xs text-text-secondary">
                            <span class="w-1.5 h-1.5 rounded-full bg-warning shrink-0 mt-1.5"></span>
                            <span>{issue}</span>
                          </li>
                        {/each}
                      </ul>
                    </details>
                  </div>
                {/if}

                <div class="flex items-center gap-4 mt-3">
                  <a href={`/tools/listing-analyzer?listing=${row.listingId}`} class="copy-link !text-teal">
                    Fix this listing →
                  </a>
                  <a href={`/tools/listing-editor?listing=${row.listingId}`} class="copy-link !text-teal">
                    Edit on Etsy →
                  </a>
                  {#if row.url}
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="copy-link"
                    >
                      <ExternalLink size={11} /> View on Etsy
                    </a>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</ToolPageLayout>

<style>
  /* Custom disclosure marker removal and rotate on open */
  details summary::-webkit-details-marker {
    display: none;
  }
  details summary {
    list-style: none;
  }
  details[open] svg {
    transform: rotate(90deg);
  }
</style>
