/**
 * Deterministic, Etsy-rule-based audit of a generated listing description (VieRank honesty USP).
 *
 * Every check maps to documented Etsy guidance so the feedback is Etsy's own, not an LLM guess:
 *
 *   - "Clearly describe your item in the first sentence — a person should read it and know
 *      exactly what you're selling."                                       → first-sentence check
 *   - "The first 160 characters… is used to create the meta description… shown under your page
 *      title on a search engine results page."                             → Google-snippet preview
 *   - "Etsy search considers keywords within your listing descriptions… incorporate relevant
 *      keywords in the first few sentences."                               → opening-keywords check
 *   - "Put essential information at the top, such as sizes, dimensions, colors… materials, care
 *      instructions."                                                       → essential-details check
 *   - "Utilize short paragraphs and lists for key details."                → scannable check
 *   - "Use keywords… but avoid repeating the same phrases over and over."  → no-stuffing check
 *
 * Sources:
 *   https://www.etsy.com/seller-handbook/article/1347574487014 (The Anatomy of a Well-Crafted Etsy Listing)
 *   https://help.etsy.com/hc/en-us/articles/115015663987 (SEO for Shop and Listing Pages)
 *   https://www.etsy.com/seller-handbook/article/26330089019 (5 Tips for Writing Listing Descriptions)
 */
import { extractFocusTerms } from './titleScore';

/** Etsy uses the first 160 characters of the description as the page's meta description. */
export const ETSY_META_CHARS = 160;

const FLUFF_WORDS = new Set([
  'perfect', 'beautiful', 'stunning', 'gorgeous', 'amazing', 'exquisite', 'flawless',
]);

export interface DescCheck {
  id: 'first-sentence' | 'opening-keywords' | 'essential-details' | 'scannable' | 'no-stuffing';
  label: string;
  status: 'pass' | 'warn';
  detail: string;
  etsyRule: string;
}

export interface DescriptionAudit {
  checks: DescCheck[];
  /** The first 160 characters, whitespace-collapsed — what Google shows under the page title. */
  metaPreview: string;
  metaChars: number;
  firstSentence: string;
  wordCount: number;
  charCount: number;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  return (haystack.match(re) ?? []).length;
}

const DETAIL_RE =
  /\b(material|materials|fabric|cotton|wool|leather|wood|metal|gold|silver|ceramic|size|sizes|dimension|dimensions|measure|measures|measurement|inch|inches|"|cm|mm|care|wash|clean|color|colors|colour|colours|personaliz|personalis|custom)\b/i;

/** Audit a generated description against Etsy's documented rules, given the product's focus terms. */
export function auditDescription(description: string, focus: string[]): DescriptionAudit {
  const charCount = description.length;
  const wordCount = (description.match(/[a-z0-9][a-z0-9'’-]*/gi) ?? []).length;
  const collapsed = description.replace(/\s+/g, ' ').trim();
  const metaPreview = collapsed.slice(0, ETSY_META_CHARS);
  const lowerMeta = metaPreview.toLowerCase();

  // First sentence OR first line, whichever comes first — a caps hook on its own line is the
  // opening a shopper actually sees, so split on newlines as well as sentence punctuation.
  const firstSentence = (description.split(/[.!?\n]/).map((s) => s.trim()).find(Boolean) ?? collapsed).trim();
  const fsLower = firstSentence.toLowerCase();
  const fsWords = (firstSentence.match(/[a-z0-9][a-z0-9'’-]*/gi) ?? []).length;
  const fsHasKeyword = focus.some((t) => fsLower.includes(t));
  // An all-caps "PRODUCT NAME ✨" hook is not a real, readable first sentence.
  const fsIsGimmick = firstSentence.length > 0 && firstSentence === firstSentence.toUpperCase();

  const metaKeywordCount = focus.filter((t) => lowerMeta.includes(t)).length;
  const keywordTarget = Math.min(2, focus.length);

  const lower = description.toLowerCase();
  const stuffed = focus
    .map((t) => ({ term: t, n: countOccurrences(lower, t) }))
    .filter((x) => x.n > 6);
  const fluffFound = [...new Set((lower.match(/[a-z]+/g) ?? []).filter((w) => FLUFF_WORDS.has(w)))];

  const newlines = (description.match(/\n/g) ?? []).length;
  const hasBullets = /[••]/.test(description) || /^\s*[-*]\s/m.test(description);
  const scannable = newlines >= 3 || hasBullets;

  const checks: DescCheck[] = [
    {
      id: 'first-sentence',
      label: 'First sentence states the item',
      status: fsHasKeyword && fsWords >= 4 && !fsIsGimmick ? 'pass' : 'warn',
      detail:
        fsHasKeyword && fsWords >= 4 && !fsIsGimmick
          ? 'Opens with a clear sentence naming the item — a shopper knows what it is immediately.'
          : fsIsGimmick
            ? 'Opens with an ALL-CAPS hook — replace it with a real sentence that names the item.'
            : 'The first sentence doesn’t clearly name the item with a keyword — say what it is up front.',
      etsyRule:
        'Etsy: "Clearly describe your item in the first sentence — a person should read it and know exactly what you’re selling."',
    },
    {
      id: 'opening-keywords',
      label: 'Keywords in the first 160 characters',
      status: metaKeywordCount >= Math.max(1, keywordTarget) ? 'pass' : 'warn',
      detail:
        metaKeywordCount >= Math.max(1, keywordTarget)
          ? `The opening (your Google snippet) carries ${metaKeywordCount} of your key terms — good for Etsy search and Google.`
          : 'Few keywords in the opening 160 characters — this text is your Google snippet and Etsy weights it, so work a key term or two in naturally.',
      etsyRule:
        'Etsy: "The first 160 characters become your meta description… incorporate relevant keywords in the first few sentences."',
    },
    {
      id: 'essential-details',
      label: 'Essential details included',
      status: DETAIL_RE.test(description) ? 'pass' : 'warn',
      detail: DETAIL_RE.test(description)
        ? 'Mentions concrete details (materials, size, colors, care or customization).'
        : 'No concrete details detected — add materials, dimensions, colors, or care instructions.',
      etsyRule:
        'Etsy: "Put essential information at the top, such as sizes, dimensions, colors, materials and care instructions."',
    },
    {
      id: 'scannable',
      label: 'Scannable layout',
      status: scannable ? 'pass' : 'warn',
      detail: scannable
        ? 'Broken into short paragraphs / lists — easy for buyers to skim.'
        : 'One dense block — split into short paragraphs or a bulleted list of key details.',
      etsyRule: 'Etsy: "Utilize short paragraphs and lists for key details, like materials and measurements."',
    },
    {
      id: 'no-stuffing',
      label: 'No keyword stuffing',
      status: stuffed.length === 0 && fluffFound.length === 0 ? 'pass' : 'warn',
      detail:
        stuffed.length === 0 && fluffFound.length === 0
          ? 'Reads naturally — no phrase is repeated to excess.'
          : [
              stuffed.length
                ? `Repeated too often: ${stuffed.map((s) => `"${s.term}" ×${s.n}`).join(', ')}`
                : '',
              fluffFound.length ? `Subjective filler: ${fluffFound.join(', ')}` : '',
            ]
              .filter(Boolean)
              .join('. ') + '.',
      etsyRule:
        'Etsy: "Use keywords shoppers will search, but avoid repeating the same phrases over and over."',
    },
  ];

  return { checks, metaPreview, metaChars: metaPreview.length, firstSentence, wordCount, charCount };
}

export { extractFocusTerms };
