/**
 * Background-music encoding — best-effort, fully isolated so it can never block the video path.
 *
 * Path: decode the uploaded audio with `AudioContext.decodeAudioData`, apply gain + fade in/out,
 * trim/loop to the video length, then encode to AAC with WebCodecs `AudioEncoder` and hand the
 * chunks to the caller (the exporter muxes them into the MP4 audio track).
 *
 * If `AudioEncoder` is unsupported, {@link isAudioEncodeSupported} returns false and the exporter
 * degrades to a silent video plus a UI notice — it never throws.
 */
import type { AudioTrack } from './scene';

const SAMPLE_RATE = 44100;
const CHANNELS = 2;

export function isAudioEncodeSupported(): boolean {
  return typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined';
}

/** A muxer-ready encoded AAC chunk + its metadata. */
export interface EncodedAudio {
  chunks: { chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }[];
  sampleRate: number;
  channels: number;
}

/**
 * Decode → process → AAC-encode an audio track to fill `durationSec` of video. Returns null when
 * encoding isn't supported or the source can't be decoded (caller falls back to silent).
 */
export async function encodeAudioTrack(
  track: AudioTrack,
  durationSec: number
): Promise<EncodedAudio | null> {
  if (!isAudioEncodeSupported() || durationSec <= 0) return null;

  let pcm: AudioBuffer;
  try {
    const arrayBuf = await track.src.arrayBuffer();
    const OfflineCtor =
      (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
    if (!OfflineCtor) return null;
    const totalFrames = Math.ceil(durationSec * SAMPLE_RATE);
    const offline = new OfflineCtor(CHANNELS, totalFrames, SAMPLE_RATE);
    const decoded = await offline.decodeAudioData(arrayBuf.slice(0));

    // Build a graph: source (looped to fill) → gain (with fades) → destination.
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.loop = decoded.duration < durationSec;
    const gainNode = offline.createGain();
    const gain = Math.pow(10, track.gainDb / 20);
    const fade = Math.max(0, Math.min(track.fadeSec, durationSec / 2));
    const g = gainNode.gain;
    g.setValueAtTime(fade > 0 ? 0 : gain, 0);
    if (fade > 0) g.linearRampToValueAtTime(gain, fade);
    g.setValueAtTime(gain, Math.max(fade, durationSec - fade));
    if (fade > 0) g.linearRampToValueAtTime(0, durationSec);
    source.connect(gainNode).connect(offline.destination);
    source.start(0);
    pcm = await offline.startRendering();
  } catch {
    return null;
  }

  // Encode the rendered PCM to AAC in ~1024-frame slices.
  try {
    const chunks: EncodedAudio['chunks'] = [];
    let encodeError: unknown = null;
    const encoder = new AudioEncoder({
      output: (chunk, meta) => chunks.push({ chunk, meta }),
      error: (e) => {
        encodeError = e;
      },
    });
    encoder.configure({
      codec: 'mp4a.40.2',
      sampleRate: SAMPLE_RATE,
      numberOfChannels: CHANNELS,
      bitrate: 128_000,
    });

    const frames = pcm.length;
    // Interleave channels into one Float32 buffer per slice.
    const sliceSize = 1024;
    const ch0 = pcm.getChannelData(0);
    const ch1 = pcm.numberOfChannels > 1 ? pcm.getChannelData(1) : ch0;
    for (let off = 0; off < frames; off += sliceSize) {
      if (encodeError) break;
      const n = Math.min(sliceSize, frames - off);
      const interleaved = new Float32Array(n * CHANNELS);
      for (let i = 0; i < n; i++) {
        interleaved[i * 2] = ch0[off + i];
        interleaved[i * 2 + 1] = ch1[off + i];
      }
      const data = new AudioData({
        format: 'f32',
        sampleRate: SAMPLE_RATE,
        numberOfFrames: n,
        numberOfChannels: CHANNELS,
        timestamp: Math.round((off / SAMPLE_RATE) * 1_000_000),
        data: interleaved,
      });
      encoder.encode(data);
      data.close();
    }
    await encoder.flush();
    encoder.close();
    if (encodeError) return null;
    return { chunks, sampleRate: SAMPLE_RATE, channels: CHANNELS };
  } catch {
    return null;
  }
}
