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

/**
 * Render chat markdown safely: escape → `**bold**` → simple lists. Used by the VieRank Assistant,
 * whose replies are list-heavy (tags, steps). Same XSS contract as `renderBold` — HTML is escaped
 * FIRST, so the only markup emitted is `<strong>`, `<ul>/<ol>`, `<li>`, and `<br>` that THIS
 * function produces; nothing from the model can inject live HTML.
 *
 * Lines starting with `-`, `*`, or `•` become a `<ul>`; `1.`/`2.`… become an `<ol>`; consecutive
 * list lines group into one list. Other lines join with `<br>` (so the container does NOT need
 * `white-space: pre-wrap`). The emitted tags carry no classes — style them via the container.
 */
export function renderChatMarkdown(input: string): string {
  const escaped = escapeHtml(input).replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
  const segments: string[] = [];
  let textBuf: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];

  const flushText = () => {
    if (textBuf.length) {
      segments.push(textBuf.join('<br>'));
      textBuf = [];
    }
  };
  const flushList = () => {
    if (listType) {
      segments.push(`<${listType}>${listItems.join('')}</${listType}>`);
      listType = null;
      listItems = [];
    }
  };

  for (const line of escaped.split('\n')) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet) {
      flushText();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(`<li>${bullet[1]}</li>`);
    } else if (ordered) {
      flushText();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(`<li>${ordered[1]}</li>`);
    } else {
      flushList();
      textBuf.push(line);
    }
  }
  flushText();
  flushList();
  return segments.join('');
}
