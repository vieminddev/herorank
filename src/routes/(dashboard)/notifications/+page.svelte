<script lang="ts">
  import { Bell, LoaderCircle } from "lucide-svelte";
  import PageHeader from "$lib/components/layout/PageHeader.svelte";
  import { onMount } from "svelte";

  type Notification = {
    id: number;
    type: string;
    title: string;
    body: string | null;
    ref: string | null;
    read_at: number | null;
    created_at: number; // epoch seconds
  };

  let notifications = $state<Notification[]>([]);
  let unread = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const formatDate = (sec: number) =>
    new Date(sec * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const load = async () => {
    try {
      const res = await fetch("/api/notifications", { credentials: "same-origin" });
      const body = (await res.json()) as { notifications?: Notification[]; unread?: number };
      notifications = body.notifications ?? [];
      unread = body.unread ?? 0;
    } catch {
      error = "Couldn't load your alerts. Please try again.";
    }
    loading = false;
  };

  onMount(load);

  const markRead = async (id: number) => {
    const target = notifications.find((n) => n.id === id);
    if (!target || target.read_at) return;
    // Optimistic update.
    notifications = notifications.map((n) =>
      n.id === id ? { ...n, read_at: Math.floor(Date.now() / 1000) } : n,
    );
    unread = Math.max(0, unread - 1);
    await fetch("/api/notifications/read", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  const markAllRead = async () => {
    const now = Math.floor(Date.now() / 1000);
    notifications = notifications.map((n) => (n.read_at ? n : { ...n, read_at: now }));
    unread = 0;
    await fetch("/api/notifications/read", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
  };
</script>

<div class="max-w-5xl mx-auto animate-fade-in">
  <PageHeader title="Alerts" description={`${unread} unread alert${unread === 1 ? "" : "s"}`} icon={Bell}>
    {#snippet action()}
      {#if unread > 0}
        <button type="button" class="btn btn-secondary !py-2 !px-4 text-xs font-bold" onclick={markAllRead}>
          Mark all read
        </button>
      {/if}
    {/snippet}
  </PageHeader>

  <div class="max-w-3xl">
    {#if loading}
      <div class="flex items-center gap-2 text-text-muted text-sm py-8 justify-center card bg-white border border-border rounded-xl">
        <LoaderCircle size={16} class="animate-spin text-teal" /> Loading alerts…
      </div>
    {:else if error}
      <div class="card p-5 bg-white border border-danger/20 rounded-xl text-center">
        <p class="text-sm text-danger">{error}</p>
      </div>
    {:else if notifications.length}
      <div class="card p-4 bg-white border border-border rounded-xl shadow-sm">
        <div class="entry-list">
          {#each notifications as n (n.id)}
            <button
              type="button"
              onclick={() => markRead(n.id)}
              class="entry items-start text-left w-full !bg-transparent hover:!bg-bg-page {n.read_at ? '' : '!bg-teal/[0.02]'}"
            >
              <span
                class={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${n.read_at ? "bg-transparent border border-border" : "bg-teal"}`}
                aria-hidden="true"
              ></span>
              <div class="flex-1 min-w-0">
                <p class={`text-[0.9375rem] leading-snug ${n.read_at ? "font-normal text-text-secondary" : "font-bold text-text-primary"}`}>
                  {n.title}
                </p>
                {#if n.body}
                  <p class="entry-meta mt-1 text-xs text-text-secondary leading-relaxed">{n.body}</p>
                {/if}
              </div>
              <span class="text-[11px] text-text-muted shrink-0 tabular-nums ml-2">{formatDate(n.created_at)}</span>
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <div class="card p-8 bg-white border border-dashed border-border rounded-xl text-center text-text-secondary">
        <Bell size={24} class="mx-auto text-text-muted mb-2" />
        <p class="text-sm font-semibold text-text-primary">All caught up</p>
        <p class="text-xs text-text-muted mt-1">No alerts at the moment. We will notify you here of any SEO issues.</p>
      </div>
    {/if}
  </div>
</div>
