<script lang="ts">
  /**
   * Custom on-brand error page (404 + 5xx). SvelteKit renders this for any uncaught
   * load/render error or 404. We read `page.status` / `page.error` from `$app/state`.
   *
   * 404 → "we couldn't find that" (calm, navigational). 5xx → "something broke on our
   * end" (reassuring, retry-able). Recovery actions: dashboard, browse tools, home.
   */
  import { page } from "$app/state";
  import { TriangleAlert, LayoutDashboard, Wrench, House, RotateCw } from "lucide-svelte";
  import MascotLogo from "$lib/components/ui/MascotLogo.svelte";

  const status = $derived(page.status);
  const isNotFound = $derived(status === 404);
  const message = $derived(page.error?.message ?? "");

  const heading = $derived(isNotFound ? "We couldn't find that page" : "Something broke on our end");
  const blurb = $derived(
    isNotFound
      ? "The page you're after may have moved, been renamed, or never existed. Let's get you back to where the work is."
      : "An unexpected error tripped us up — not you. Try again in a moment, or jump back to your workspace below."
  );
</script>

<svelte:head>
  <title>{isNotFound ? "Page not found" : "Something went wrong"} · VieRank</title>
</svelte:head>

<main class="min-h-screen bg-tint flex items-center justify-center px-5 py-16">
  <div class="w-full max-w-xl text-center animate-fade-in">
    <!-- Brand mark -->
    <p class="section-kicker !text-teal mb-6">VieRank</p>

    {#if isNotFound}
      <!-- Lost butterfly: the mascot wanders along a dashed flight path, looking for the page. -->
      <div class="mascot-scene mx-auto mb-7" aria-hidden="true">
        <svg class="flight-path" viewBox="0 0 220 100" fill="none" preserveAspectRatio="none">
          <path
            d="M16 74 C 56 14, 96 96, 132 46 S 188 22, 204 64"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-dasharray="5 8"
            stroke-linecap="round"
          />
        </svg>
        <div class="lost-butterfly">
          <MascotLogo size={48} animate="always" />
        </div>
      </div>
    {:else}
      <div class="mx-auto mb-7 w-16 h-16 rounded-2xl flex items-center justify-center border shadow-sm bg-warn-icon">
        <TriangleAlert size={30} style="color: var(--orange)" />
      </div>
    {/if}

    <div
      class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border mb-4"
      class:status-404={isNotFound}
      class:status-5xx={!isNotFound}
    >
      Error {status}
    </div>

    <h1 class="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary leading-tight">
      {heading}
    </h1>
    <p class="lead mt-3 text-text-secondary max-w-md mx-auto leading-relaxed">{blurb}</p>

    {#if message && !isNotFound}
      <p class="mt-4 text-xs text-text-muted font-mono break-words max-w-md mx-auto">{message}</p>
    {/if}

    <!-- Recovery actions -->
    <div class="mt-9 flex flex-wrap items-center justify-center gap-3">
      <a href="/dashboard" class="btn btn-primary !py-2.5 !px-5 text-sm font-bold min-h-[44px]">
        <LayoutDashboard size={16} /> Back to dashboard
      </a>
      <a href="/tools" class="btn btn-secondary !py-2.5 !px-5 text-sm font-bold min-h-[44px]">
        <Wrench size={16} /> Browse tools
      </a>
      {#if isNotFound}
        <a
          href="/"
          class="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] text-sm font-semibold text-text-secondary hover:text-teal transition-colors"
        >
          <House size={16} /> Go home
        </a>
      {:else}
        <button
          type="button"
          onclick={() => location.reload()}
          class="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] text-sm font-semibold text-text-secondary hover:text-teal transition-colors"
        >
          <RotateCw size={16} /> Try again
        </button>
      {/if}
    </div>
  </div>
</main>

<style>
  /* Lost-butterfly 404 scene */
  .mascot-scene {
    position: relative;
    width: 220px;
    height: 100px;
  }
  .flight-path {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    color: color-mix(in srgb, var(--teal) 35%, transparent);
  }
  .lost-butterfly {
    position: absolute;
    top: 0;
    left: 0;
    color: var(--teal);
    will-change: transform;
    animation: lost-wander 7s ease-in-out infinite alternate;
  }
  @keyframes lost-wander {
    0%   { transform: translate(0px, 50px) rotate(-8deg); }
    25%  { transform: translate(48px, 4px) rotate(7deg); }
    50%  { transform: translate(104px, 44px) rotate(-6deg); }
    75%  { transform: translate(150px, 8px) rotate(8deg); }
    100% { transform: translate(172px, 42px) rotate(-4deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .lost-butterfly {
      animation: none;
      transform: translate(86px, 26px);
    }
  }
  .bg-warn-icon {
    background: color-mix(in srgb, var(--orange) 12%, white);
    border-color: color-mix(in srgb, var(--orange) 22%, white);
  }
  .status-404 {
    color: var(--teal);
    background: color-mix(in srgb, var(--teal) 8%, white);
    border-color: color-mix(in srgb, var(--teal) 18%, white);
  }
  .status-5xx {
    color: var(--orange-dark);
    background: color-mix(in srgb, var(--orange) 12%, white);
    border-color: color-mix(in srgb, var(--orange) 25%, white);
  }
</style>
