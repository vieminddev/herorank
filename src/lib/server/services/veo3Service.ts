/**
 * VEO3 media client (AI Video Studio) — talks to the VEO3 server (media.viemind.ai) which drives
 * Google Veo 3 headlessly. Pure functions over `fetch` (Cloudflare Workers — no node http).
 *
 * VEO3 is ASYNC (queue + webhook): `submitVideo` enqueues a task and returns immediately; the result
 * MP4 arrives later via a webhook to our `callbackUrl`, and is fetched once with `downloadAsset`
 * (the server garbage-collects the file after a single successful download).
 *
 * Auth: every call sends the SAME key in all three headers VEO3 accepts (`x-api-key`, `api-key`,
 * `Authorization: Bearer`). See `docs/ai-video-studio-plan.md` for the confirmed API shape.
 */

export interface Veo3Config {
  /** Public base URL of the VEO3 server, e.g. https://media.viemind.ai (no trailing slash needed). */
  serverUrl: string;
  apiKey: string;
}

export type Veo3VideoMode = 'text' | 'image';

export interface SubmitVideoParams {
  /** Unique task id we choose — equals our job id (one VEO3 task per job). */
  externalTaskId: string;
  prompt: string;
  videoMode: Veo3VideoMode;
  /** 'portrait' | 'landscape' (Etsy listing video). */
  aspect: string;
  /** VEO3 supports '4s' | '6s' | '8s' only. */
  duration: string;
  /**
   * Public https URL of the hero seed image (image-to-video). Our own token-gated seed route; the
   * VEO3 server downloads it server-side. Requires the server to accept `config.startImageUrl`
   * (added on the VEO3 side). Omitted for text→video.
   */
  startImageUrl?: string;
  /** Where VEO3 POSTs the result. Must be publicly reachable (vierank.com). */
  callbackUrl: string;
}

export class Veo3Error extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'Veo3Error';
    this.status = status;
  }
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'api-key': apiKey,
    Authorization: `Bearer ${apiKey}`,
    // Explicit UA — the VEO3 server rejects some clients (e.g. python-urllib) with 403; send a
    // stable identifier so the Cloudflare Worker's outbound requests are always accepted.
    'User-Agent': 'VieRank/1.0',
  };
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Enqueue a video task. Resolves on a 200 `{success:true}`; throws Veo3Error otherwise. The actual
 * media is delivered later to `callbackUrl` (webhook), not in this response.
 */
export async function submitVideo(
  cfg: Veo3Config,
  p: SubmitVideoParams
): Promise<{ taskId: string; queue?: Veo3QueueInfo }> {
  const config: Record<string, unknown> = {
    videoMode: p.videoMode,
    quality: 'relaxed',
    aspect: p.aspect,
    duration: p.duration,
  };
  // Hero seed for image-to-video. VEO3 (server-side change) downloads this URL → temp file →
  // its existing Google upload flow (startFilePath/mediaId).
  if (p.videoMode === 'image' && p.startImageUrl) {
    config.startImageUrl = p.startImageUrl;
  }

  let res: Response;
  try {
    res = await fetch(`${trimSlash(cfg.serverUrl)}/api/queue/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(cfg.apiKey) },
      body: JSON.stringify({
        externalTaskId: p.externalTaskId,
        prompt: p.prompt,
        config,
        callbackUrl: p.callbackUrl,
      }),
    });
  } catch (err) {
    throw new Veo3Error(`VEO3 submit network error: ${(err as Error).message}`, 502);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Veo3Error(`VEO3 submit failed (${res.status}): ${text.slice(0, 200)}`, res.status);
  }
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    taskId?: string;
    queue_info?: { tasks_ahead?: number; estimated_wait_seconds?: number; message?: string };
  };
  if (!body.success) {
    throw new Veo3Error('VEO3 submit returned success=false', 502);
  }
  const q = body.queue_info;
  return {
    taskId: body.taskId ?? p.externalTaskId,
    queue: q ? { tasksAhead: q.tasks_ahead, estimatedWaitSeconds: q.estimated_wait_seconds, message: q.message } : undefined,
  };
}

/**
 * Download the finished MP4 bytes. The webhook's `downloadUrl` points at the VEO3 server's own host
 * (often `http://localhost:19774/...`), which is unreachable from Cloudflare — so we keep only its
 * PATH and re-point it at the public `serverUrl`. Download-once: the server deletes the file after a
 * successful stream, so call this exactly once and persist the bytes immediately.
 */
export async function downloadAsset(cfg: Veo3Config, downloadUrl: string): Promise<ArrayBuffer> {
  let path: string;
  try {
    path = new URL(downloadUrl).pathname;
  } catch {
    // Not an absolute URL — assume it's already a path.
    path = downloadUrl.startsWith('/') ? downloadUrl : `/${downloadUrl}`;
  }
  const url = `${trimSlash(cfg.serverUrl)}${path}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: authHeaders(cfg.apiKey) });
  } catch (err) {
    throw new Veo3Error(`VEO3 download network error: ${(err as Error).message}`, 502);
  }
  if (!res.ok) {
    throw new Veo3Error(`VEO3 download failed (${res.status})`, res.status);
  }
  return res.arrayBuffer();
}

// --- Images (AI Image Studio, 2nd provider) ----------------------------------
// VEO3 image generation is ASYNC (queue + status poll + download), same as video, but we
// SYNC-WRAP it here (submit → poll → download within one request) so the existing synchronous
// Image Studio flow is unchanged. Text→image only — VEO3 doesn't condition on a reference image
// yet (it downloads startImageUrl but ignores it), so reference/img2img stays on the sync provider.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Map herorank's pixel SIZE to VEO3's aspect enum. */
export function imageAspectFromSize(size: string): string {
  if (size === '1024x1792') return 'IMAGE_ASPECT_RATIO_PORTRAIT';
  if (size === '1792x1024') return 'IMAGE_ASPECT_RATIO_LANDSCAPE';
  return 'IMAGE_ASPECT_RATIO_SQUARE';
}

interface Veo3Status {
  status: string;
  downloadUrl?: string;
  error?: string | null;
}

/** GET the queue status for a task (shared by image flow; video uses the webhook instead). */
export async function pollStatus(cfg: Veo3Config, taskId: string): Promise<Veo3Status> {
  let res: Response;
  try {
    res = await fetch(`${trimSlash(cfg.serverUrl)}/api/queue/status/${encodeURIComponent(taskId)}`, {
      headers: authHeaders(cfg.apiKey),
    });
  } catch (err) {
    throw new Veo3Error(`VEO3 status network error: ${(err as Error).message}`, 502);
  }
  if (!res.ok) throw new Veo3Error(`VEO3 status failed (${res.status})`, res.status);
  return (await res.json().catch(() => ({ status: '' }))) as Veo3Status;
}

/**
 * Enqueue one image task. With `callbackUrl` the result is delivered async via webhook (used by the
 * Image Studio job pipeline); without it the caller polls + downloads (sync-wrap, generateImageVeo3).
 */
/** Queue position reported by the VEO3 server (it computes wait time when busy). */
export interface Veo3QueueInfo {
  tasksAhead?: number;
  estimatedWaitSeconds?: number;
  message?: string;
}

export async function submitImage(
  cfg: Veo3Config,
  p: { externalTaskId: string; prompt: string; aspect: string; referenceImageName?: string; callbackUrl?: string }
): Promise<Veo3QueueInfo> {
  const config: Record<string, unknown> = { model: 'NARWHAL', aspect: p.aspect, quantity: 1 };
  // Google Media ID of an uploaded reference (img2img) — see uploadReferenceToVeo3.
  if (p.referenceImageName) config.referenceImageName = p.referenceImageName;
  const body: Record<string, unknown> = { externalTaskId: p.externalTaskId, prompt: p.prompt, config };
  if (p.callbackUrl) body.callbackUrl = p.callbackUrl;
  let res: Response;
  try {
    res = await fetch(`${trimSlash(cfg.serverUrl)}/api/queue/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(cfg.apiKey) },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Veo3Error(`VEO3 image submit network error: ${(err as Error).message}`, 502);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Veo3Error(`VEO3 image submit failed (${res.status}): ${text.slice(0, 160)}`, res.status);
  }
  const resBody = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    queue_info?: { tasks_ahead?: number; estimated_wait_seconds?: number; message?: string };
  };
  if (!resBody.success) throw new Veo3Error('VEO3 image submit returned success=false', 502);
  const q = resBody.queue_info;
  return q
    ? { tasksAhead: q.tasks_ahead, estimatedWaitSeconds: q.estimated_wait_seconds, message: q.message }
    : {};
}

/**
 * Upload a reference image to Google Labs (via the VEO3 server's `/api/eval-main` remote-eval) and
 * return its Google Media ID — to pass as `config.referenceImageName` for image-to-image. The server
 * runs `uploadImageIfNeeded(tempFile)` and stashes the id in a `global.<var>`, which we poll for.
 * base64 has no quote/backtick chars, so embedding it in the script string is safe.
 */
export async function uploadReferenceToVeo3(
  cfg: Veo3Config,
  referenceImage: string,
  opts?: { timeoutMs?: number }
): Promise<string> {
  const b64 =
    referenceImage.startsWith('data:') && referenceImage.includes(',')
      ? referenceImage.slice(referenceImage.indexOf(',') + 1)
      : referenceImage;
  const id = crypto.randomUUID();
  const fileBase = `vr_${id}`;
  const varName = `mediaId_${id.replace(/-/g, '_')}`;
  const evalUrl = `${trimSlash(cfg.serverUrl)}/api/eval-main`;
  // Explicit UA — the server rejects some default UAs (e.g. python-urllib) with 403.
  const headers = { 'Content-Type': 'text/plain', 'User-Agent': 'VieRank/1.0', ...authHeaders(cfg.apiKey) };

  const script = `(async () => { try {
    const fs = require('fs'); const path = require('path');
    const tempDir = path.resolve('temp_images'); if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, "${fileBase}.png"); fs.writeFileSync(tempPath, "${b64}", 'base64');
    const mid = await uploadImageIfNeeded(tempPath, 0); global.${varName} = mid;
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) {}
  } catch (err) { global.${varName} = "ERROR: " + err.message; } })()`;

  let res: Response;
  try {
    res = await fetch(evalUrl, { method: 'POST', headers, body: script });
  } catch (err) {
    throw new Veo3Error(`VEO3 ref-upload network error: ${(err as Error).message}`, 502);
  }
  if (!res.ok) throw new Veo3Error(`VEO3 ref-upload failed (${res.status})`, res.status);

  const timeoutMs = opts?.timeoutMs ?? 28_000;
  const deadline = Date.now() + timeoutMs;
  let mediaId: string | null = null;
  while (Date.now() < deadline) {
    await sleep(1500);
    let chk: Response;
    try {
      chk = await fetch(evalUrl, { method: 'POST', headers, body: `global.${varName}` });
    } catch {
      continue;
    }
    if (!chk.ok) continue;
    const data = (await chk.json().catch(() => ({}))) as { result?: unknown };
    const val = data.result;
    if (val) {
      if (typeof val === 'string' && val.startsWith('ERROR:')) {
        throw new Veo3Error(`VEO3 ref-upload rejected: ${val.slice(0, 160)}`, 502);
      }
      mediaId = String(val);
      break;
    }
  }
  // Best-effort cleanup of the global var.
  fetch(evalUrl, { method: 'POST', headers, body: `delete global.${varName}` }).catch(() => {});
  if (!mediaId) throw new Veo3Error('VEO3 ref-upload timed out', 504);
  return mediaId;
}

/**
 * Generate ONE image and return its bytes — submit, poll to completion, download once. Throws
 * Veo3Error on failure or timeout (caller falls back to the sync provider).
 */
export async function generateImageVeo3(
  cfg: Veo3Config,
  opts: { prompt: string; size: string; referenceImageName?: string; timeoutMs?: number; pollMs?: number }
): Promise<Uint8Array> {
  const taskId = crypto.randomUUID();
  await submitImage(cfg, {
    externalTaskId: taskId,
    prompt: opts.prompt,
    aspect: imageAspectFromSize(opts.size),
    referenceImageName: opts.referenceImageName,
  });

  const timeoutMs = opts.timeoutMs ?? 75_000;
  const pollMs = opts.pollMs ?? 4_000;
  const deadline = Date.now() + timeoutMs;
  let downloadUrl: string | undefined;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const st = await pollStatus(cfg, taskId);
    if (st.status === 'completed' || st.status === 'done' || st.status === 'success') {
      downloadUrl = st.downloadUrl;
      break;
    }
    if (st.status === 'failed' || st.status === 'error') {
      throw new Veo3Error(`VEO3 image failed: ${st.error ?? 'unknown'}`, 502);
    }
  }
  if (!downloadUrl) throw new Veo3Error('VEO3 image timed out', 504);
  const buf = await downloadAsset(cfg, downloadUrl);
  return new Uint8Array(buf);
}

/** Build the VEO3 config bound to the current request env, or null when not configured. */
export function veo3ConfigFromEnv(env: {
  VEO3_SERVER_URL?: string;
  VEO3_API_KEY?: string;
}): Veo3Config | null {
  if (!env.VEO3_SERVER_URL || !env.VEO3_API_KEY) return null;
  return { serverUrl: env.VEO3_SERVER_URL, apiKey: env.VEO3_API_KEY };
}
