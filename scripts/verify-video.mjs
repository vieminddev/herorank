import { chromium } from 'playwright';
import { deflateSync } from 'node:zlib';

const BASE = 'http://localhost:3001';

// --- Minimal valid solid-color RGBA PNG encoder (no deps) ---
const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makePng(size, [r, g, b]) {
  const w = size, h = size;
  const row = Buffer.alloc(1 + w * 4);
  for (let x = 0; x < w; x++) { row[1 + x * 4] = r; row[2 + x * 4] = g; row[3 + x * 4] = b; row[4 + x * 4] = 255; }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const idat = deflateSync(raw);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// 1. Sign up a fresh user via API to get a session cookie.
const email = `vid_${Date.now()}@example.com`;
const su = await fetch(`${BASE}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: BASE },
  body: JSON.stringify({ name: 'Vid', email, password: 'Password123' }),
});
if (su.status !== 200) {
  console.log('SIGNUP failed', su.status, '(auth rate-limit?) — aborting');
  process.exit(1);
}
const setCookie = su.headers.get('set-cookie') || '';
const cookies = setCookie
  .split(',')
  .map((s) => s.split(';')[0].trim())
  .filter((s) => s.includes('='))
  .map((kv) => {
    const i = kv.indexOf('=');
    return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: 'localhost', path: '/' };
  });

// Use system Chrome (full codecs: WebCodecs H.264 + MediaRecorder); fall back to bundled Chromium.
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
  console.log('browser: system Chrome');
} catch {
  browser = await chromium.launch();
  console.log('browser: bundled Chromium (may lack video codecs)');
}
const ctx = await browser.newContext();
await ctx.addCookies(cookies);
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  [page console error]', m.text()); });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/tools/etsy/video-generator`, { waitUntil: 'domcontentloaded' });
console.log('title:', await page.title());
await page.waitForSelector('input[type=file]', { timeout: 20000 });
// Wait for SvelteKit hydration so the file-input change handler is attached before we upload.
await page.waitForTimeout(2500);

// 2. Upload 3 valid solid-color PNGs via the real file input (setInputFiles → trusted change).
await page.setInputFiles('input[type=file]', [
  { name: 'red.png', mimeType: 'image/png', buffer: makePng(64, [230, 57, 70]) },
  { name: 'green.png', mimeType: 'image/png', buffer: makePng(64, [42, 157, 143]) },
  { name: 'blue.png', mimeType: 'image/png', buffer: makePng(64, [38, 70, 160]) },
]);

// Confirm thumbnails appeared.
await page.waitForTimeout(600);
const diag = await page.evaluate(() => {
  const input = document.querySelector('input[type=file]');
  return {
    inputFiles: input ? input.files.length : -1,
    inputDisabled: input ? input.disabled : null,
    li: document.querySelectorAll('ul li').length,
    liImg: document.querySelectorAll('ul li img').length,
  };
});
console.log('diag:', JSON.stringify(diag));
const thumbs = diag.liImg;
console.log('photos added:', thumbs);
if (thumbs === 0) {
  await page.screenshot({ path: 'scripts/video-debug.png', fullPage: true });
  console.log('screenshot: scripts/video-debug.png — aborting');
  await browser.close();
  process.exit(1);
}

// 3. Pick faster settings (2s/slide) if the control exists, then generate.
try { await page.selectOption('#vm-seconds', '2', { timeout: 2000 }); } catch { /* controls changed — fine */ }
await page.getByRole("button", { name: /Export video/i }).click();

// 4. Wait for the result card (video element + Download button).
try {
  await page.waitForSelector('video', { timeout: 60000 });
  const dl = await page.getByRole('button', { name: /Download/i }).first().textContent();
  const meta = await page.locator('p.lead').first().textContent();
  // Validate the <video> actually has a playable blob source with non-zero duration.
  const info = await page.evaluate(async () => {
    const v = document.querySelector('video');
    if (!v) return null;
    await new Promise((res) => {
      if (v.readyState >= 1) return res();
      v.onloadedmetadata = () => res();
      setTimeout(res, 4000);
    });
    return { src: v.currentSrc.slice(0, 12), duration: v.duration, w: v.videoWidth, h: v.videoHeight };
  });
  console.log('RESULT  download-btn:', dl?.trim());
  console.log('RESULT  meta:', meta?.trim());
  console.log('RESULT  video:', JSON.stringify(info));
  await page.screenshot({ path: 'scripts/video-result.png', fullPage: true });
  console.log('screenshot: scripts/video-result.png');
  console.log(info && info.duration > 0 ? 'PASS ✅' : 'FAIL ❌ (no playable video)');
} catch (e) {
  const err = await page.locator('[role=alert]').first().textContent().catch(() => null);
  console.log('FAIL ❌ no video produced. alert:', err);
  await page.screenshot({ path: 'scripts/video-fail.png', fullPage: true });
}

await browser.close();
