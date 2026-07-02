<script lang="ts">
  // Live preview player — drives a <canvas> with a rAF loop calling the SHARED compositor
  // (drawFrameAt), so what plays here is exactly what the exporter writes. Decodes each image to an
  // ImageBitmap once (via a BitmapCache) and caches it. Supports play/pause, a scrub slider bound
  // to time, and keyboard shortcuts (Space, ←/→, Ctrl+Enter to export).
  import { onDestroy } from "svelte";
  import { Play, Pause, RotateCcw } from "lucide-svelte";
  import type { Scene } from "$lib/video/scene";
  import { aspectDims, buildTimeline } from "$lib/video/scene";
  import { drawFrameAt, buildAssets } from "$lib/video/compositor";
  import { BitmapCache } from "$lib/video/bitmapCache";

  let { scene, onExport }: { scene: Scene; onExport?: () => void } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let playing = $state(false);
  let time = $state(0);
  let cacheReady = $state(0); // bumped when new bitmaps decode, to force a repaint

  const cache = new BitmapCache();

  const dims = $derived(aspectDims(scene.aspect));
  const tl = $derived(buildTimeline(scene));
  const total = $derived(tl.total);

  // Warm the cache whenever the scene's source blobs change. Keep only live blobs.
  $effect(() => {
    const blobs = scene.slides.map((s) => s.src);
    if (scene.logo) blobs.push(scene.logo.src);
    cache.prune(blobs);
    let cancelled = false;
    cache.warm(blobs).then(() => {
      if (!cancelled) cacheReady++;
    });
    return () => {
      cancelled = true;
    };
  });

  // Paint whenever time / scene / cache changes (covers the paused + scrub case).
  $effect(() => {
    // touch reactive deps so this re-runs
    void time;
    void scene;
    void cacheReady;
    void dims;
    paint(time);
  });

  function paint(t: number) {
    const c = canvas;
    if (!c) return;
    if (c.width !== dims.width || c.height !== dims.height) {
      c.width = dims.width;
      c.height = dims.height;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const assets = buildAssets(scene, cache);
    drawFrameAt(ctx, scene, assets, Math.min(t, total), buildTimeline(scene), c.width, c.height);
  }

  let rafId = 0;
  let lastTs = 0;
  function loop(ts: number) {
    if (!playing) return;
    const dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    time = time + dt;
    if (time >= total) {
      time = total;
      playing = false;
    }
    paint(time);
    if (playing) rafId = requestAnimationFrame(loop);
  }

  export function play() {
    if (playing || !scene.slides.length) return;
    if (time >= total) time = 0;
    playing = true;
    lastTs = 0;
    rafId = requestAnimationFrame(loop);
  }
  export function pause() {
    playing = false;
    cancelAnimationFrame(rafId);
  }
  export function toggle() {
    playing ? pause() : play();
  }
  export function restart() {
    time = 0;
    paint(0);
  }
  function scrub(delta: number) {
    pause();
    time = Math.min(total, Math.max(0, time + delta));
  }
  function onSlider(e: Event) {
    pause();
    time = parseFloat((e.currentTarget as HTMLInputElement).value);
  }

  function onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === " ") {
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      scrub(e.shiftKey ? 1 : 0.1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrub(e.shiftKey ? -1 : -0.1);
    } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onExport?.();
    }
  }

  const fmt = (s: number) => `${s.toFixed(1)}s`;

  onDestroy(() => {
    cancelAnimationFrame(rafId);
    cache.clear();
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="flex flex-col gap-3">
  <div
    class="rounded-xl overflow-hidden bg-black/90 flex items-center justify-center mx-auto w-full"
    style="aspect-ratio: {dims.width}/{dims.height}; max-height: 62vh;"
  >
    <canvas bind:this={canvas} class="w-full h-full object-contain" aria-label="Video preview"></canvas>
  </div>

  <div class="flex items-center gap-3">
    <button
      type="button"
      class="btn btn-secondary !px-3 shrink-0"
      onclick={toggle}
      disabled={!scene.slides.length}
      aria-label={playing ? "Pause" : "Play"}
    >
      {#if playing}<Pause size={16} />{:else}<Play size={16} />{/if}
    </button>
    <button type="button" class="btn btn-secondary !px-3 shrink-0" onclick={restart} aria-label="Restart">
      <RotateCcw size={15} />
    </button>
    <input
      type="range"
      min="0"
      max={total || 0.1}
      step="0.05"
      value={time}
      oninput={onSlider}
      class="flex-1 accent-teal"
      aria-label="Scrub timeline"
    />
    <span class="text-xs tabular-nums text-text-muted shrink-0 w-20 text-right">{fmt(time)} / {fmt(total)}</span>
  </div>
  <p class="field-hint">Space play/pause · ←/→ scrub (Shift = 1s) · Ctrl+Enter export</p>
</div>
