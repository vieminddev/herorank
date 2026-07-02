/**
 * Keyword signals (VieRank honesty USP) for the Keyword Finder + Bulk Keywords tools.
 *
 * Two layers, both honest about where the number comes from:
 *
 *   1. Etsy "long-tail" quality — Etsy's "Brainstorming Keywords for Tags and Titles" handbook
 *      says to build specific, multi-word long-tail phrases from a single-word root tag, because
 *      long-tail phrases convert better than broad single words. `classifyKeyword` marks each
 *      result long-tail (2+ words) or broad (single word). Deterministic, 100% coverage.
 *      Source: https://www.etsy.com/seller-handbook/article/22794885498
 *
 *   2. Real-data overlay — where our cron has actually measured a keyword (keywords_cache), we
 *      attach the REAL demand score + competition and flag it `real`, so the seller sees which
 *      numbers are measured vs AI-estimated. `applySignals` merges a pre-fetched real-data map
 *      (keyed by normalized keyword) onto the AI rows; everything stays a pure, testable function.
 */
import { normalize } from './etsy/cache';
import type { CompetitionLabel } from './etsy/types';

export interface KeywordQuality {
  words: number;
  /** 2+ words — the specific phrase Etsy recommends. */
  longTail: boolean;
  /** Single word — a broad root tag (high competition, lower conversion per Etsy). */
  broad: boolean;
}

/** Classify a keyword by Etsy's long-tail guidance (word count). */
export function classifyKeyword(keyword: string): KeywordQuality {
  const words = (keyword.trim().match(/[a-z0-9][a-z0-9'’-]*/gi) ?? []).length;
  return { words, longTail: words >= 2, broad: words <= 1 };
}

export interface RealSnapshot {
  demandScore: number;
  resultCount: number;
  competition: CompetitionLabel;
}

export interface EnrichedKeyword extends Record<string, unknown> {
  keyword: string;
  words: number;
  longTail: boolean;
  broad: boolean;
  /** True when this keyword has REAL measured data in keywords_cache. */
  real: boolean;
  /** Real 0-100 demand score when measured, else null. */
  realDemand: number | null;
  /** Real competition when measured, else null. */
  realCompetition: CompetitionLabel | null;
}

/**
 * Merge Etsy long-tail quality + a pre-fetched real-data map onto AI-generated keyword rows.
 * `realMap` is keyed by NORMALIZED keyword (as returned by `KeywordHistoryStore.latestMany`).
 */
export function applySignals(
  keywords: Array<Record<string, unknown>>,
  realMap: Map<string, RealSnapshot>
): EnrichedKeyword[] {
  return keywords.map((k) => {
    const keyword = String(k.keyword ?? '');
    const q = classifyKeyword(keyword);
    const hit = realMap.get(normalize(keyword));
    return {
      ...k,
      keyword,
      words: q.words,
      longTail: q.longTail,
      broad: q.broad,
      real: !!hit,
      realDemand: hit ? hit.demandScore : null,
      realCompetition: hit ? hit.competition : null,
    };
  });
}
