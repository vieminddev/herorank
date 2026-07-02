<script lang="ts">
  /**
   * Review Requests — draft a warm thank-you + honest-review invite for recent buyers.
   *
   * GET  /api/my-shop/receipts-pending-review   recent orders + outreach status (404 → connect)
   * POST /api/my-shop/review-request-draft       LLM draft (metered, 1 credit)
   * POST /api/my-shop/outreach/:receiptId        record contacted / skipped
   *
   * Etsy has no send-message API, so we draft the copy and the seller pastes it into
   * Etsy Messages. We never offer incentives for reviews (against Etsy policy).
   */
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ConnectShopEmpty from "$lib/components/ui/ConnectShopEmpty.svelte";
  import {
    MessageSquareHeart,
    LoaderCircle,
    Copy,
    Check,
    CircleAlert,
    CircleCheck,
    SkipForward,
  } from "lucide-svelte";
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";

  const GENERIC_ERROR = "Something went wrong. Please try again.";

  type Tone = "warm" | "professional" | "playful";
  type OutreachStatus = "contacted" | "skipped" | null;

  interface Order {
    receiptId: number;
    createdAt: number;
    buyerName: string | null;
    productTitle: string | null;
    status: OutreachStatus;
  }
  interface Draft {
    subject: string;
    message: string;
  }

  const TONES: { v: Tone; l: string }[] = [
    { v: "warm", l: "Warm" },
    { v: "professional", l: "Professional" },
    { v: "playful", l: "Playful" },
  ];

  let tone = $state<Tone>("warm");

  let loaded = $state(false);
  let connected = $state(true);
  let needsReconnect = $state(false);
  let error = $state<string | null>(null);
  let shopName = $state<string | null>(null);
  let orders = $state<Order[]>([]);

  // Per-receipt draft state.
  let drafting = $state<number | null>(null);
  let draftError = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let activeReceipt = $state<number | null>(null);
  let draft = $state<Draft | null>(null);
  let copied = $state<"subject" | "message" | null>(null);

  const fmtDate = (epoch: number): string =>
    new Date(epoch * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const load = async () => {
    loaded = false;
    error = null;
    needsReconnect = false;
    // No connected shop (known from the layout) → connect state, no 404 round-trip.
    if (!$page.data.shopConnected) {
      connected = false;
      loaded = true;
      return;
    }
    let res: Response;
    try {
      res = await fetch("/api/my-shop/receipts-pending-review");
    } catch {
      error = GENERIC_ERROR;
      loaded = true;
      return;
    }
    if (res.status === 401) {
      await goto("/auth/login");
      return;
    }
    if (res.status === 404) {
      connected = false;
      loaded = true;
      return;
    }
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (body?.error === "ETSY_REAUTH") {
      needsReconnect = true;
      loaded = true;
      return;
    }
    if (!res.ok) {
      error = typeof body?.message === "string" ? body.message : GENERIC_ERROR;
      loaded = true;
      return;
    }
    connected = true;
    shopName = body?.shopName ?? null;
    orders = (body?.orders ?? []) as Order[];
    loaded = true;
  };

  const makeDraft = async (order: Order) => {
    if (drafting !== null) return;
    drafting = order.receiptId;
    draftError = null;
    needsUpgrade = false;
    activeReceipt = order.receiptId;
    draft = null;

    // The draft handler lives on the my-shop router (/api/my-shop/...), not /api/tools — call it
    // directly so the request actually reaches the handler instead of 404ing.
    let res: Response;
    try {
      res = await fetch("/api/my-shop/review-request-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          shopName: shopName ?? "your shop",
          buyerName: order.buyerName ?? undefined,
          productTitle: order.productTitle ?? undefined,
          tone,
        }),
      });
    } catch {
      draftError = GENERIC_ERROR;
      drafting = null;
      return;
    }
    if (res.status === 401) {
      await goto("/auth/login");
      return;
    }
    const body = (await res.json().catch(() => null)) as (Draft & { message?: string }) | null;
    if (res.ok && body) {
      draft = body as Draft;
      await invalidateAll(); // refresh Header credits badge
    } else if (res.status === 402) {
      needsUpgrade = true;
      draftError = body?.message ?? GENERIC_ERROR;
    } else {
      draftError = body?.message ?? GENERIC_ERROR;
    }
    drafting = null;
  };

  const setOutreach = async (order: Order, status: "contacted" | "skipped") => {
    // Optimistic update.
    orders = orders.map((o) => (o.receiptId === order.receiptId ? { ...o, status } : o));
    try {
      await fetch(`/api/my-shop/outreach/${order.receiptId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      /* keep optimistic state; non-critical */
    }
    if (activeReceipt === order.receiptId && status === "skipped") {
      draft = null;
      activeReceipt = null;
    }
  };

  const copy = (which: "subject" | "message", text: string) => {
    navigator.clipboard.writeText(text);
    copied = which;
    setTimeout(() => (copied = null), 2000);
  };

  onMount(load);
</script>

<ToolPageLayout
  title="Review Requests"
  description="A little nudge goes a long way. Draft a warm, personal thank-you for recent buyers and invite an honest review."
  icon={MessageSquareHeart}
  credits={1}
>
  {#snippet controls()}
    <!-- Only meaningful once a shop is connected — hide the tone picker on the connect/reconnect states. -->
    {#if connected && !needsReconnect}
      <p class="section-kicker mb-3">Message tone</p>
      <div class="space-y-2">
        {#each TONES as t}
          <label
            class="flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors {tone === t.v ? 'border-teal bg-teal/5' : 'border-border hover:border-text-muted'}"
          >
            <input type="radio" name="tone" value={t.v} checked={tone === t.v} onchange={() => (tone = t.v)} class="accent-teal" />
            <span class="text-sm text-text-primary">{t.l}</span>
          </label>
        {/each}
      </div>
      <div class="mt-5 p-3 rounded-lg bg-bg-page text-[0.8125rem] text-text-secondary leading-relaxed">
        Etsy has no API to send messages, so we draft it and you paste it into Etsy Messages. We never offer incentives for reviews (against Etsy policy).
      </div>
    {/if}
  {/snippet}

  {#if !loaded}
    <div class="flex items-center gap-2 text-text-muted text-sm">
      <LoaderCircle size={15} class="animate-spin" /> Loading orders…
    </div>
  {:else if !connected}
    <ConnectShopEmpty
      hint="Link your shop once and we'll line up your recent buyers so you can thank them and invite an honest review — read-only and private."
    />
  {:else if needsReconnect}
    <div class="panel-tint p-6 max-w-md">
      <p class="text-sm font-semibold text-text-primary mb-1">Reconnect your Etsy shop</p>
      <p class="text-sm text-text-secondary mb-3">Your Etsy connection has expired, so we can't load your recent orders. Reconnect and your buyers will show up here again.</p>
      <a href="/settings/connections" class="btn btn-secondary !py-2 !px-4 text-xs font-bold inline-flex items-center gap-1.5">Reconnect your shop →</a>
    </div>
  {:else if error}
    <p class="text-sm text-danger">{error}</p>
  {:else if orders.length === 0}
    <p class="text-sm text-text-muted">No orders in the last 60 days yet. New buyers will show up here.</p>
  {:else}
    <div class="animate-fade-in">
      {#if draftError}
        <div class="mb-6 flex items-start gap-3" role="alert">
          <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
          <div class="flex-1">
            <p class="text-sm text-text-primary">{draftError}</p>
            {#if needsUpgrade}
              <a href="/pricing" class="copy-link mt-2 !text-teal">Upgrade your plan →</a>
            {/if}
          </div>
        </div>
      {/if}

      <div class="entry-list">
        {#each orders as order}
          <div class="entry !block !py-4">
            <div class="flex items-center justify-between gap-3">
              <div class="flex-1 min-w-0">
                <p class="text-[0.9375rem] text-text-primary truncate">
                  {order.buyerName ?? "Etsy buyer"}
                </p>
                <p class="entry-meta mt-0.5 truncate">
                  {order.productTitle ?? "—"} · {fmtDate(order.createdAt)}
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                {#if order.status === "contacted"}
                  <span class="inline-flex items-center gap-1 text-xs font-medium text-success">
                    <CircleCheck size={13} /> Contacted
                  </span>
                {:else if order.status === "skipped"}
                  <span class="text-xs text-text-muted">Skipped</span>
                {/if}
                <button
                  type="button"
                  onclick={() => makeDraft(order)}
                  disabled={drafting === order.receiptId}
                  class="btn btn-primary !py-1.5 !px-3 !text-sm"
                >
                  {#if drafting === order.receiptId}
                    <LoaderCircle size={13} class="animate-spin" /> Drafting…
                  {:else}
                    Draft message
                  {/if}
                </button>
                {#if order.status !== "skipped"}
                  <button
                    type="button"
                    onclick={() => setOutreach(order, "skipped")}
                    class="copy-link"
                    aria-label="Skip"
                    title="Skip"
                  >
                    <SkipForward size={14} />
                  </button>
                {/if}
              </div>
            </div>

            {#if activeReceipt === order.receiptId && draft}
              <div class="mt-4 p-4 rounded-lg border border-border bg-bg-page/40 animate-fade-in">
                <div class="flex items-center justify-between gap-3 mb-1">
                  <p class="section-kicker">Subject</p>
                  <button type="button" onclick={() => copy("subject", draft!.subject)} class="copy-link">
                    {#if copied === "subject"}<Check size={12} class="text-success" /> Copied{:else}<Copy size={12} /> Copy{/if}
                  </button>
                </div>
                <p class="text-sm text-text-primary mb-4">{draft.subject}</p>

                <div class="flex items-center justify-between gap-3 mb-1">
                  <p class="section-kicker">Message</p>
                  <button type="button" onclick={() => copy("message", draft!.message)} class="copy-link">
                    {#if copied === "message"}<Check size={12} class="text-success" /> Copied{:else}<Copy size={12} /> Copy{/if}
                  </button>
                </div>
                <pre class="text-[0.9375rem] text-text-primary whitespace-pre-wrap leading-relaxed font-sans">{draft.message}</pre>

                <div class="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onclick={() => setOutreach(order, "contacted")}
                    class="btn btn-primary !py-1.5 !px-3 !text-sm"
                  >
                    <CircleCheck size={13} /> Mark contacted
                  </button>
                  <p class="text-xs text-text-muted">Paste it into Etsy Messages, then mark it here.</p>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</ToolPageLayout>
