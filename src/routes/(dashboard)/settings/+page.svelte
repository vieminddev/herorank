<script lang="ts">
  /**
   * Settings hub — a single landing page that links every settings area:
   *   Connections (/settings/connections) · Browser Extension (/settings/extension) ·
   *   Account · Notification preferences (/notifications) · Billing & Plan (/pricing).
   *
   * Plus a GDPR Danger zone: "Export my data" (downloads JSON from /api/account/export) and a
   * typed-confirmation "Delete account" flow (POST /api/account/delete → sign out → home).
   */
  import {
    Settings,
    Store,
    Puzzle,
    UserRound,
    Bell,
    CreditCard,
    ChevronRight,
    Download,
    Trash2,
    TriangleAlert,
    LoaderCircle,
    CircleAlert,
    X,
  } from "lucide-svelte";
  import PageHeader from "$lib/components/layout/PageHeader.svelte";
  import { signOut } from "$lib/auth-client";
  import { goto } from "$app/navigation";

  const areas = [
    {
      href: "/settings/connections",
      title: "Connections",
      desc: "Link and manage your Etsy shops for calibrated estimates.",
      icon: Store,
    },
    {
      href: "/settings/extension",
      title: "Browser Extension",
      desc: "Install the VieRank extension and manage its connection token.",
      icon: Puzzle,
    },
    {
      href: "/notifications",
      title: "Notifications",
      desc: "Review your in-app alerts and notification preferences.",
      icon: Bell,
    },
    {
      href: "/pricing",
      title: "Billing & Plan",
      desc: "View your plan, credits, and upgrade options.",
      icon: CreditCard,
    },
  ];

  // --- Export ---------------------------------------------------------------
  let exporting = $state(false);
  let exportError = $state<string | null>(null);

  async function exportData() {
    if (exporting) return;
    exporting = true;
    exportError = null;
    let res: Response;
    try {
      res = await fetch("/api/account/export", { credentials: "same-origin" });
    } catch {
      exportError = "Couldn't reach the server. Please try again.";
      exporting = false;
      return;
    }
    if (res.status === 401) {
      await goto("/auth/login");
      return;
    }
    if (!res.ok) {
      exportError = "Couldn't export your data. Please try again.";
      exporting = false;
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vierank-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    exporting = false;
  }

  // --- Delete (typed-confirmation dialog) -----------------------------------
  let showDelete = $state(false);
  let confirmText = $state("");
  let deleting = $state(false);
  let deleteError = $state<string | null>(null);

  const canDelete = $derived(confirmText === "DELETE");

  function openDelete() {
    confirmText = "";
    deleteError = null;
    showDelete = true;
  }
  function closeDelete() {
    if (deleting) return;
    showDelete = false;
  }

  async function deleteAccount() {
    if (!canDelete || deleting) return;
    deleting = true;
    deleteError = null;
    let res: Response;
    try {
      res = await fetch("/api/account/delete", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
    } catch {
      deleteError = "Couldn't reach the server. Please try again.";
      deleting = false;
      return;
    }
    if (!res.ok) {
      deleteError = "Couldn't delete your account. Please try again.";
      deleting = false;
      return;
    }
    // Account gone — clear the session and send them home.
    try {
      await signOut();
    } catch {
      /* session rows are already deleted server-side; ignore */
    }
    window.location.href = "/";
  }
</script>

<svelte:head><title>Settings · VieRank</title></svelte:head>

<div class="max-w-5xl mx-auto animate-fade-in">
  <PageHeader
    title="Settings"
    description="Manage your connections, extension, notifications, billing, and account."
    icon={Settings}
  />

  <!-- Settings areas -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    {#each areas as area}
      {@const Icon = area.icon}
      <a
        href={area.href}
        class="card card-accent hover-lift p-5 bg-white border border-border rounded-xl shadow-sm flex items-start gap-4 group min-h-[44px]"
      >
        <span class="w-11 h-11 rounded-xl bg-teal/5 border border-teal/10 text-teal flex items-center justify-center shrink-0 shadow-sm">
          <Icon size={20} />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-bold text-text-primary">{area.title}</h2>
            <ChevronRight size={16} class="text-text-muted group-hover:text-teal transition-colors shrink-0" />
          </div>
          <p class="text-xs text-text-secondary mt-1 leading-relaxed">{area.desc}</p>
        </div>
      </a>
    {/each}
  </div>

  <!-- Account / GDPR -->
  <section class="mt-10">
    <p class="section-kicker !text-teal mb-3 flex items-center gap-1.5">
      <UserRound size={12} /> Account
    </p>
    <div class="card p-5 bg-white border border-border rounded-xl shadow-sm">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="min-w-0">
          <h2 class="text-sm font-bold text-text-primary">Export my data</h2>
          <p class="text-xs text-text-secondary mt-1 leading-relaxed max-w-md">
            Download a JSON copy of your VieRank account data — shops, keyword lists, watched shops,
            history, and credits. OAuth tokens are never included.
          </p>
        </div>
        <button
          type="button"
          onclick={exportData}
          disabled={exporting}
          class="btn btn-secondary !py-2.5 !px-5 text-xs font-bold shrink-0 w-full sm:w-auto justify-center min-h-[44px] disabled:opacity-50"
          data-testid="export-data"
        >
          {#if exporting}
            <LoaderCircle size={14} class="animate-spin text-teal" /> Preparing…
          {:else}
            <Download size={14} /> Export my data
          {/if}
        </button>
      </div>
      {#if exportError}
        <div class="mt-3 flex items-start gap-2 text-xs text-danger" role="alert">
          <CircleAlert size={14} class="flex-shrink-0 mt-0.5" /> <span>{exportError}</span>
        </div>
      {/if}
    </div>
  </section>

  <!-- Danger zone -->
  <section class="mt-8">
    <p class="section-kicker mb-3 flex items-center gap-1.5" style="color: var(--danger, #c0392b)">
      <TriangleAlert size={12} /> Danger zone
    </p>
    <div class="card p-5 bg-white border border-danger/25 rounded-xl shadow-sm">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="min-w-0">
          <h2 class="text-sm font-bold text-text-primary">Delete account</h2>
          <p class="text-xs text-text-secondary mt-1 leading-relaxed max-w-md">
            Permanently delete your account and all associated data. This cannot be undone — consider
            exporting your data first.
          </p>
        </div>
        <button
          type="button"
          onclick={openDelete}
          class="btn !py-2.5 !px-5 text-xs font-bold shrink-0 w-full sm:w-auto justify-center min-h-[44px] text-danger border border-danger/30 bg-white hover:bg-danger/5 transition-colors"
          data-testid="open-delete"
        >
          <Trash2 size={14} /> Delete account
        </button>
      </div>

      {#if showDelete}
        <div class="mt-5 pt-5 border-t border-border-light" data-testid="delete-dialog">
          <div class="flex items-start justify-between gap-3">
            <p class="text-sm font-bold text-text-primary">Are you absolutely sure?</p>
            <button
              type="button"
              onclick={closeDelete}
              disabled={deleting}
              class="text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
              aria-label="Cancel"
            >
              <X size={16} />
            </button>
          </div>
          <p class="text-xs text-text-secondary mt-1 leading-relaxed">
            This erases your shops, keyword lists, watched shops, history, credits, and sign-in. To
            confirm, type <strong class="text-danger font-bold">DELETE</strong> below.
          </p>
          <input
            type="text"
            bind:value={confirmText}
            placeholder="Type DELETE to confirm"
            autocomplete="off"
            class="field mt-3 w-full sm:max-w-xs"
            data-testid="delete-confirm-input"
          />
          {#if deleteError}
            <div class="mt-3 flex items-start gap-2 text-xs text-danger" role="alert">
              <CircleAlert size={14} class="flex-shrink-0 mt-0.5" /> <span>{deleteError}</span>
            </div>
          {/if}
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onclick={deleteAccount}
              disabled={!canDelete || deleting}
              class="btn !py-2.5 !px-5 text-xs font-bold min-h-[44px] text-white bg-danger border border-danger hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="confirm-delete"
            >
              {#if deleting}
                <LoaderCircle size={14} class="animate-spin" /> Deleting…
              {:else}
                <Trash2 size={14} /> Permanently delete
              {/if}
            </button>
            <button
              type="button"
              onclick={closeDelete}
              disabled={deleting}
              class="btn btn-secondary !py-2.5 !px-5 text-xs font-bold min-h-[44px] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}
    </div>
  </section>
</div>
