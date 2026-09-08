import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { chainEngine, normWord, STARTING_LIVES } from './engine';
import { enWords, faWords } from './words';

function cfg(n: number, lang: 'fa' | 'en' = 'fa'): GameConfig {
  return {
    seed: 21,
    lang,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

describe('word chain engine', () => {
  it('starts on a rich letter with full lives', () => {
    const s = chainEngine.createInitialState(cfg(2), makeRng(5));
    expect(s.phase).toBe('play');
    expect(s.lives).toEqual([STARTING_LIVES, STARTING_LIVES]);
    expect(s.active).toEqual([true, true]);
    expect(s.letter.length).toBe(1);
    expect(chainEngine.legalActions(s, 0).length).toBeGreaterThan(1);
  });

  it('accepts a valid word, updates the letter and the score', () => {
    let s = chainEngine.createInitialState(cfg(2), makeRng(5));
    s = { ...s, letter: 'س' };
    s = chainEngine.applyAction(s, { type: 'word', word: 'سیب' }, 0, makeRng(1));
    expect(s.words).toEqual(['سیب']);
    expect(s.letter).toBe('ب');
    expect(s.score[0]).toBe(1);
    expect(s.turn).toBe(1);
    s = chainEngine.applyAction(s, { type: 'word', word: 'باران' }, 1, makeRng(1));
    expect(s.letter).toBe('ن');
    expect(s.words).toHaveLength(2);
  });

  it('rejects wrong-start, unknown, duplicate and too-short words', () => {
    let s = chainEngine.createInitialState(cfg(2), makeRng(5));
    s = { ...s, letter: 'س' };
    expect(chainEngine.validate(s, { type: 'word', word: 'کتاب' }, 0)).toBe(false);
    expect(chainEngine.validate(s, { type: 'word', word: 'سلامخالق' }, 0)).toBe(false);
    expect(chainEngine.validate(s, { type: 'word', word: 'س' }, 0)).toBe(false);
    s = chainEngine.applyAction(s, { type: 'word', word: 'سیب' }, 0, makeRng(1));
    s = { ...s, letter: 'س' };
    expect(chainEngine.validate(s, { type: 'word', word: 'سیب' }, 1)).toBe(false); // duplicate
    expect(chainEngine.validate(s, { type: 'word', word: 'سیب' }, 0)).toBe(false); // not your turn
  });

  it('normalizes Persian letters (آ→ا) for chaining', () => {
    const s = chainEngine.createInitialState(cfg(2), makeRng(5));
    expect(normWord('آفتاب', 'fa')[0]).toBe('ا');
    const onA = { ...s, letter: 'ا' };
    expect(chainEngine.validate(onA, { type: 'word', word: 'آفتاب' }, 0)).toBe(true);
  });

  it('forfeit costs a life, eliminates at zero and skips the dead', () => {
    let s = chainEngine.createInitialState(cfg(3), makeRng(5));
    s = { ...s, letter: 'س' };
    s = chainEngine.applyAction(s, { type: 'forfeit' }, 0, makeRng(1));
    expect(s.lives[0]).toBe(STARTING_LIVES - 1);
    expect(s.lastEvent?.kind).toBe('forfeit');
    expect(s.turn).toBe(1);
    // player 1 keeps the chain going; player 0 burns their remaining lives
    s = chainEngine.applyAction(s, { type: 'word', word: 'ساعت' }, 1, makeRng(1)); // → ت
    s = { ...s, turn: 0 };
    s = chainEngine.applyAction(s, { type: 'forfeit' }, 0, makeRng(1));
    s = chainEngine.applyAction(s, { type: 'word', word: 'تخته' }, 1, makeRng(1)); // → ه
    s = { ...s, turn: 0 };
    s = chainEngine.applyAction(s, { type: 'forfeit' }, 0, makeRng(1));
    expect(s.lives[0]).toBe(0);
    expect(s.active[0]).toBe(false);
    expect(s.lastEvent?.kind).toBe('out');
    expect(s.turn).toBe(1);
    expect(chainEngine.isGameOver(s)).toBe(false); // two players still alive
  });

  it('the last player standing wins', () => {
    let s = chainEngine.createInitialState(cfg(2), makeRng(5));
    s = { ...s, letter: 'س' };
    let guard = 0;
    while (!chainEngine.isGameOver(s) && guard++ < 60) {
      if (s.turn === 0) {
        s = chainEngine.applyAction(s, { type: 'forfeit' }, 0, makeRng(1));
      } else {
        const rng = makeRng(guard * 7);
        const move = chainEngine.chooseBotMove(s, 1, rng, 'hard');
        if (!move) break;
        s = chainEngine.applyAction(s, move, 1, rng);
      }
    }
    expect(s.lives[0]).toBe(0);
    expect(chainEngine.isGameOver(s)).toBe(true);
    expect(chainEngine.winners(s)).toEqual([1]);
  });

  it('rotate is only legal when the letter is exhausted', () => {
    let s = chainEngine.createInitialState(cfg(2), makeRng(5));
    s = { ...s, letter: 'و', words: ['والیبال', 'وزیر', 'ویلن'] };
    expect(chainEngine.validate(s, { type: 'rotate' }, 0)).toBe(true);
    s = chainEngine.applyAction(s, { type: 'rotate' }, 0, makeRng(9));
    expect(s.letter).not.toBe('و');
    expect(chainEngine.legalActions(s, 0).filter((a) => a.type === 'word').length).toBeGreaterThanOrEqual(3);

    const fresh = chainEngine.createInitialState(cfg(2), makeRng(5));
    expect(chainEngine.validate(fresh, { type: 'rotate' }, 0)).toBe(false);
  });

  it('hard bot strands the opponent with the poorest next letter', () => {
    const s = chainEngine.createInitialState(cfg(2), makeRng(5));
    const stuck = { ...s, letter: 'س', words: [] as string[] };
    const move = chainEngine.chooseBotMove(stuck, 0, makeRng(3), 'hard');
    expect(move?.type).toBe('word');
    // replicate the strategy independently and expect the same pick
    const fa = [...new Set(faWords.map((w) => normWord(w, 'fa')))];
    const movesFor = (letter: string, except?: string) => fa.filter((w) => w[0] === letter && w !== except);
    let bestWord = '';
    let bestScore = Infinity;
    for (const w of movesFor('س')) {
      const nextLetter = w[w.length - 1]!;
      const cont = movesFor(nextLetter, w).length;
      const sc = cont * 100 - w.length;
      if (sc < bestScore) {
        bestScore = sc;
        bestWord = w;
      }
    }
    expect(bestWord.length).toBeGreaterThan(0);
    expect((move as { word: string }).word).toBe(bestWord);
  });

  it('fa lexicon: unique, ≥2 chars, and every ending letter has ≥2 starters', () => {
    expect(faWords.length).toBeGreaterThanOrEqual(150);
    expect(new Set(faWords).size).toBe(faWords.length);
    const byFirst = new Map<string, number>();
    for (const w of faWords) {
      expect(w.length).toBeGreaterThanOrEqual(2);
      byFirst.set(w[0]!, (byFirst.get(w[0]!) ?? 0) + 1);
    }
    for (const w of faWords) {
      const last = w[w.length - 1]!;
      expect(byFirst.get(last) ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('en lexicon: unique, ≥2 chars, and every ending letter has ≥2 starters', () => {
    expect(enWords.length).toBeGreaterThanOrEqual(120);
    expect(new Set(enWords).size).toBe(enWords.length);
    const byFirst = new Map<string, number>();
    for (const w of enWords) {
      expect(w.length).toBeGreaterThanOrEqual(2);
      byFirst.set(w[0]!, (byFirst.get(w[0]!) ?? 0) + 1);
    }
    for (const w of enWords) {
      const last = w[w.length - 1]!;
      expect(byFirst.get(last) ?? 0).toBeGreaterThanOrEqual(2);
    }
  });
});
