<script lang="ts">
  // Global mascot cheer renderer — mount ONCE (root layout). Shows a butterfly toast with a sparkle
  // burst for each real win, auto-dismissing after a few seconds. Respects prefers-reduced-motion
  // (the fly-in is reduced to a simple fade via CSS).
  import { cheers, dismissCheer } from "$lib/mascotCheer";
  import MascotLogo from "./MascotLogo.svelte";
  import SparkleBurst from "./SparkleBurst.svelte";

  // Auto-dismiss a toast ~4.4s after it mounts.
  function autodismiss(_node: HTMLElement, id: number) {
    const t = setTimeout(() => dismissCheer(id), 4400);
    return { destroy: () => clearTimeout(t) };
  }
</script>

<div class="cheer-stack" aria-live="polite" aria-atomic="false">
  {#each $cheers as c (c.id)}
    <div class="cheer-toast" use:autodismiss={c.id} role="status">
      <div class="cheer-mascot">
        <SparkleBurst count={12} />
        <MascotLogo size={40} animate="always" />
      </div>
      <div class="cheer-body">
        <p class="cheer-title">{c.title}</p>
        {#if c.subtitle}<p class="cheer-sub">{c.subtitle}</p>{/if}
      </div>
      <button class="cheer-close" onclick={() => dismissCheer(c.id)} aria-label="Dismiss">×</button>
    </div>
  {/each}
</div>

<style>
  .cheer-stack {
    position: fixed;
    right: 1.25rem;
    bottom: 1.25rem;
    z-index: 90;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    pointer-events: none;
  }
  .cheer-toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    width: min(20rem, calc(100vw - 2.5rem));
    padding: 0.85rem 0.95rem;
    border-radius: var(--radius-lg, 12px);
    background: var(--bg-card, #fff);
    border: 1px solid var(--border, #d6e0db);
    box-shadow: var(--shadow-lg, 0 12px 28px rgba(30, 42, 38, 0.16));
    animation: cheer-in 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .cheer-mascot {
    position: relative;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    color: var(--teal, #00754a);
  }
  .cheer-body {
    flex: 1;
    min-width: 0;
  }
  .cheer-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary, #1e2a26);
    line-height: 1.25;
  }
  .cheer-sub {
    font-size: 0.75rem;
    color: var(--text-secondary, #5b6b65);
    line-height: 1.35;
    margin-top: 1px;
  }
  .cheer-close {
    flex-shrink: 0;
    align-self: flex-start;
    width: 1.25rem;
    height: 1.25rem;
    line-height: 1;
    font-size: 1.1rem;
    color: var(--text-muted, #5b6b65);
    border-radius: var(--radius-sm, 6px);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .cheer-close:hover {
    background: var(--bg-tint, #e9f1ed);
    color: var(--text-primary, #1e2a26);
  }
  @keyframes cheer-in {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .cheer-toast {
      animation: cheer-fade 0.3s ease;
    }
    @keyframes cheer-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  }
</style>
