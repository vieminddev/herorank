import { describe, it, expect } from 'vitest';
import { classifyKeyword, applySignals, type RealSnapshot } from '../src/lib/server/services/keywordSignals';

describe('classifyKeyword — Etsy long-tail guidance', () => {
  it('marks multi-word phrases as long-tail', () => {
    const q = classifyKeyword('personalized name necklace');
    expect(q.words).toBe(3);
    expect(q.longTail).toBe(true);
    expect(q.broad).toBe(false);
  });

  it('marks a single broad word as broad, not long-tail', () => {
    const q = classifyKeyword('necklace');
    expect(q.words).toBe(1);
    expect(q.broad).toBe(true);
    expect(q.longTail).toBe(false);
  });

  it('ignores separators when counting words', () => {
    expect(classifyKeyword('gold • necklace').words).toBe(2);
  });
});

describe('applySignals — real-data overlay', () => {
  const rows = [
    { keyword: 'Name Necklace', volume: 1200, competition: 'high', cpc: '$0.9', trend: '+5%' },
    { keyword: 'dainty gold pendant', volume: 800, competition: 'medium', cpc: '$0.5', trend: '-2%' },
  ];

  it('flags rows that match the real-data map (keyed by normalized keyword)', () => {
    const realMap = new Map<string, RealSnapshot>([
      ['name necklace', { demandScore: 78, resultCount: 4200, competition: 'low' }],
    ]);
    const out = applySignals(rows, realMap);

    // Matched row carries REAL demand + real competition, normalized despite mixed casing.
    expect(out[0].real).toBe(true);
    expect(out[0].realDemand).toBe(78);
    expect(out[0].realCompetition).toBe('low');
    expect(out[0].longTail).toBe(true);

    // Unmatched row stays estimate-only.
    expect(out[1].real).toBe(false);
    expect(out[1].realDemand).toBeNull();
    expect(out[1].realCompetition).toBeNull();
  });

  it('preserves the original AI fields and adds quality flags', () => {
    const out = applySignals(rows, new Map());
    expect(out[0].volume).toBe(1200);
    expect(out[0].competition).toBe('high');
    expect(out[0].cpc).toBe('$0.9');
    expect(out.every((k) => typeof k.longTail === 'boolean' && typeof k.words === 'number')).toBe(true);
    expect(out.every((k) => k.real === false)).toBe(true);
  });
});
