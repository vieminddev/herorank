import { describe, it, expect } from 'vitest';
import { auditDescription, extractFocusTerms, ETSY_META_CHARS } from '../src/lib/server/services/descriptionAudit';

const PRODUCT = 'A dainty gold-plated name necklace, personalized birthday and bridesmaid gift.';
const FOCUS = extractFocusTerms(PRODUCT);

/** A description that follows Etsy's guidance: clear keyword-rich opening, details, scannable. */
const GOOD = `This gold name necklace is a dainty, personalized pendant hand-finished to order.

📐 DETAILS
• Material: 18k gold-plated brass
• Chain: 16-18 inch, adjustable
• Personalize with any name up to 12 letters

📦 SHIPPING
Made to order and shipped with tracking.

⭐ HOW TO ORDER
1. Add the name in the personalization box
2. Choose your chain length`;

function check(desc: string, id: string, focus = FOCUS) {
  return auditDescription(desc, focus).checks.find((c) => c.id === id)!;
}

describe('auditDescription — Etsy rule compliance', () => {
  it('passes every check for a well-formed description', () => {
    const audit = auditDescription(GOOD, FOCUS);
    expect(audit.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('exposes a Google meta-snippet capped at 160 chars', () => {
    const audit = auditDescription(GOOD, FOCUS);
    expect(ETSY_META_CHARS).toBe(160);
    expect(audit.metaChars).toBeLessThanOrEqual(160);
    expect(audit.metaPreview.toLowerCase()).toContain('necklace');
    // newlines are collapsed for the snippet, like Google does
    expect(audit.metaPreview).not.toContain('\n');
  });

  it('warns when the first sentence is an all-caps hook (Etsy: clear first sentence)', () => {
    const gimmick = 'GOLD NAME NECKLACE ✨\n\nA dainty personalized pendant. Material: gold.';
    const c = check(gimmick, 'first-sentence');
    expect(c.status).toBe('warn');
    expect(c.detail.toLowerCase()).toContain('caps');
  });

  it('warns when the opening 160 chars carry no keywords (Etsy: keywords in first sentences)', () => {
    const noKw = 'Hello there and welcome to my little shop, thank you so much for stopping by today friend.';
    const c = check(noKw, 'opening-keywords');
    expect(c.status).toBe('warn');
  });

  it('warns when no concrete details are present (Etsy: essential info at top)', () => {
    // No material / size / dimension / color / care / customization words at all.
    const vague = 'This name necklace is a lovely little treat you will adore for any day of the week.';
    const c = check(vague, 'essential-details');
    expect(c.status).toBe('warn');
  });

  it('warns on a dense, unscannable block (Etsy: short paragraphs and lists)', () => {
    const blob =
      'This gold name necklace is a dainty personalized pendant made of 18k gold-plated brass measuring 16 inches and shipped with care to anyone who orders it from the shop today.';
    const c = check(blob, 'scannable');
    expect(c.status).toBe('warn');
  });

  it('warns on keyword stuffing (Etsy: avoid repeating the same phrase)', () => {
    const stuffed =
      'Necklace necklace necklace. This necklace is a necklace and the necklace is the best necklace. Necklace material: gold, necklace size: 16in.\n• necklace\n• necklace';
    const c = check(stuffed, 'no-stuffing');
    expect(c.status).toBe('warn');
    expect(c.detail.toLowerCase()).toContain('necklace');
  });

  it('flags subjective filler words as stuffing/fluff', () => {
    const fluffy = `${GOOD} It is perfect and beautiful.`;
    const c = check(fluffy, 'no-stuffing');
    expect(c.status).toBe('warn');
    expect(c.detail.toLowerCase()).toMatch(/perfect|beautiful/);
  });

  it('every check carries the Etsy rule it enforces', () => {
    for (const c of auditDescription(GOOD, FOCUS).checks) {
      expect(c.etsyRule.toLowerCase()).toContain('etsy');
    }
  });
});
