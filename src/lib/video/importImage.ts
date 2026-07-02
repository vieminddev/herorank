/**
 * Import-time image downscaling — keep memory flat by capping every uploaded photo to a sane
 * working size before it ever enters a Scene. A 30 MB / 6000px phone photo becomes a small,
 * fast-to-decode blob; the export still hits 1080p targets comfortably.
 */

/** Long-edge cap applied on import. Above any export target (max 1920) with headroom for cover/zoom. */
const IMPORT_MAX_EDGE = 2400;

/**
 * Downscale `file` to <= {@link IMPORT_MAX_EDGE} on its long edge, returning a JPEG/PNG blob.
 * Returns the original file untouched if it's already small enough or anything fails (best-effort).
 */
export async function downscaleOnImport(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const long = Math.max(bmp.width, bmp.height);
    if (long <= IMPORT_MAX_EDGE) {
      bmp.close();
      return file;
    }
    const ratio = IMPORT_MAX_EDGE / long;
    const w = Math.round(bmp.width * ratio);
    const h = Math.round(bmp.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close();
      return file;
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Rasterize a logo upload to a PNG blob. SVGs are drawn through an <img> onto a canvas so the
 * compositor only ever deals with raster bitmaps. Raster formats pass through unchanged.
 */
export async function rasterizeLogo(file: File): Promise<Blob> {
  if (!file.type.includes('svg')) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('logo load failed'));
      img.src = url;
    });
    const w = img.naturalWidth || 512;
    const h = img.naturalHeight || 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      URL.revokeObjectURL(url);
      return file;
    }
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
    return blob ?? file;
  } catch {
    return file;
  }
}
