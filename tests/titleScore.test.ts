import { describe, it, expect } from 'vitest';
import { scoreTitle, scoreTitles, extractFocusTerms } from '../src/lib/server/services/titleScore';

const DESC =
  'A dainty gold-plated name necklace, a personalized birthday or bridesmaid gift for her.';

describe('extractFocusTerms', () => {
  it('drops stopwords + boilerplate and keeps meaningful product words', () => {
    const terms = extractFocusTerms(DESC);
    expect(terms).toContain('necklace');
    expect(terms).toContain('gold');
    expect(terms).toContain('name');
    // stopwords / generic marketing words are excluded
    expect(terms).not.toContain('for');
    expect(terms).not.toContain('the');
    expect(terms).not.toContain('gift'); // boilerplate stopword
    expect(terms).not.toContain('personalized');
  });

  it('caps the number of terms', () => {
    const terms = extractFocusTerms(DESC, 3);
    expect(terms.length).toBeLessThanOrEqual(3);
  });
});

describe('scoreTitle', () => {
  const focus = extractFocusTerms(DESC);

  it('sums the five levers to the 0-100 total', () => {
    const r = scoreTitle('Gold Name Necklace · Dainty Personalized Gift for Her · Bridesmaid', focus);
    const sum = r.breakdown.reduce((s, b) => s + b.points, 0);
    expect(r.score).toBe(sum);
    expect(r.breakdown.reduce((s, b) => s + b.max, 0)).toBe(100);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('recomputes chars from the title length, never trusting the model', () => {
    const title = 'Gold Necklace';
    expect(scoreTitle(title, focus).chars).toBe(title.length);
  });

  it('rewards a title that leads with the item over one that buries it (Etsy: first words matter)', () => {
    const front = scoreTitle('Gold Name Necklace · Dainty Bridesmaid Jewelry', focus);
    const buried = scoreTitle('A Little Something Special Indeed for Someone You Love Gold Necklace', focus);
    const lever = (r: typeof front) => r.breakdown.find((b) => b.label === 'Leads with the item')!.points;
    expect(lever(front)).toBeGreaterThan(lever(buried));
  });

  it('rewards a concise title over a long keyword jumble (Etsy 2025: under 15 words)', () => {
    const lever = (r: ReturnType<typeof scoreTitle>) =>
      r.breakdown.find((b) => b.label === 'Concise & scannable')!.points;
    const concise = scoreTitle('Gold Name Necklace · Dainty Pendant', focus);
    const jumble = scoreTitle(
      'Gold Name Necklace Dainty Personalized Bridesmaid Birthday Gift for Her Mom Sister Wife Pendant Chain Jewelry Present Idea',
      focus
    );
    expect(lever(concise)).toBeGreaterThan(lever(jumble));
  });

  it('penalizes subjective filler words (Etsy: move "perfect"/"beautiful" to the description)', () => {
    const lever = (t: string) => scoreTitle(t, focus).breakdown.find((b) => b.label === 'No subjective words')!;
    const clean = lever('Gold Name Necklace · Dainty Pendant');
    expect(clean.points).toBe(clean.max);
    const fluffy = lever('Perfect Beautiful Stunning Gold Necklace');
    expect(fluffy.points).toBeLessThan(fluffy.max);
    expect(fluffy.note.toLowerCase()).toContain('perfect');
  });

  it('rewards a clean phrasing over a separator-joined keyword list (Etsy: not stuffed)', () => {
    const lever = (r: ReturnType<typeof scoreTitle>) =>
      r.breakdown.find((b) => b.label === 'Readable, not stuffed')!.points;
    const clean = scoreTitle('Gold Name Necklace · Dainty Pendant Gift', focus);
    const stuffed = scoreTitle('Gold · Name · Necklace · Dainty · Pendant · Gift · Bridesmaid · Jewelry', focus);
    expect(lever(clean)).toBeGreaterThan(lever(stuffed));
  });

  it('every lever carries the Etsy rule it enforces', () => {
    const r = scoreTitle('Gold Name Necklace · Dainty Pendant', focus);
    for (const b of r.breakdown) {
      expect(b.etsyRule?.toLowerCase()).toContain('etsy');
    }
  });
});

describe('scoreTitles', () => {
  it('scores every title and exposes the breakdown', () => {
    const out = scoreTitles(['Gold Name Necklace · Gift', 'Necklace'], DESC);
    expect(out).toHaveLength(2);
    for (const r of out) {
      expect(r.breakdown).toHaveLength(5);
      expect(typeof r.score).toBe('number');
    }
  });
});
