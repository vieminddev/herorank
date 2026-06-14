/**
 * Manual gateway verification (Engineer D, BA spec §6.5).
 *
 * Run ONLY when a real LLM key is present — NEVER in CI. It hits the real gateway once for a
 * non-streaming completion and once for a stream, prints results + latency, and exits non-zero
 * with a clear message if the key is missing.
 *
 * Usage:
 *   LLM_API_KEY=sk-... LLM_MODEL=gpt-4o-mini node scripts/verify-gateway.mjs
 *   # or put LLM_BASE_URL / LLM_API_KEY / LLM_MODEL in .dev.vars and source it first.
 *
 * This file is plain JS (no SvelteKit aliases) so it runs with bare `node` — it re-implements
 * the two call shapes rather than importing the TS service (which uses `$lib`/TS).
 */

const baseUrl = (process.env.LLM_BASE_URL || 'https://vtoken.viemind.ai/v1').replace(/\/+$/, '');
const apiKey = process.env.LLM_API_KEY || '';
const model = process.env.LLM_MODEL || '';

if (!apiKey || !model) {
  console.error(
    '[verify-gateway] LLM_API_KEY and LLM_MODEL are required. This is a manual-only tool — set them in your shell or .dev.vars and re-run.'
  );
  process.exit(1);
}

const headers = {
  'content-type': 'application/json',
  authorization: `Bearer ${apiKey}`,
};

async function verifyCompletion() {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      stream: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return ONLY JSON: {"titles":["a","b"]}' },
        { role: 'user', content: 'Give two short Etsy title ideas for a name necklace.' },
      ],
    }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    console.error(`[completion] FAILED ${res.status} in ${ms}ms`);
    return false;
  }
  const json = await res.json();
  console.log(`[completion] OK in ${ms}ms`);
  console.log('  content:', json.choices?.[0]?.message?.content);
  return true;
}

async function verifyStream() {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: 'You are HeroRank AI, a concise Etsy assistant.' },
        { role: 'user', content: 'In one sentence, why are Etsy tags important?' },
      ],
    }),
  });
  if (!res.ok || !res.body) {
    console.error(`[stream] FAILED ${res.status}`);
    return false;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const evt = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of evt.split('\n')) {
        const trimmed = line.trimStart();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) text += delta;
        } catch {
          // skip keep-alive / partial frame
        }
      }
    }
  }
  const ms = Date.now() - t0;
  console.log(`[stream] OK in ${ms}ms`);
  console.log('  reply:', text);
  return true;
}

const a = await verifyCompletion();
const b = await verifyStream();
process.exit(a && b ? 0 : 1);
