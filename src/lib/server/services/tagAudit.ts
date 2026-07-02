/**
 * Deterministic, Etsy-rule-based audit of a generated tag set (VieRank honesty USP).
 *
 * Every check here maps to an explicit rule from Etsy's own Seller Handbook / Help Center, so the
 * feedback is Etsy's documented guidance — not our opinion, and not an LLM guess:
 *
 *   - "Tags are your opportunity to include 13 phrases… use all 13."        → completeness check
 *   - "Your tags can be up to 20 characters long."                          → length check
 *   - "Use multi-word phrases… 'custom bracelet' is stronger than 'custom'
 *      and 'bracelet'."                                                      → multi-word check
 *   - "Don't repeat tags — the 13 tags should all be as unique as possible;
 *      spread them around and add some variety."                            → variety check
 *   - "Use natural-sounding language… long-tail phrases convert better."    → long-tail signal
 *
 * Sources:
 *   https://help.etsy.com/hc/en-us/articles/360000336307-How-to-Use-Tags-to-Get-Found-in-Search
 *   https://www.etsy.com/seller-handbook/article/22794885498 (Brainstorming Keywords for Tags and Titles)
 */

/** Etsy hard limits. */
export const ETSY_TAG_LIMIT = 13;
export const ETSY_TAG_MAX_CHARS = 20;

export interface TagFlag {
  tag: string;
  chars: number;
  wordCount: number;
  /** Single-word tag — Etsy explicitly says multi-word phrases are stronger. */
  singleWord: boolean;
  /** Over Etsy's 20-char limit (defensive; the schema also caps this). */
  overLimit: boolean;
  /** Multi-word, within limits — the long-tail phrase Etsy recommends. */
  longTail: boolean;
}

export interface TagSetCheck {
  id: 'count' | 'multiword' | 'variety' | 'length';
  label: string;
  status: 'pass' | 'warn';
  /** Plain-language result for this tag set. */
  detail: string;
  /** The Etsy guidance this check enforces (shown so the advice is traceable to Etsy). */
  etsyRule: string;
}

export interface TagAudit {
  flags: TagFlag[];
  checks: TagSetCheck[];
  multiWordCount: number;
  singleWordTags: string[];
  /** Meaningful words that appear across many tags (low variety per Etsy). */
  overusedWords: { word: string; count: number }[];
}

const SMALL_WORDS = new Set(['and', 'for', 'the', 'with', 'a', 'an', 'of', 'to', 'in', 'or']);

function words(tag: string): string[] {
  return tag.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Meaningful words (drop connectors) for the cross-tag variety check. */
function contentWords(tag: string): string[] {
  return words(tag).filter((w) => w.length >= 3 && !SMALL_WORDS.has(w));
}

function flagTag(tag: string): TagFlag {
  const wc = words(tag).length;
  const chars = tag.length;
  const overLimit = chars > ETSY_TAG_MAX_CHARS;
  const singleWord = wc <= 1;
  return { tag, chars, wordCount: wc, singleWord, overLimit, longTail: wc >= 2 && !overLimit };
}

/**
 * Audit the 13 main tags against Etsy's documented rules. `expected` defaults to Etsy's 13 but is
 * injectable for tests / future limits.
 */
export function auditTags(tags: string[], expected = ETSY_TAG_LIMIT): TagAudit {
  const flags = tags.map(flagTag);
  const total = flags.length;
  const singleWordTags = flags.filter((f) => f.singleWord).map((f) => f.tag);
  const multiWordCount = total - singleWordTags.length;
  const overLong = flags.filter((f) => f.overLimit).map((f) => f.tag);

  // Variety: count how many DISTINCT tags each meaningful word appears in. A word that dominates
  // most of the set means the tags aren't spread across enough searches (Etsy's "octopus art" /
  // "octopus print" anti-pattern). Flag any word present in more than half the tags.
  const wordTagCount = new Map<string, number>();
  for (const f of flags) {
    for (const w of new Set(contentWords(f.tag))) {
      wordTagCount.set(w, (wordTagCount.get(w) ?? 0) + 1);
    }
  }
  const varietyThreshold = Math.max(4, Math.ceil(total / 2) + 1);
  const overusedWords = [...wordTagCount.entries()]
    .filter(([, count]) => count >= varietyThreshold)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);

  const checks: TagSetCheck[] = [
    {
      id: 'count',
      label: `Using all ${expected} tags`,
      status: total >= expected ? 'pass' : 'warn',
      detail:
        total >= expected
          ? `All ${expected} tags filled — every tag is a chance to match a search.`
          : `Only ${total} of ${expected} tags used — you're leaving ${expected - total} search opportunities on the table.`,
      etsyRule: 'Etsy: "Tags are your opportunity to include 13 phrases… use all 13 tags."',
    },
    {
      id: 'multiword',
      label: 'Multi-word phrases',
      status: singleWordTags.length === 0 ? 'pass' : 'warn',
      detail:
        singleWordTags.length === 0
          ? `All ${total} tags are multi-word phrases — the long-tail Etsy rewards.`
          : `${multiWordCount}/${total} are multi-word. Single-word tags waste a slot: ${singleWordTags.join(', ')}.`,
      etsyRule:
        'Etsy: "Use multi-word phrases — ‘custom bracelet’ is stronger than ‘custom’ and ‘bracelet’."',
    },
    {
      id: 'variety',
      label: 'Unique & varied',
      status: overusedWords.length === 0 ? 'pass' : 'warn',
      detail:
        overusedWords.length === 0
          ? 'Tags are spread across distinct phrases — good variety.'
          : `Low variety: ${overusedWords
              .map((o) => `"${o.word}" in ${o.count} tags`)
              .join(', ')}. Swap some for different angles to reach more searches.`,
      etsyRule:
        'Etsy: "Don’t repeat tags — the 13 tags should all be as unique as possible; spread them around and add variety."',
    },
    {
      id: 'length',
      label: `Within ${ETSY_TAG_MAX_CHARS} characters`,
      status: overLong.length === 0 ? 'pass' : 'warn',
      detail:
        overLong.length === 0
          ? `Every tag fits Etsy's ${ETSY_TAG_MAX_CHARS}-character limit.`
          : `Over the ${ETSY_TAG_MAX_CHARS}-char limit: ${overLong.join(', ')}.`,
      etsyRule: `Etsy: "Your tags can be up to ${ETSY_TAG_MAX_CHARS} characters long."`,
    },
  ];

  return { flags, checks, multiWordCount, singleWordTags, overusedWords };
}
