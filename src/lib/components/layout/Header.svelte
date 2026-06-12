<script lang="ts">
  import { page } from "$app/state";
  import { Sparkles, Sun, ChevronDown, User } from "lucide-svelte";

  let showDropdown = $state(false);

  const pathname = $derived(page.url.pathname);

  // Generate breadcrumb from pathname
  const breadcrumbs = $derived.by(() => {
    const segments = pathname.split("/").filter(Boolean);
    return segments.map((seg, i) => {
      const href = "/" + segments.slice(0, i + 1).join("/");
      const label = seg
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return { label, href };
    });
  });
</script>

<header
  class="sticky top-0 bg-white border-b border-border z-20 flex items-center justify-between px-6"
  style="height: var(--header-height)"
>
  <!-- Breadcrumb -->
  <nav class="flex items-center gap-1.5 text-sm">
    <a
      href="/dashboard"
      class="text-text-secondary hover:text-text-primary transition-colors"
    >
      Home
    </a>
    {#each breadcrumbs as crumb, i (crumb.href)}
      <span class="flex items-center gap-1.5">
        <span class="text-text-muted">/</span>
        {#if i === breadcrumbs.length - 1}
          <span class="text-text-primary font-medium">
            {crumb.label}
          </span>
        {:else}
          <a
            href={crumb.href}
            class="text-text-secondary hover:text-text-primary transition-colors"
          >
            {crumb.label}
          </a>
        {/if}
      </span>
    {/each}
  </nav>

  <!-- Right side actions -->
  <div class="flex items-center gap-3">
    <!-- Upgrade button -->
    <a
      href="/pricing"
      class="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all hover:shadow-md"
      style="background: var(--orange); color: white"
    >
      <Sparkles size={14} />
      Upgrade
    </a>

    <!-- Theme toggle -->
    <button
      class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-page transition-colors"
      aria-label="Toggle theme"
    >
      <Sun size={18} class="text-text-secondary" />
    </button>

    <!-- Divider -->
    <div class="w-px h-6 bg-border"></div>

    <!-- Account dropdown -->
    <div class="relative">
      <button
        onclick={() => (showDropdown = !showDropdown)}
        class="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-bg-page transition-colors"
      >
        <div
          class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
          style="background: var(--teal)"
        >
          HR
        </div>
        <span class="text-sm font-medium text-text-primary">
          Account
        </span>
        <ChevronDown size={14} class="text-text-muted" />
      </button>

      {#if showDropdown}
        <div
          class="fixed inset-0 z-40"
          onclick={() => (showDropdown = false)}
          role="presentation"
        ></div>
        <div class="absolute right-0 top-full mt-1 w-48 bg-white border border-border rounded-lg shadow-lg z-50 py-1">
          <a
            href="/account"
            class="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-bg-page hover:text-text-primary transition-colors"
            onclick={() => (showDropdown = false)}
          >
            <User size={14} />
            My Account
          </a>
          <a
            href="/pricing"
            class="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-bg-page hover:text-text-primary transition-colors"
            onclick={() => (showDropdown = false)}
          >
            <Sparkles size={14} />
            Upgrade Plan
          </a>
          <hr class="my-1 border-border" />
          <button
            class="w-full flex items-center gap-2 px-4 py-2 text-sm text-danger hover:bg-danger-bg transition-colors"
            onclick={() => (showDropdown = false)}
          >
            Sign Out
          </button>
        </div>
      {/if}
    </div>
  </div>
</header>
