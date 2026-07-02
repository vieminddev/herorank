/**
 * Decode-once ImageBitmap cache. Both the preview player and the exporter need the scene's image
 * (and logo) blobs as `ImageBitmap`s; decoding on every frame would tank performance, so we decode
 * each blob exactly once, keyed by blob identity, and reuse the bitmap everywhere.
 *
 * Large source images are downscaled on decode so memory stays flat regardless of upload size
 * (a 6000px phone photo becomes at most {@link MAX_EDGE}px on its long edge).
 */

/** Hard cap on a decoded bitmap's long edge — well above any export target, below memory blowups. */
const MAX_EDGE = 2160;

export class BitmapCache {
  private cache = new Map<Blob, ImageBitmap>();
  private pending = new Map<Blob, Promise<ImageBitmap>>();

  /** Get (decoding + caching on first use) the bitmap for a blob. */
  async get(blob: Blob): Promise<ImageBitmap> {
    const hit = this.cache.get(blob);
    if (hit) return hit;
    const inflight = this.pending.get(blob);
    if (inflight) return inflight;

    const p = decodeDownscaled(blob).then((bmp) => {
      this.cache.set(blob, bmp);
      this.pending.delete(blob);
      return bmp;
    });
    this.pending.set(blob, p);
    return p;
  }

  /** Synchronous lookup — returns undefined if not yet decoded (used by the per-frame draw path). */
  peek(blob: Blob): ImageBitmap | undefined {
    return this.cache.get(blob);
  }

  /** Pre-decode a set of blobs (e.g. all slides) and resolve once they're all ready. */
  async warm(blobs: Blob[]): Promise<void> {
    await Promise.all(blobs.map((b) => this.get(b)));
  }

  /** Drop bitmaps no longer referenced by `keep`; closes them to free GPU/CPU memory. */
  prune(keep: Iterable<Blob>): void {
    const live = new Set(keep);
    for (const [blob, bmp] of this.cache) {
      if (!live.has(blob)) {
        bmp.close();
        this.cache.delete(blob);
      }
    }
  }

  /** Release everything. */
  clear(): void {
    for (const bmp of this.cache.values()) bmp.close();
    this.cache.clear();
    this.pending.clear();
  }
}

/** Decode a blob to an ImageBitmap, downscaling so the long edge is <= MAX_EDGE. */
async function decodeDownscaled(blob: Blob): Promise<ImageBitmap> {
  const full = await createImageBitmap(blob);
  const long = Math.max(full.width, full.height);
  if (long <= MAX_EDGE) return full;
  const ratio = MAX_EDGE / long;
  const w = Math.round(full.width * ratio);
  const h = Math.round(full.height * ratio);
  const scaled = await createImageBitmap(full, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  full.close();
  return scaled;
}
