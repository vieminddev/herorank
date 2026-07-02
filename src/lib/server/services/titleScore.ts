/**
 * Deterministic, transparent Etsy title scorer (VieRank honesty USP), aligned to Etsy's CURRENT
 * (2025) listing-title guidance — which shifted from "stuff all 140 characters with keywords" to
 * "write a clear, scannable title for a buyer, not a search engine".
 *
 * Competitors (and our own old prompt) emitted an opaque "SEO score" the LLM made up. This grades
 * each title on five objective levers, each mapped to a documented Etsy rule, and returns the
 * per-lever breakdown so the number is explainable and traceable to Etsy:
 *
 *   - "Lead with the keywords that best describe what your item is…shoppers only see the first
 *      few words."                                                          → Leads with the item
 *   - "Consider using less than 15 words… short, clear, descriptive titles." → Concise & scannable
 *   - "Include the most important traits upfront like color, material, size."→ Key traits included
 *   - "Move subjective words like ‘perfect’ or ‘beautiful’ to the description."→ No subjective words
 *   - "Keep a buyer in mind, not a computer… avoid keyword stuffing."        → Readable, not stuffed
 *
 * Sources:
 *   https://www.etsy.com/seller-handbook/article/1399426136697 (New Guidance for Listing Titles)
 *   https://www.etsy.com/seller-handbook/article/22794885498   (Brainstorming Keywords for Tags and Titles)
 *
 * Total = 100, summed from the five weights below. The LLM only writes the titles; it never scores.
 */

const WEIGHTS = {
  leadsWithItem: 25, // the item / main keyword is in the first words (Etsy: shoppers see those first)
  concise: 25, // short and scannable, ideally < 15 words (Etsy's 2025 guidance)
  traits: 20, // carries the key descriptive traits (color/material/size/etc.)
  noFluff: 15, // no subjective filler words ("perfect", "beautiful") — Etsy says move those out
  readable: 15, // reads for a buyer, not a keyword-stuffed jumble
} as const;

/** The Etsy rule each lever enforces (shown in the UI so the score is traceable to Etsy). */
export const ETSY_TITLE_RULES: Record<string, string> = {
  'Leads with the item':
    'Etsy: "Lead with the keywords that best describe what your item is — shoppers only see the first few words."',
  'Concise & scannable':
    'Etsy: "Consider using less than 15 words… short, clear, descriptive titles are preferable."',
  'Key traits included':
    'Etsy: "Include the most important traits upfront, like color, material, and size."',
  'No subjective words':
    'Etsy: "Move subjective words like ‘perfect’ or ‘beautiful’ to the description."',
  'Readable, not stuffed':
    'Etsy: "Keep a buyer in mind, not a computer — avoid keyword stuffing."',
};

// Subjective / superlative filler Etsy says belongs in the description, not the title.
const FLUFF_WORDS = new Set([
  'perfect', 'beautiful', 'stunning', 'gorgeous', 'amazing', 'lovely', 'adorable', 'exquisite',
  'wonderful', 'fabulous', 'awesome', 'pretty', 'charming', 'magnificent', 'breathtaking',
  'flawless', 'best', 'finest', 'ultimate',
]);

export interface ScoreBreakdownItem {
  /** Short label shown in the UI (matches a key in ETSY_TITLE_RULES). */
  label: string;
  points: number;
  max: number;
  /** One-line plain-language reason for the points awarded. */
  note: string;
  /** The Etsy guideline this lever enforces. */
  etsyRule: string;
}

export interface TitleScore {
  title: string;
  chars: number;
  score: number; // 0-100, sum of breakdown points
  breakdown: ScoreBreakdownItem[];
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'or', 'for', 'with', 'to', 'of', 'in', 'on', 'at', 'by', 'from',
  'your', 'you', 'our', 'is', 'are', 'be', 'this', 'that', 'it', 'as', 'so', 'who', 'whom',
  'gift', 'gifts', 'perfect', 'great', 'best', 'new', 'custom', 'personalized', 'handmade',
  'made', 'item', 'product', 'sell', 'selling', 'etsy', 'listing',
]);

/** Meaningful lowercase tokens (≥3 chars, not a stopword). Used for keyword logic + repeat check. */
function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length >= 3 && !STOPWORDS.has(t)
  );
}

/**
 * Extract the product's "focus" vocabulary from the description: meaningful tokens ranked by
 * frequency (ties broken by first appearance), capped at `max`. These are the words a strong title
 * should front-load and cover.
 */
export function extractFocusTerms(description: string, max = 6): string[] {
  const order: string[] = [];
  const freq = new Map<string, number>();
  for (const t of tokens(description)) {
    if (!freq.has(t)) order.push(t);
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return order
    .sort((a, b) => (freq.get(b)! - freq.get(a)!) || order.indexOf(a) - order.indexOf(b))
    .slice(0, max);
}

/** Count real words (alphanumeric tokens), ignoring separators like "·", "•", "|". */
function wordCount(title: string): number {
  return (title.match(/[a-z0-9][a-z0-9'’-]*/gi) ?? []).length;
}

const SEPARATOR_RE = /[·•|]|,\s/;

function rule(label: string): string {
  return ETSY_TITLE_RULES[label];
}

/** Lever 1 — does the title LEAD with what the item is? (Etsy: shoppers see the first words only.) */
function scoreLeadsWithItem(lowerTitle: string, focus: string[]): ScoreBreakdownItem {
  const label = 'Leads with the item';
  const max = WEIGHTS.leadsWithItem;
  const etsyRule = rule(label);
  if (focus.length === 0) {
    return { label, points: 15, max, note: 'No keywords could be extracted from the description to check against.', etsyRule };
  }
  const head40 = lowerTitle.slice(0, 40);
  const head60 = lowerTitle.slice(0, 60);
  if (focus.some((t) => head40.includes(t))) {
    return { label, points: max, max, note: 'States the item in the first 40 characters — exactly what a scanning shopper sees first.', etsyRule };
  }
  if (focus.some((t) => head60.includes(t))) {
    return { label, points: 18, max, note: 'The item appears a bit late — move the core product word to the very front.', etsyRule };
  }
  if (focus.some((t) => lowerTitle.includes(t))) {
    return { label, points: 10, max, note: 'The item word is near the end — shoppers may not see it in search results.', etsyRule };
  }
  return { label, points: 0, max, note: "The title doesn't clearly lead with what the item is.", etsyRule };
}

/** Lever 2 — concise & scannable. Etsy 2025: consider fewer than 15 words. */
function scoreConcise(title: string): ScoreBreakdownItem {
  const label = 'Concise & scannable';
  const max = WEIGHTS.concise;
  const etsyRule = rule(label);
  const w = wordCount(title);
  let points: number;
  let note: string;
  if (w <= 12) {
    points = max;
    note = `${w} words — short and easy to scan.`;
  } else if (w <= 15) {
    points = 22;
    note = `${w} words — right around Etsy's 15-word guideline.`;
  } else if (w <= 20) {
    points = 14;
    note = `${w} words — getting long; Etsy now suggests under 15.`;
  } else if (w <= 25) {
    points = 7;
    note = `${w} words — a long keyword list; trim to what the item actually is.`;
  } else {
    points = 3;
    note = `${w} words — a keyword jumble Etsy's new guidance advises against.`;
  }
  return { label, points, max, note, etsyRule };
}

/** Lever 3 — carries the key descriptive traits (color/material/size/etc.). */
function scoreTraits(lowerTitle: string, focus: string[]): ScoreBreakdownItem {
  const label = 'Key traits included';
  const max = WEIGHTS.traits;
  const etsyRule = rule(label);
  const target = Math.min(5, focus.length);
  if (target === 0) {
    return { label, points: 12, max, note: 'No keywords could be extracted from the description to check against.', etsyRule };
  }
  const top = focus.slice(0, target);
  const covered = top.filter((t) => lowerTitle.includes(t)).length;
  const points = Math.round((covered / target) * max);
  return {
    label,
    points,
    max,
    note: `Includes ${covered}/${target} of the key traits from your description.`,
    etsyRule,
  };
}

/** Lever 4 — no subjective filler words (Etsy: move "perfect"/"beautiful" to the description). */
function scoreNoFluff(title: string): ScoreBreakdownItem {
  const label = 'No subjective words';
  const max = WEIGHTS.noFluff;
  const etsyRule = rule(label);
  const found = [...new Set((title.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => FLUFF_WORDS.has(w)))];
  const points = Math.max(0, max - found.length * 5);
  const note = found.length === 0
    ? 'No subjective filler — every word describes the item itself.'
    : `Move to the description: ${found.join(', ')} — Etsy says subjective words belong there, not the title.`;
  return { label, points, max, note, etsyRule };
}

/** Lever 5 — reads for a buyer, not a keyword-stuffed jumble. */
function scoreReadable(title: string): ScoreBreakdownItem {
  const label = 'Readable, not stuffed';
  const max = WEIGHTS.readable;
  const etsyRule = rule(label);
  const segments = title.split(/[·•|]|,\s/).map((s) => s.trim()).filter(Boolean);
  const w = wordCount(title);
  if (SEPARATOR_RE.test(title) && segments.length >= 2 && segments.length <= 4) {
    return { label, points: max, max, note: `Split into ${segments.length} clear phrases — reads cleanly for a buyer.`, etsyRule };
  }
  if (SEPARATOR_RE.test(title) && segments.length >= 5) {
    return { label, points: 7, max, note: `${segments.length} separator-joined fragments — reads as a keyword list, not a sentence.`, etsyRule };
  }
  if (!SEPARATOR_RE.test(title) && w <= 10) {
    return { label, points: 12, max, note: 'A clean, short phrase — reads naturally without needing separators.', etsyRule };
  }
  return { label, points: 6, max, note: 'One long run-on — break it into a couple of clear phrases for buyers.', etsyRule };
}

/** Score a single title against the product's focus terms, per Etsy's current title guidance. */
export function scoreTitle(title: string, focus: string[]): TitleScore {
  const lower = title.toLowerCase();
  const breakdown = [
    scoreLeadsWithItem(lower, focus),
    scoreConcise(title),
    scoreTraits(lower, focus),
    scoreNoFluff(title),
    scoreReadable(title),
  ];
  const score = breakdown.reduce((sum, b) => sum + b.points, 0);
  return { title, chars: title.length, score, breakdown };
}

/** Score every title produced for a product description. */
export function scoreTitles(titles: string[], description: string): TitleScore[] {
  const focus = extractFocusTerms(description);
  return titles.map((t) => scoreTitle(t, focus));
}
