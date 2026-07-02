/**
 * XSS regression tests for src/lib/sanitize.ts (Engineer E1 — tech-debt #5 / BR-P2-07).
 *
 * The chat renders LLM/user content via `{@html}`. The ONLY markup allowed to reach the DOM
 * is `<strong>` produced from `**bold**`. Everything else — including `<script>` and
 * `<img onerror>` — MUST be escaped to inert text. These tests assert exactly that.
 *
 * Relative import (not `$lib`) keeps the test independent of the SvelteKit alias resolver,
 * matching the convention in tests/credits.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml, renderBold, renderChatMarkdown } from '../src/lib/sanitize';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('escapes & before other entities (no double-escaping)', () => {
    // A naive ordering would turn "<" into "&lt;" then re-escape the "&" → "&amp;lt;".
    expect(escapeHtml('a < b')).toBe('a &lt; b');
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('leaves plain text and ** markers untouched', () => {
    expect(escapeHtml('hello **world**')).toBe('hello **world**');
  });
});

describe('renderBold', () => {
  it('converts **bold** to <strong> markup', () => {
    expect(renderBold('use **all 13** tags')).toBe('use <strong>all 13</strong> tags');
  });

  it('handles multiple separate bold spans (non-greedy)', () => {
    expect(renderBold('**a** and **b**')).toBe('<strong>a</strong> and <strong>b</strong>');
  });

  it('renders bold across newlines (multi-line emphasis)', () => {
    expect(renderBold('**line one\nline two**')).toBe('<strong>line one\nline two</strong>');
  });

  // --- XSS regression: tech-debt #5 ---

  it('neutralizes a <script> tag (no executable markup reaches the DOM)', () => {
    const out = renderBold('<script>alert(1)</script>');
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('<script>');
  });

  it('neutralizes <img onerror> while still rendering bold (the spec XSS payload)', () => {
    const out = renderBold('<img src=x onerror=alert(1)>**bold**');
    // The img is inert text; only the bold becomes real markup.
    expect(out).toBe('&lt;img src=x onerror=alert(1)&gt;<strong>bold</strong>');
    expect(out).not.toContain('<img');
    expect(out).toContain('<strong>bold</strong>');
  });

  it('does not let escaped HTML smuggle a <strong> via injected markup', () => {
    // Model emits a literal "<strong>" — it must stay inert, not become real markup.
    const out = renderBold('<strong>not real</strong>');
    expect(out).toBe('&lt;strong&gt;not real&lt;/strong&gt;');
    expect(out).not.toMatch(/<strong>not real<\/strong>/);
  });

  it('handles nested/adjacent ** without producing raw HTML', () => {
    // Inner content of a bold span that itself contains markup stays escaped.
    const out = renderBold('**<b>x</b>**');
    expect(out).toBe('<strong>&lt;b&gt;x&lt;/b&gt;</strong>');
    expect(out).not.toContain('<b>');
  });

  it('escapes quotes and ampersands inside bold content', () => {
    const out = renderBold('**"a" & \'b\'**');
    expect(out).toBe('<strong>&quot;a&quot; &amp; &#39;b&#39;</strong>');
  });
});

describe('renderChatMarkdown', () => {
  it('joins plain lines with <br> (no pre-wrap needed)', () => {
    expect(renderChatMarkdown('Hello\nWorld')).toBe('Hello<br>World');
  });

  it('groups consecutive dash/bullet lines into a single <ul>', () => {
    expect(renderChatMarkdown('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(renderChatMarkdown('• a\n* b')).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('groups numbered lines into an <ol>', () => {
    expect(renderChatMarkdown('1. first\n2. second')).toBe('<ol><li>first</li><li>second</li></ol>');
  });

  it('mixes a heading line then a list', () => {
    expect(renderChatMarkdown('Tags:\n- a\n- b')).toBe('Tags:<ul><li>a</li><li>b</li></ul>');
  });

  it('keeps bold inside list items', () => {
    expect(renderChatMarkdown('- **a** b')).toBe('<ul><li><strong>a</strong> b</li></ul>');
  });

  it('switches list type when bullets follow numbers', () => {
    expect(renderChatMarkdown('1. a\n- b')).toBe('<ol><li>a</li></ol><ul><li>b</li></ul>');
  });

  it('still escapes HTML (no live markup from the model)', () => {
    expect(renderChatMarkdown('- <img src=x onerror=alert(1)>')).toBe(
      '<ul><li>&lt;img src=x onerror=alert(1)&gt;</li></ul>'
    );
    expect(renderChatMarkdown('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('preserves blank lines between paragraphs as <br><br>', () => {
    expect(renderChatMarkdown('a\n\nb')).toBe('a<br><br>b');
  });
});
