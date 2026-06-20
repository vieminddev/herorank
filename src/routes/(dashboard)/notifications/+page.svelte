<script lang="ts">
  import { Bell, LoaderCircle } from "lucide-svelte";
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

<div class="max-w-2xl mx-auto py-8 px-4">
  <div class="flex items-center justify-between mb-6">
    <div class="flex items-center gap-3">
      <span class="w-10 h-10 rounded-xl bg-teal/8 text-teal flex items-center justify-center">
        <Bell size={20} />
      </span>
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-text-primary">Alerts</h1>
        <p class="text-sm text-text-muted">{unread} unread</p>
      </div>
    </div>
    {#if unread > 0}
      <button type="button" class="copy-link" onclick={markAllRead}>Mark all read</button>
    {/if}
  </div>

  {#if loading}
    <div class="flex items-center gap-2 text-text-muted text-sm">
      <LoaderCircle size={15} class="animate-spin" /> Loading…
    </div>
  {:else if error}
    <p class="text-sm text-danger">{error}</p>
  {:else if notifications.length}
    <div class="entry-list">
      {#each notifications as n (n.id)}
        <button
          type="button"
          onclick={() => markRead(n.id)}
          class="entry items-start text-left w-full"
        >
          <span
            class={`w-2 h-2 rounded-full shrink-0 mt-2 ${n.read_at ? "bg-transparent" : "bg-teal"}`}
            aria-hidden="true"
          ></span>
          <div class="flex-1 min-w-0">
            <p class={`text-[0.9375rem] ${n.read_at ? "font-normal text-text-secondary" : "font-medium text-text-primary"}`}>
              {n.title}
            </p>
            {#if n.body}
              <p class="entry-meta mt-0.5 leading-relaxed">{n.body}</p>
            {/if}
          </div>
          <span class="text-xs text-text-muted shrink-0 tabular-nums">{formatDate(n.created_at)}</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="text-sm text-text-muted">You're all caught up — no alerts yet.</p>
  {/if}
</div>
