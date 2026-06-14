/**
 * HTML sanitization helpers for rendering untrusted LLM/user content (Engineer E1).
 *
 * Phase 2 fixes tech-debt #5: the chat previously ran `**bold**` → `<strong>` and fed the
 * result to `{@html}` WITHOUT escaping, so any `<`, `>`, `&`, or `<img onerror>` in the
 * (now real, untrusted) LLM output was injected raw.
 *
 * Contract (PM decision Q5 — bold-only): ESCAPE the whole string FIRST, then apply the
 * `**…**` → `<strong>…</strong>` transform on the already-escaped string. Because escaping
 * runs first, the ONLY markup that can reach the DOM is `<strong>`; every other character
 * (including any HTML the model emits) is inert text.
 *
 * Covered by tests/sanitize.test.ts (XSS regression for tech-debt #5 / BR-P2-07).
 */

/** Escape the five HTML-significant characters so the string is inert inside `{@html}`. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render bold-only markdown safely.
 * 1. Escape ALL HTML first (so model/user HTML is inert).
 * 2. THEN convert `**…**` to `<strong>…</strong>` — the only markup we intentionally allow.
 *
 * Note: the `**` markers are plain ASCII and survive escaping untouched, so applying the
 * transform after escaping is safe and produces real `<strong>` wrappers while everything
 * between them (already escaped) stays inert. Non-greedy match prevents one `**` run from
 * swallowing across separate emphasis spans.
 */
export function renderBold(input: string): string {
  return escapeHtml(input).replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
}
