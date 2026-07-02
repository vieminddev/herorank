import { describe, it, expect } from 'vitest';
import { auditTags, ETSY_TAG_LIMIT, ETSY_TAG_MAX_CHARS } from '../src/lib/server/services/tagAudit';

/** A healthy set: 13 unique, varied, multi-word tags, each ≤20 chars. */
const HEALTHY = [
  'gold name necklace',
  'dainty pendant gift',
  'bridesmaid jewelry',
  'custom birthday gift',
  'minimalist chain',
  'layered charm set',
  'mom present idea',
  'initial letter charm',
  'fine silver chain',
  'anniversary gift',
  'handmade pendant',
  'everyday jewelry',
  'dainty gold chain',
];

function checkById(tags: string[], id: string) {
  return auditTags(tags).checks.find((c) => c.id === id)!;
}

describe('auditTags — Etsy rule compliance', () => {
  it('passes every check for a healthy 13-tag set', () => {
    const audit = auditTags(HEALTHY);
    expect(audit.checks.every((c) => c.status === 'pass')).toBe(true);
    expect(audit.multiWordCount).toBe(13);
    expect(audit.singleWordTags).toHaveLength(0);
    expect(audit.overusedWords).toHaveLength(0);
  });

  it('warns when fewer than 13 tags are used (Etsy: use all 13)', () => {
    const check = checkById(HEALTHY.slice(0, 10), 'count');
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('10 of 13');
    expect(ETSY_TAG_LIMIT).toBe(13);
  });

  it('flags single-word tags (Etsy: use multi-word phrases)', () => {
    const tags = ['necklace', 'gold', ...HEALTHY.slice(2)];
    const audit = auditTags(tags);
    const check = audit.checks.find((c) => c.id === 'multiword')!;
    expect(check.status).toBe('warn');
    expect(audit.singleWordTags).toEqual(['necklace', 'gold']);
    expect(check.detail).toContain('necklace');
  });

  it('marks multi-word in-limit tags as long-tail', () => {
    const flag = auditTags(HEALTHY).flags[0];
    expect(flag.longTail).toBe(true);
    expect(flag.singleWord).toBe(false);
  });

  it('warns on low variety when a word dominates the set (Etsy: keep tags unique/varied)', () => {
    // "necklace" appears in 8 of 13 → over the half-the-set threshold.
    const tags = [
      'gold necklace', 'silver necklace', 'name necklace', 'dainty necklace',
      'custom necklace', 'layered necklace', 'initial necklace', 'mom necklace',
      'bridesmaid gift idea', 'birthday present her', 'handmade fine jewelry',
      'minimalist pendant chain', 'everyday charm set',
    ];
    const audit = auditTags(tags);
    const check = audit.checks.find((c) => c.id === 'variety')!;
    expect(check.status).toBe('warn');
    expect(audit.overusedWords[0].word).toBe('necklace');
    expect(audit.overusedWords[0].count).toBe(8);
  });

  it('flags tags over the 20-character limit (Etsy: tags up to 20 chars)', () => {
    const long = 'super extra long bridesmaid necklace tag'; // > 20 chars
    const audit = auditTags([long, ...HEALTHY.slice(1)]);
    const check = audit.checks.find((c) => c.id === 'length')!;
    expect(check.status).toBe('warn');
    expect(audit.flags[0].overLimit).toBe(true);
    expect(audit.flags[0].chars).toBeGreaterThan(ETSY_TAG_MAX_CHARS);
    expect(audit.flags[0].longTail).toBe(false); // over-limit is not a valid long-tail tag
  });

  it('every check carries the Etsy rule it enforces', () => {
    for (const c of auditTags(HEALTHY).checks) {
      expect(c.etsyRule.toLowerCase()).toContain('etsy');
    }
  });
});
