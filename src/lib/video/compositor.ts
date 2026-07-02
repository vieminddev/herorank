/**
 * Compositor — the ONE function that turns a `Scene` + a time `t` into a rendered canvas frame.
 *
 * Both the live preview (rAF loop) and the exporters (WebCodecs / MediaRecorder) call
 * {@link drawFrameAt}, guaranteeing the preview matches the exported file pixel-for-pixel.
 *
 * `drawFrameAt` is synchronous and cheap: it never decodes images. Callers pass a
 * {@link SceneAssets} bundle holding the already-decoded `ImageBitmap`s (slides + logo), produced
 * by {@link buildAssets} from a {@link BitmapCache}. Captions/outro are drawn directly with the 2D
 * text API (no decoding needed).
 */
import {
  type Scene,
  type Timeline,
  type KenBurns,
  type Pos9,
  type TransitionType,
  type CaptionOverlay,
  aspectDims,
  buildTimeline,
  resolveFrame,
} from './scene';
import type { BitmapCache } from './bitmapCache';

/** A 2D context from either an on-screen or offscreen canvas. */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Decoded bitmaps for one scene, addressed positionally (slide bitmaps share scene.slides order). */
export interface SceneAssets {
  slides: (ImageBitmap | undefined)[];
  logo?: ImageBitmap;
}

/** Build the decoded-asset bundle for a scene from a warm cache (synchronous peeks). */
export function buildAssets(scene: Scene, cache: BitmapCache): SceneAssets {
  return {
    slides: scene.slides.map((s) => cache.peek(s.src)),
    logo: scene.logo ? cache.peek(scene.logo.src) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Image fitting + Ken Burns
// ---------------------------------------------------------------------------

/** linear interpolate */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** smoothstep easing for gentler Ken Burns / fades */
const ease = (t: number) => t * t * (3 - 2 * t);

interface KbState {
  scale: number;
  /** Extra pan offset as a fraction of the cover overflow, −0.5..0.5. */
  panX: number;
  panY: number;
}

function kenBurnsState(kb: KenBurns | undefined, progress: number): KbState {
  if (!kb) return { scale: 1, panX: 0, panY: 0 };
  const p = ease(Math.min(1, Math.max(0, progress)));
  const scale = lerp(kb.fromScale, kb.toScale, p);
  let panX = 0;
  let panY = 0;
  const amt = lerp(-0.5, 0.5, p); // travel across available overflow
  switch (kb.pan) {
    case 'lr': panX = amt; break;
    case 'rl': panX = -amt; break;
    case 'up': panY = -amt; break;
    case 'down': panY = amt; break;
    // 'in'/'out'/undefined → pure zoom, centered
  }
  return { scale, panX, panY };
}

/**
 * Draw `img` covering the w×h frame (object-fit: cover) with an extra Ken Burns scale/pan and a
 * global alpha. The base cover scale already fills the frame; `kb.scale` zooms further and the pan
 * shifts within the cropped overflow.
 */
function drawImage(
  ctx: Ctx2D,
  img: ImageBitmap,
  w: number,
  h: number,
  alpha: number,
  kb: KbState
): void {
  const cover = Math.max(w / img.width, h / img.height);
  const scale = cover * kb.scale;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const overflowX = dw - w;
  const overflowY = dh - h;
  const dx = -overflowX / 2 + kb.panX * overflowX;
  const dy = -overflowY / 2 + kb.panY * overflowY;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.globalAlpha = 1;
}

/** Fill the frame with the background color (used as letterbox fill instead of black bars). */
function fillBackground(ctx: Ctx2D, w: number, h: number, bg: string): void {
  ctx.fillStyle = bg || '#000';
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Transitions between an outgoing and incoming slide
// ---------------------------------------------------------------------------

function drawTransition(
  ctx: Ctx2D,
  type: TransitionType,
  dir: 'left' | 'right' | 'up' | 'down',
  from: ImageBitmap,
  to: ImageBitmap,
  fromKb: KbState,
  toKb: KbState,
  f: number, // 0→1
  w: number,
  h: number
): void {
  const e = ease(f);
  switch (type) {
    case 'fade':
    case 'dissolve': {
      // dissolve = fade with a slightly snappier curve; both crossfade alpha.
      const a = type === 'dissolve' ? f : e;
      drawImage(ctx, from, w, h, 1, fromKb);
      drawImage(ctx, to, w, h, a, toKb);
      return;
    }
    case 'zoom': {
      // Outgoing stays; incoming scales up from 0.6→1 while fading in.
      drawImage(ctx, from, w, h, 1, fromKb);
      const zk: KbState = { ...toKb, scale: toKb.scale * lerp(1.25, 1, e) };
      drawImage(ctx, to, w, h, e, zk);
      return;
    }
    case 'slide': {
      // Incoming slides over the outgoing from `dir`.
      const offX = dir === 'left' ? lerp(w, 0, e) : dir === 'right' ? lerp(-w, 0, e) : 0;
      const offY = dir === 'up' ? lerp(h, 0, e) : dir === 'down' ? lerp(-h, 0, e) : 0;
      drawImage(ctx, from, w, h, 1, fromKb);
      ctx.save();
      ctx.translate(offX, offY);
      drawImage(ctx, to, w, h, 1, toKb);
      ctx.restore();
      return;
    }
    case 'none':
    default:
      drawImage(ctx, to, w, h, 1, toKb);
  }
}

// ---------------------------------------------------------------------------
// Overlays — logo + captions + outro
// ---------------------------------------------------------------------------

/** Compute a top-left anchor for an object of size ow×oh at a 9-grid position, with `pad` margin. */
function anchor(pos: Pos9, w: number, h: number, ow: number, oh: number, pad: number): { x: number; y: number } {
  const col = pos[1]; // l|c|r
  const row = pos[0]; // t|m|b|c — note 'c' center uses both
  let x = pad;
  let y = pad;
  if (pos === 'c') return { x: (w - ow) / 2, y: (h - oh) / 2 };
  if (col === 'c') x = (w - ow) / 2;
  else if (col === 'r') x = w - ow - pad;
  if (row === 't') y = pad;
  else if (row === 'm') y = (h - oh) / 2;
  else if (row === 'b') y = h - oh - pad;
  return { x, y };
}

function drawLogo(ctx: Ctx2D, logo: ImageBitmap, scene: Scene, w: number, h: number): void {
  const o = scene.logo!;
  const targetW = Math.max(8, w * o.scale);
  const ratio = logo.height / logo.width;
  const targetH = targetW * ratio;
  const pad = Math.round(w * 0.04);
  const { x, y } = anchor(o.pos, w, h, targetW, targetH, pad);
  ctx.globalAlpha = Math.min(1, Math.max(0, o.opacity));
  ctx.drawImage(logo, x, y, targetW, targetH);
  ctx.globalAlpha = 1;
}

function drawCaption(ctx: Ctx2D, cap: CaptionOverlay, slideElapsed: number, w: number, h: number): void {
  const text = cap.text.trim();
  if (!text) return;
  const sizeRel = cap.sizeRel ?? 0.06;
  const fontPx = Math.round(h * sizeRel);
  ctx.font = `700 ${fontPx}px ${cap.font}`;
  ctx.textBaseline = 'top';
  const pad = Math.round(w * 0.05);

  // Word-wrap to ~85% width.
  const maxW = w - pad * 2;
  const lines = wrap(ctx, text, maxW);
  const lineH = fontPx * 1.2;
  const blockH = lines.length * lineH;
  const blockW = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)));
  const { x, y } = anchor(cap.pos, w, h, blockW + pad * 0.8, blockH + pad * 0.6, pad);

  const alpha = cap.animate ? Math.min(1, slideElapsed / 0.4) : 1;
  ctx.globalAlpha = alpha;

  if (cap.bg) {
    ctx.fillStyle = cap.bg;
    roundRect(ctx, x - pad * 0.4, y - pad * 0.3, blockW + pad * 0.8, blockH + pad * 0.6, fontPx * 0.25);
    ctx.fill();
  }
  ctx.fillStyle = cap.color;
  ctx.textAlign = 'left';
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineH));
  ctx.globalAlpha = 1;
}

function wrap(ctx: Ctx2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const tryLine = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(tryLine).width > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = tryLine;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawOutro(ctx: Ctx2D, scene: Scene, assets: SceneAssets, w: number, h: number, fadeAlpha: number): void {
  const o = scene.outro!;
  fillBackground(ctx, w, h, o.bg);
  ctx.globalAlpha = fadeAlpha;
  const color = o.color ?? '#ffffff';

  let cy = h / 2;
  if (o.showLogo && assets.logo) {
    const lw = w * 0.28;
    const lh = lw * (assets.logo.height / assets.logo.width);
    ctx.drawImage(assets.logo, (w - lw) / 2, h * 0.5 - lh - h * 0.12, lw, lh);
  }

  if (o.shopName) {
    const sz = Math.round(h * 0.05);
    ctx.font = `600 ${sz}px Georgia, serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.shopName, w / 2, cy - h * 0.05);
    cy += h * 0.03;
  }
  const big = Math.round(h * 0.08);
  ctx.font = `800 ${big}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(o.text || 'Shop now', w / 2, cy + h * 0.04);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

/**
 * Render the composite frame at time `t` (seconds) onto `ctx`. Pure function of (scene, assets, t):
 * the only mutable thing it touches is the canvas. Missing bitmaps (still decoding) are drawn as
 * the background fill so the preview never throws while warming.
 */
export function drawFrameAt(
  ctx: Ctx2D,
  scene: Scene,
  assets: SceneAssets,
  t: number,
  tl: Timeline,
  w: number,
  h: number
): void {
  fillBackground(ctx, w, h, scene.background);

  // Outro segment.
  if (scene.outro && t >= tl.slidesTotal) {
    const ot = t - tl.slidesTotal;
    const fade = Math.min(1, ot / 0.4);
    drawOutro(ctx, scene, assets, w, h, fade);
    return;
  }

  if (scene.slides.length === 0) return;

  const fs = resolveFrame(Math.min(t, tl.slidesTotal), tl);
  const cur = assets.slides[fs.idx];
  const slide = scene.slides[fs.idx];
  const curKb = kenBurnsState(slide?.kenBurns, slide ? fs.slideElapsed / Math.max(0.4, slide.durationSec) : 0);

  if (fs.next !== null && fs.transFactor !== null) {
    const nextBmp = assets.slides[fs.next];
    const nextSlide = scene.slides[fs.next];
    const nextKb = kenBurnsState(nextSlide?.kenBurns, 0);
    if (cur && nextBmp) {
      drawTransition(
        ctx,
        scene.transition.type,
        scene.transition.dir ?? 'left',
        cur,
        nextBmp,
        curKb,
        nextKb,
        fs.transFactor,
        w,
        h
      );
    } else if (cur) {
      drawImage(ctx, cur, w, h, 1, curKb);
    } else if (nextBmp) {
      drawImage(ctx, nextBmp, w, h, 1, nextKb);
    }
  } else if (cur) {
    drawImage(ctx, cur, w, h, 1, curKb);
  }

  // Overlays drawn on top, every frame.
  if (scene.captions) {
    for (const cap of scene.captions) {
      if (cap.scope === 'global' || cap.scope === fs.idx) {
        drawCaption(ctx, cap, fs.slideElapsed, w, h);
      }
    }
  }
  if (scene.logo && assets.logo) {
    drawLogo(ctx, assets.logo, scene, w, h);
  }
}

/** Convenience: dims + timeline for a scene (used by callers setting up canvases). */
export function sceneFrameInfo(scene: Scene): { width: number; height: number; tl: Timeline } {
  const { width, height } = aspectDims(scene.aspect);
  return { width, height, tl: buildTimeline(scene) };
}
