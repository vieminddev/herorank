/**
 * Image provenance re-branding (AI Image Studio).
 *
 * The upstream image provider (Google Imagen via the LLM gateway) embeds a SIGNED C2PA
 * manifest (APP11/JUMBF) identifying "Google LLC" + an EXIF block + XMP. We white-label the
 * OUTPUT so a casual metadata inspection shows "VieRank AI" instead of the vendor — while
 * staying HONEST that the asset is AI-generated (Etsy requires AI disclosure, and it matches
 * VieRank's transparency positioning).
 *
 * What this does:
 *   - JPEG: drop APP1 (old EXIF/XMP), APP11 (C2PA/JUMBF), APP13 (IPTC), APP2 (ICC/C2PA) and
 *     inject a fresh EXIF APP1 with VieRank Make/Software/Artist/Copyright + an honest
 *     "AI-generated" ImageDescription.
 *   - PNG: strip metadata-bearing ancillary chunks (tEXt/iTXt/zTXt/eXIf/caBX…) and add tEXt
 *     Software + Description chunks.
 *
 * It does NOT (and cannot) remove the invisible SynthID pixel watermark — that lives in the
 * pixels, survives re-encoding, and still lets Google detect AI origin. This is by design.
 *
 * Pure functions over byte arrays — no FFmpeg / native deps (runs in Cloudflare Workers).
 */

const BRAND = {
  description: 'AI-generated image, created with VieRank AI',
  make: 'VieRank',
  software: 'VieRank AI',
  artist: 'VieRank',
  copyright: '© 2026 VieRank (vierank.com)',
};

/** Build a minimal big-endian (MM) EXIF APP1 segment with ASCII IFD0 tags. */
function buildExifApp1(): Uint8Array {
  const enc = new TextEncoder();
  const fields: { tag: number; text: string }[] = [
    { tag: 0x010e, text: BRAND.description }, // ImageDescription (honest AI disclosure)
    { tag: 0x010f, text: BRAND.make }, // Make
    { tag: 0x0131, text: BRAND.software }, // Software
    { tag: 0x013b, text: BRAND.artist }, // Artist
    { tag: 0x8298, text: BRAND.copyright }, // Copyright
  ].sort((a, b) => a.tag - b.tag);

  const entries = fields.map((f) => {
    const b = enc.encode(f.text);
    const data = new Uint8Array(b.length + 1); // NUL-terminated ASCII
    data.set(b, 0);
    return { tag: f.tag, data };
  });

  const n = entries.length;
  const ifdStart = 8; // after TIFF header
  const ifdSize = 2 + 12 * n + 4; // count + entries + next-IFD offset
  const dataArr: number[] = [];
  const recs = entries.map((e) => {
    const count = e.data.length;
    const inline = count <= 4;
    const vb = new Uint8Array(4);
    let off = 0;
    if (inline) {
      vb.set(e.data.subarray(0, count), 0);
    } else {
      off = ifdStart + ifdSize + dataArr.length;
      for (const x of e.data) dataArr.push(x);
      if (dataArr.length % 2) dataArr.push(0); // keep word-aligned
    }
    return { tag: e.tag, count, inline, vb, off };
  });

  const tiffSize = ifdStart + ifdSize + dataArr.length;
  const tiff = new Uint8Array(tiffSize);
  const dv = new DataView(tiff.buffer);
  tiff[0] = 0x4d; // 'M'
  tiff[1] = 0x4d; // 'M' → big-endian
  dv.setUint16(2, 42);
  dv.setUint32(4, 8); // IFD0 offset
  let p = ifdStart;
  dv.setUint16(p, n);
  p += 2;
  for (const r of recs) {
    dv.setUint16(p, r.tag);
    dv.setUint16(p + 2, 2); // type = ASCII
    dv.setUint32(p + 4, r.count);
    if (r.inline) {
      tiff[p + 8] = r.vb[0];
      tiff[p + 9] = r.vb[1];
      tiff[p + 10] = r.vb[2];
      tiff[p + 11] = r.vb[3];
    } else {
      dv.setUint32(p + 8, r.off);
    }
    p += 12;
  }
  dv.setUint32(p, 0); // no next IFD
  for (let k = 0; k < dataArr.length; k++) tiff[ifdStart + ifdSize + k] = dataArr[k];

  const payloadLen = 6 + tiffSize; // "Exif\0\0" + TIFF
  const segLen = 2 + payloadLen; // length field counts itself
  const out = new Uint8Array(2 + segLen);
  const o = new DataView(out.buffer);
  out[0] = 0xff;
  out[1] = 0xe1; // APP1
  o.setUint16(2, segLen);
  out[4] = 0x45; // E
  out[5] = 0x78; // x
  out[6] = 0x69; // i
  out[7] = 0x66; // f
  out[8] = 0;
  out[9] = 0;
  out.set(tiff, 10);
  return out;
}

/** Markers to drop from JPEG (vendor metadata). Keep APP0/JFIF + image data. */
const JPEG_DROP = new Set([0xe1, 0xeb, 0xed, 0xe2]); // APP1(EXIF/XMP), APP11(C2PA), APP13(IPTC), APP2(ICC/C2PA)

function rebrandJpeg(buf: Uint8Array): Uint8Array {
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) return buf; // not JPEG
  const out: number[] = [0xff, 0xd8];
  const exif = buildExifApp1();
  for (let k = 0; k < exif.length; k++) out.push(exif[k]);
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      out.push(buf[i]);
      i++;
      continue;
    }
    const m = buf[i + 1];
    if (m === 0xda) {
      // Start of scan — copy the rest (entropy data + EOI) verbatim.
      for (let k = i; k < buf.length; k++) out.push(buf[k]);
      break;
    }
    if (m === 0xd9) {
      out.push(0xff, 0xd9);
      i += 2;
      continue;
    }
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      out.push(0xff, m);
      i += 2;
      continue;
    }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (!JPEG_DROP.has(m)) {
      for (let k = i; k < i + 2 + len; k++) out.push(buf[k]);
    }
    i += 2 + len;
  }
  return new Uint8Array(out);
}

// --- PNG ---------------------------------------------------------------------
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Metadata-bearing ancillary chunks to strip (incl. C2PA `caBX`, EXIF, text).
const PNG_DROP = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'caBX', 'iCCP']);

let CRC_TABLE: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngTextChunk(keyword: string, text: string): number[] {
  const enc = new TextEncoder();
  const body = [...enc.encode(keyword), 0, ...enc.encode(text)]; // tEXt: keyword \0 text (Latin-1)
  const typeAndBody = [...enc.encode('tEXt'), ...body];
  const len = body.length;
  const crc = crc32(new Uint8Array(typeAndBody));
  return [
    (len >>> 24) & 0xff,
    (len >>> 16) & 0xff,
    (len >>> 8) & 0xff,
    len & 0xff,
    ...typeAndBody,
    (crc >>> 24) & 0xff,
    (crc >>> 16) & 0xff,
    (crc >>> 8) & 0xff,
    crc & 0xff,
  ];
}

function rebrandPng(buf: Uint8Array): Uint8Array {
  for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIG[i]) return buf; // not PNG
  const dec = new TextDecoder('latin1');
  const out: number[] = [...PNG_SIG];
  let i = 8;
  let insertedAfterIHDR = false;
  while (i + 8 <= buf.length) {
    const len = (buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3];
    const type = dec.decode(buf.subarray(i + 4, i + 8));
    const chunkEnd = i + 12 + len; // length(4)+type(4)+data(len)+crc(4)
    if (!PNG_DROP.has(type)) {
      for (let k = i; k < chunkEnd; k++) out.push(buf[k]);
      // Inject our text right after IHDR so it survives + sits early.
      if (type === 'IHDR' && !insertedAfterIHDR) {
        out.push(...pngTextChunk('Software', BRAND.software));
        out.push(...pngTextChunk('Description', BRAND.description));
        out.push(...pngTextChunk('Copyright', BRAND.copyright));
        insertedAfterIHDR = true;
      }
    }
    if (type === 'IEND') break;
    i = chunkEnd;
  }
  return new Uint8Array(out);
}

/**
 * Re-brand an image's provenance metadata to VieRank (honest AI disclosure kept). Returns the
 * input unchanged if it isn't a recognized JPEG/PNG, or on any failure (never throws).
 */
export function rebrandImageMetadata(bytes: Uint8Array): Uint8Array {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return rebrandJpeg(bytes);
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return rebrandPng(bytes);
    return bytes;
  } catch {
    return bytes;
  }
}

/** Base64 (no data: prefix) → bytes. */
export function b64ToBytes(b64: string): Uint8Array {
  const raw = b64.includes(',') && b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Bytes → base64 (chunked to avoid call-stack limits on large buffers). */
export function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Convenience: rebrand a base64 image in-place, returning new base64 (or the original on failure). */
export function rebrandImageB64(b64: string): string {
  try {
    return bytesToB64(rebrandImageMetadata(b64ToBytes(b64)));
  } catch {
    return b64;
  }
}
