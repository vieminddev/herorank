/**
 * Animated favicon — flaps the VieRank butterfly in the browser tab while a job is running, so
 * users see activity even when the tab is in the background. Ref-counted: multiple concurrent jobs
 * keep it flapping until the last one finishes. Respects prefers-reduced-motion (no-op then).
 */
let img: HTMLImageElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let raf = 0;
let count = 0;
let last = 0;

const STATIC_HREF = '/favicon.png';

function iconLink(): HTMLLinkElement {
  let l = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!l) {
    l = document.createElement('link');
    l.rel = 'icon';
    document.head.appendChild(l);
  }
  return l;
}

function frame(now: number) {
  if (count <= 0) return;
  // Throttle to ~11fps — toDataURL is the expensive bit; the tab icon is tiny anyway.
  if (now - last < 90) {
    raf = requestAnimationFrame(frame);
    return;
  }
  last = now;
  if (canvas && img && img.complete && img.naturalWidth) {
    const s = 64;
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, s, s);
      // Flap: horizontal squash oscillates (wings fold/open), like the in-app loader.
      const flap = 0.5 + 0.5 * Math.abs(Math.cos(now / 130));
      const w = s * flap;
      ctx.drawImage(img, (s - w) / 2, 0, w, s);
      try {
        iconLink().href = canvas.toDataURL('image/png');
      } catch {
        /* ignore (e.g. tainted canvas — shouldn't happen same-origin) */
      }
    }
  }
  raf = requestAnimationFrame(frame);
}

export function startFaviconFlap(): void {
  if (typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  count += 1;
  if (count > 1) return; // already running
  if (!canvas) canvas = document.createElement('canvas');
  if (!img) {
    img = new Image();
    img.src = '/vierank-logo.png';
  }
  const go = () => {
    if (count > 0) raf = requestAnimationFrame(frame);
  };
  if (img.complete && img.naturalWidth) go();
  else img.onload = go;
}

export function stopFaviconFlap(): void {
  if (typeof document === 'undefined') return;
  count = Math.max(0, count - 1);
  if (count > 0) return;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  iconLink().href = STATIC_HREF; // restore the static butterfly
}
