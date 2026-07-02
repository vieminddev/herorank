import { describe, it, expect } from 'vitest';
import { rebrandImageMetadata, b64ToBytes, bytesToB64 } from '../src/lib/server/services/imageMetadata';

const enc = new TextEncoder();
const dec = new TextDecoder('latin1');
const has = (b: Uint8Array, s: string) => dec.decode(b).includes(s);

/** Minimal synthetic JPEG: SOI + APP1(EXIF w/ "Google") + APP11(C2PA "c2pa") + SOS + data + EOI. */
function fakeGoogleJpeg(): Uint8Array {
  const seg = (marker: number, payload: number[]) => {
    const len = payload.length + 2;
    return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
  };
  const app1 = seg(0xe1, [...enc.encode('Exif'), 0, 0, ...enc.encode('Made by Google LLC')]);
  const app11 = seg(0xeb, [...enc.encode('JP  jumb c2pa SynthID watermark')]);
  const sos = [0xff, 0xda, 0x00, 0x03, 0x01, 0x11, 0x55, 0x66]; // SOS + entropy bytes
  return new Uint8Array([0xff, 0xd8, ...app1, ...app11, ...sos, 0xff, 0xd9]);
}

describe('rebrandImageMetadata (JPEG)', () => {
  const out = rebrandImageMetadata(fakeGoogleJpeg());

  it('keeps a valid JPEG envelope', () => {
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8); // SOI
    expect(out[out.length - 2]).toBe(0xff);
    expect(out[out.length - 1]).toBe(0xd9); // EOI
  });

  it('strips the provider (Google / C2PA) markers', () => {
    expect(has(out, 'Google')).toBe(false);
    expect(has(out, 'c2pa')).toBe(false);
    expect(has(out, 'jumb')).toBe(false);
  });

  it('injects VieRank branding + honest AI disclosure', () => {
    expect(has(out, 'VieRank AI')).toBe(true);
    expect(has(out, 'AI-generated')).toBe(true);
  });

  it('preserves the SOS marker + entropy-coded scan data', () => {
    expect(out.includes(0xda)).toBe(true); // SOS marker survives
    expect(out.includes(0x55)).toBe(true); // trailing entropy bytes survive
    expect(out.includes(0x66)).toBe(true);
  });

  it('leaves non-image bytes untouched', () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5]);
    expect(rebrandImageMetadata(junk)).toEqual(junk);
  });
});

describe('base64 round-trip', () => {
  it('encodes and decodes bytes losslessly', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 128, 64]);
    expect(Array.from(b64ToBytes(bytesToB64(bytes)))).toEqual(Array.from(bytes));
  });
});
