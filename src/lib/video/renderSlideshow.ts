/**
 * Scene exporter — renders a {@link Scene} to a downloadable video entirely in the browser (no
 * server, no R2, no per-render cost). Shares ONE compositor (`drawFrameAt`) with the live preview,
 * so the exported file matches the preview pixel-for-pixel (WYSIWYG).
 *
 * Two encode paths:
 *   1. PRIMARY — WebCodecs `VideoEncoder` (H.264) + `mp4-muxer` → real MP4 (+ optional AAC audio
 *      track). Fast, hardware-encoded where available (Chrome/Edge/Safari 16.4+). Frame-accurate.
 *   2. FALLBACK — `canvas.captureStream()` + `MediaRecorder` → WebM, real-time, for browsers
 *      without a usable H.264 WebCodecs encoder. (Audio is omitted on this path.)
 *
 * If neither is available, {@link renderScene} throws {@link VideoUnsupportedError}.
 *
 * The legacy {@link renderSlideshow} entry point is kept as a thin adapter so older callers/tests
 * keep working; it builds a Scene from the old options and delegates to {@link renderScene}.
 */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { type Scene, type Aspect, aspectDims, buildTimeline, DEFAULT_FPS } from './scene';
import { drawFrameAt, type SceneAssets, type Ctx2D } from './compositor';
import { BitmapCache } from './bitmapCache';
import { encodeAudioTrack, isAudioEncodeSupported } from './audio';

export type { Aspect } from './scene';
/** Legacy transition union kept for the old options adapter. */
export type Transition = 'fade' | 'none';

export interface SlideshowOptions {
  secondsPerSlide: number;
  transition: Transition;
  aspect: Aspect;
  transitionSeconds?: number;
  fps?: number;
}

export interface RenderResult {
  blob: Blob;
  mime: 'video/mp4' | 'video/webm';
  ext: 'mp4' | 'webm';
  width: number;
  height: number;
  durationSec: number;
  /** True when the scene had audio but it could not be encoded (degraded to silent). */
  audioDropped?: boolean;
}

export type RenderPhase = 'preparing' | 'encoding' | 'finalizing';
export type ProgressFn = (p: { phase: RenderPhase; ratio: number }) => void;

export class VideoUnsupportedError extends Error {
  constructor(message = 'This browser cannot export video.') {
    super(message);
    this.name = 'VideoUnsupportedError';
  }
}

// ---------------------------------------------------------------------------
// Capability detection
// ---------------------------------------------------------------------------

export function isVideoExportSupported(): { ok: boolean; mp4: boolean; webm: boolean; audio: boolean } {
  const mp4 = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  const webm = typeof MediaRecorder !== 'undefined' && !!pickWebmMime();
  return { ok: mp4 || webm, mp4, webm, audio: isAudioEncodeSupported() };
}

const AVC_CODECS = ['avc1.4d0028', 'avc1.42E01E', 'avc1.640028'];

async function pickAvcCodec(width: number, height: number, fps: number): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const bitrate = Math.round(width * height * fps * 0.07);
  for (const codec of AVC_CODECS) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps });
      if (supported) return codec;
    } catch {
      /* try next */
    }
  }
  return null;
}

function pickWebmMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Asset prep
// ---------------------------------------------------------------------------

async function warmAssets(scene: Scene): Promise<{ cache: BitmapCache; assets: SceneAssets }> {
  const cache = new BitmapCache();
  const blobs = scene.slides.map((s) => s.src);
  if (scene.logo) blobs.push(scene.logo.src);
  await cache.warm(blobs);
  const assets: SceneAssets = {
    slides: scene.slides.map((s) => cache.peek(s.src)),
    logo: scene.logo ? cache.peek(scene.logo.src) : undefined,
  };
  return { cache, assets };
}

// ---------------------------------------------------------------------------
// Encode path 1 — WebCodecs + mp4-muxer (MP4, optional audio)
// ---------------------------------------------------------------------------

async function encodeMp4(
  scene: Scene,
  assets: SceneAssets,
  dims: { width: number; height: number },
  fps: number,
  codec: string,
  onProgress?: ProgressFn
): Promise<{ blob: Blob; audioDropped: boolean }> {
  const { width, height } = dims;
  const tl = buildTimeline(scene);

  // Encode audio FIRST (best-effort) so we know whether to declare an audio track on the muxer.
  let encodedAudio: Awaited<ReturnType<typeof encodeAudioTrack>> = null;
  if (scene.audio) {
    encodedAudio = await encodeAudioTrack(scene.audio, tl.total);
  }
  const audioDropped = !!scene.audio && !encodedAudio;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d') as Ctx2D;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    ...(encodedAudio
      ? { audio: { codec: 'aac' as const, sampleRate: encodedAudio.sampleRate, numberOfChannels: encodedAudio.channels } }
      : {}),
    fastStart: 'in-memory',
  });

  let encodeError: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  encoder.configure({
    codec,
    width,
    height,
    bitrate: Math.round(width * height * fps * 0.07),
    framerate: fps,
  });

  const totalFrames = Math.max(1, Math.round(tl.total * fps));
  const frameDur = 1_000_000 / fps;
  for (let i = 0; i < totalFrames; i++) {
    if (encodeError) break;
    const t = i / fps;
    drawFrameAt(ctx, scene, assets, t, tl, width, height);
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
    encoder.encode(frame, { keyFrame: i % fps === 0 });
    frame.close();
    if (i % 5 === 0) onProgress?.({ phase: 'encoding', ratio: i / totalFrames });
    if (encoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await encoder.flush();
  encoder.close();
  if (encodeError) throw encodeError;

  // Mux audio chunks after the video frames (timestamps keep them in sync).
  if (encodedAudio) {
    for (const { chunk, meta } of encodedAudio.chunks) {
      muxer.addAudioChunk(chunk, meta);
    }
  }

  onProgress?.({ phase: 'finalizing', ratio: 1 });
  muxer.finalize();
  const { buffer } = muxer.target as ArrayBufferTarget;
  return { blob: new Blob([buffer], { type: 'video/mp4' }), audioDropped };
}

// ---------------------------------------------------------------------------
// Encode path 2 — MediaRecorder (WebM) fallback, real-time
// ---------------------------------------------------------------------------

async function recordWebm(
  scene: Scene,
  assets: SceneAssets,
  dims: { width: number; height: number },
  fps: number,
  mime: string,
  onProgress?: ProgressFn
): Promise<Blob> {
  const { width, height } = dims;
  const tl = buildTimeline(scene);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as Ctx2D;
  const stream = canvas.captureStream(fps);

  // Best-effort audio on the WebM path: pipe an <audio> element's captured stream into the recorder.
  let audioEl: HTMLAudioElement | null = null;
  if (scene.audio) {
    try {
      audioEl = new Audio(URL.createObjectURL(scene.audio.src));
      audioEl.loop = true;
      const audioStream = (audioEl as HTMLAudioElement & { captureStream?: () => MediaStream }).captureStream?.();
      if (audioStream) {
        audioStream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
        await audioEl.play().catch(() => {});
      }
    } catch {
      audioEl = null;
    }
  }

  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(width * height * fps * 0.07) });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  rec.start();
  const startMs = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - startMs) / 1000;
      if (t >= tl.total) {
        drawFrameAt(ctx, scene, assets, tl.total, tl, width, height);
        resolve();
        return;
      }
      drawFrameAt(ctx, scene, assets, t, tl, width, height);
      onProgress?.({ phase: 'encoding', ratio: t / tl.total });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  onProgress?.({ phase: 'finalizing', ratio: 1 });
  rec.stop();
  const blob = await done;
  if (audioEl) {
    audioEl.pause();
    URL.revokeObjectURL(audioEl.src);
  }
  return blob;
}

// ---------------------------------------------------------------------------
// Public API — Scene-based
// ---------------------------------------------------------------------------

/**
 * Render a {@link Scene} to a video. Prefers MP4 (WebCodecs, with audio); falls back to WebM
 * (MediaRecorder). Throws {@link VideoUnsupportedError} when neither path is available.
 */
export async function renderScene(scene: Scene, onProgress?: ProgressFn): Promise<RenderResult> {
  if (!scene.slides.length) throw new Error('Add at least one photo.');
  const fps = scene.fps || DEFAULT_FPS;
  const dims = aspectDims(scene.aspect);
  const tl = buildTimeline(scene);

  onProgress?.({ phase: 'preparing', ratio: 0 });
  const { cache, assets } = await warmAssets(scene);

  try {
    const codec = await pickAvcCodec(dims.width, dims.height, fps);
    if (codec) {
      const { blob, audioDropped } = await encodeMp4(scene, assets, dims, fps, codec, onProgress);
      return { blob, mime: 'video/mp4', ext: 'mp4', width: dims.width, height: dims.height, durationSec: tl.total, audioDropped };
    }
    const webmMime = pickWebmMime();
    if (webmMime) {
      const blob = await recordWebm(scene, assets, dims, fps, webmMime, onProgress);
      return { blob, mime: 'video/webm', ext: 'webm', width: dims.width, height: dims.height, durationSec: tl.total };
    }
    throw new VideoUnsupportedError(
      'Your browser cannot export video. Try the latest Chrome, Edge, or Safari.'
    );
  } finally {
    cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Legacy adapter — builds a Scene from the old options shape
// ---------------------------------------------------------------------------

/** @deprecated Prefer {@link renderScene}. Kept so the original simple API keeps working. */
export async function renderSlideshow(
  sources: Blob[],
  opts: SlideshowOptions,
  onProgress?: ProgressFn
): Promise<RenderResult> {
  const scene: Scene = {
    slides: sources.map((src) => ({ src, durationSec: Math.max(0.5, opts.secondsPerSlide) })),
    transition: {
      type: opts.transition === 'fade' ? 'fade' : 'none',
      seconds: opts.transitionSeconds ?? 0.6,
    },
    aspect: opts.aspect,
    fps: opts.fps ?? DEFAULT_FPS,
    background: '#000000',
    preset: 'custom',
  };
  return renderScene(scene, onProgress);
}
