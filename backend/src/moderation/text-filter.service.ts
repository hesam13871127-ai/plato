import { Injectable } from '@nestjs/common';
import { ContentVerdict } from '../database/enums';
import { BLOCKED_TERMS, PROFANE_TERMS, SPAM_SIGNALS } from './toxic-word-list';

export interface TextFilterResult {
  verdict: ContentVerdict;
  /** Text safe to persist/display (censored when filtered). */
  text: string;
  /** Rules that fired (for logging/flag context). */
  hits: string[];
}

/**
 * Deterministic, dependency-free automated content filter.
 *
 * Normalises text to defeat basic obfuscation (accents, leetspeak digits,
 * repeated characters, spaces/punctuation between letters) then scans against
 * the toxic lexicons and spam signals. Severe terms block the message;
 * profanity is censored with asterisks; repeated/link-heavy messages are
 * flagged as spam.
 */
@Injectable()
export class TextFilterService {
  /** Normalise for matching: lowercase, strip accents, fold leetspeak, remove separators. */
  private normalizeForMatch(input: string): string {
    let t = input
      .toLowerCase()
 .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '');
    // Leetspeak: 4→a, 3→e, 1→i, 0→o, 5→s, 7→t, @→a, $→s.
    const leet: Record<string, string> = { '4': 'a', '3': 'e', '1': 'i', '0': 'o', '5': 's', '7': 't', '@': 'a', $: 's' };
    t = t.replace(/[431057@$]/g, (ch) => leet[ch] ?? ch);
    // Remove anything that is not a-z or whitespace (collapses h-a-t-e, h a t e).
    t = t.replace(/[^a-z\s]/g, ' ');
    // Collapse repeated letters (stupid → stupid, loool → lol-ish) to triples.
    t = t.replace(/([a-z])\1{2,}/g, '$1$1$1');
    // Collapse whitespace.
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  }

  filter(raw: string): TextFilterResult {
    const original = raw ?? '';
    const normalized = this.normalizeForMatch(original);
    const hits: string[] = [];

    // 1) Hard-blocked terms.
    for (const term of BLOCKED_TERMS) {
      if (this.containsTerm(normalized, term)) {
        hits.push(`blocked:${term}`);
      }
    }
    if (hits.length > 0) {
      return { verdict: 'blocked', text: '', hits };
    }

    // 2) Spam: excessive links or scam phrases, or heavy repetition.
    const spamHit = SPAM_SIGNALS.find((signal) => normalized.includes(signal.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()));
    const linkCount = (original.match(/https?:\/\/|www\./gi) ?? []).length;
    const words = normalized.split(' ').filter(Boolean);
    const uniqueWords = new Set(words);
    const isRepetitive = words.length >= 8 && uniqueWords.size / words.length < 0.4;
    if (spamHit || linkCount >= 2 || isRepetitive) {
      return { verdict: 'spam', text: this.censor(original, PROFANE_TERMS), hits: [spamHit ? `spam:${spamHit}` : 'spam:pattern'] };
    }

    // 3) Profanity: censor in place.
    const found = PROFANE_TERMS.filter((term) => this.containsTerm(normalized, term));
    if (found.length > 0) {
      hits.push(...found.map((t) => `profane:${t}`));
      return { verdict: 'filtered', text: this.censor(original, found), hits };
    }

    return { verdict: 'clean', text: original, hits: [] };
  }

  /** Whole-phrase containment on the normalised form. */
  private containsTerm(normalized: string, term: string): boolean {
    const needle = term.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return normalized.includes(needle);
  }

  /** Replace profane terms in the ORIGINAL text with asterisks, preserving length. */
  private censor(original: string, terms: string[]): string {
    let censored = original;
    for (const term of terms) {
      // Match the term allowing separators/leet between letters in the raw text.
      const chars = term.replace(/[^a-z]/g, '').split('');
      const pattern = chars
        .map((ch) => {
          const leet = ch === 'a' ? '[a4@]' : ch === 'e' ? '[e3]' : ch === 'i' ? '[i1!]' : ch === 'o' ? '[o0]' : ch === 's' ? '[s5$]' : ch === 't' ? '[t7]' : ch;
      return `${leet}[^a-z0-9]*`;
        })
        .join('');
      const re = new RegExp(pattern, 'gi');
      censored = censored.replace(re, (match) => '*'.repeat(match.replace(/[^a-z0-9]/gi, '').length || term.length));
    }
    return censored;
  }
}
