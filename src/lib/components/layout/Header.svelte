<script lang="ts">
  import { LogOut, CreditCard, Menu } from "lucide-svelte";
  import { signOut } from "$lib/auth-client";
  import MascotLogo from "$lib/components/ui/MascotLogo.svelte";

  let { user, credits, subscription, onToggleSidebar }: {
    user: { id: string; name: string; email: string } | null;
    credits: { balance: number };
    subscription: { plan: string; status: string };
    onToggleSidebar?: () => void;
  } = $props();

  async function handleSignOut() {
    await signOut();
    window.location.href = "/";
  }
</script>

<header class="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-border/50">
  <div class="flex items-center justify-between px-6 py-3">
    <div class="flex items-center gap-2">
      <button
        onclick={onToggleSidebar}
        class="md:hidden p-2 -ml-2 rounded-lg hover:bg-bg-page text-text-muted hover:text-text-primary transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu size={18} />
      </button>
      <a href="/dashboard" class="flex items-center gap-2 hover:opacity-80 transition-opacity group">
        <MascotLogo size={32} animate="hover" />
        <span class="text-lg font-semibold text-text-primary">VieRank</span>
      </a>
    </div>


    <div class="flex items-center gap-2 sm:gap-4">
      <!-- Credits badge -->
      <div class="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-lg bg-bg-page border border-border text-sm">
        <CreditCard size={14} class="text-teal" />
        <span class="font-semibold text-text-primary">{credits?.balance ?? 0}</span>
        <span class="text-text-muted hidden sm:inline">credits</span>
      </div>

      <!-- Plan badge -->
      <span class="hidden sm:inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize
        {subscription?.plan === 'free' ? 'bg-gray-100 text-gray-600' :
         subscription?.plan === 'business' ? 'bg-teal/10 text-teal' :
         'bg-orange/10 text-orange'}">
        {subscription?.plan ?? 'free'}
      </span>

      <!-- User -->
      {#if user}
        <span class="hidden md:inline text-sm text-text-secondary">{user.name || user.email}</span>
        <button
          onclick={handleSignOut}
          class="p-2 rounded-lg hover:bg-bg-page text-text-muted hover:text-text-primary transition-colors"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      {/if}
    </div>
  </div>
</header>
