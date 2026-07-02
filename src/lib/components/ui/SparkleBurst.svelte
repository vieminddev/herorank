<script lang="ts">
  // One-shot celebratory sparkle burst — drop inside a `position: relative` container and mount it
  // (e.g. {#if justDone}<SparkleBurst />{/if}) when a result appears. Plays once, then fades out.
  let { count = 14 }: { count?: number } = $props();
  const sparkles = Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const dist = 42 + Math.random() * 60;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      delay: Math.random() * 0.14,
      size: 8 + Math.random() * 10,
      gold: Math.random() > 0.5,
    };
  });
</script>

<div class="sparkle-burst" aria-hidden="true">
  {#each sparkles as s}
    <span class="spk" class:gold={s.gold} style="--x:{s.x}px; --y:{s.y}px; --d:{s.delay}s; --sz:{s.size}px;">✦</span>
  {/each}
</div>

<style>
  .sparkle-burst {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
    z-index: 6;
  }
  .spk {
    position: absolute;
    left: 50%;
    top: 50%;
    font-size: var(--sz);
    line-height: 1;
    color: var(--teal, #00754a);
    opacity: 0;
    transform: translate(-50%, -50%) scale(0);
    animation: spk-fly 0.95s var(--d) cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  .spk.gold { color: var(--orange, #cba258); }
  @keyframes spk-fly {
    0%   { opacity: 0; transform: translate(-50%, -50%) scale(0) rotate(0deg); }
    25%  { opacity: 1; transform: translate(calc(-50% + var(--x) * 0.55), calc(-50% + var(--y) * 0.55)) scale(1.15) rotate(50deg); }
    100% { opacity: 0; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(0.35) rotate(130deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .spk { animation: none; opacity: 0; }
  }
</style>
