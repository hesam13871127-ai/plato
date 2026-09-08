import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { impostorEngine, type ImpostorState } from './engine';
import { WORDS } from './words';

function cfg(n: number): GameConfig {
  return {
    seed: 91,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

describe('impostor engine', () => {
  it('rotates the impostor role so everyone gets exactly one turn', () => {
    for (const n of [3, 4, 5, 6]) {
      const s = impostorEngine.createInitialState(cfg(n), makeRng(1));
      expect(s.impostors).toHaveLength(n);
      expect(new Set(s.impostors).size).toBe(n); // every seat exactly once
      expect(s.words).toHaveLength(n);
      expect(new Set(s.words).size).toBe(n); // distinct words
      expect(s.phase).toBe('clue');
    }
  });

  it('crew options come from the word; impostor options NEVER match the word', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = impostorEngine.createInitialState(cfg(4), makeRng(seed));
      for (let r = 0; r < s.playerCount; r++) {
        const word = WORDS[s.words[r]!]!;
        const impostor = s.impostors[r]!;
        for (let seat = 0; seat < s.playerCount; seat++) {
          const opts = s.options[r]![seat]!;
          expect(opts).toHaveLength(4);
          expect(new Set(opts).size).toBe(4);
          if (seat === impostor) {
            for (const o of opts) {
              expect(word.clues).not.toContain(o);
            }
          } else {
            for (const o of opts) {
              expect(word.clues).toContain(o);
            }
          }
        }
        // guess options contain the real word exactly once
        expect(s.guessOptions[r]!.filter((w) => w === s.words[r]).length).toBe(1);
      }
    }
  });

  it('the bank has globally unique clue strings', () => {
    const fa = new Set<string>();
    const en = new Set<string>();
    for (const w of WORDS) {
      expect(w.clues).toHaveLength(8);
      for (const c of w.clues) {
        expect(fa.has(c.fa)).toBe(false);
        expect(en.has(c.en)).toBe(false);
        fa.add(c.fa);
        en.add(c.en);
      }
    }
    expect(WORDS.length).toBeGreaterThanOrEqual(14);
  });

  it('clue phase walks the seats then opens the vote', () => {
    let s = impostorEngine.createInitialState(cfg(3), makeRng(2));
    s = impostorEngine.applyAction(s, { type: 'clue', idx: 0 }, 0, makeRng(2));
    expect(s.clues[0]![0]).not.toBeNull();
    expect(s.phase).toBe('clue');
    s = impostorEngine.applyAction(s, { type: 'clue', idx: 1 }, 1, makeRng(2));
    s = impostorEngine.applyAction(s, { type: 'clue', idx: 2 }, 2, makeRng(2));
    expect(s.phase).toBe('vote');
    expect(s.clues[0]!.every((c) => c !== null)).toBe(true);
  });

  it('a correct accusation with a wrong guess pays the crew', () => {
    let s: ImpostorState = impostorEngine.createInitialState(cfg(3), makeRng(3));
    // feed all clues
    for (let seat = 0; seat < 3; seat++) {
      s = impostorEngine.applyAction(s, { type: 'clue', idx: 0 }, seat, makeRng(3));
    }
    const impostor = s.impostors[0]!;
    const crew = [0, 1, 2].filter((i) => i !== impostor);
    // the crew votes the impostor; the impostor votes a crew member
    for (let seat = 0; seat < 3; seat++) {
      const target = seat === impostor ? crew[0]! : impostor;
      s = impostorEngine.applyAction(s, { type: 'vote', target }, seat, makeRng(3));
    }
    expect(s.phase).toBe('guess');
    // wrong guess
    const realIdx = s.guessOptions[0]!.indexOf(s.words[0]!);
    const wrongIdx = s.guessOptions[0]!.findIndex((_, i) => i !== realIdx)!;
    s = impostorEngine.applyAction(s, { type: 'guess', idx: wrongIdx }, impostor, makeRng(3));
    expect(s.scores[impostor]).toBe(0);
    for (const c of crew) expect(s.scores[c]).toBe(1);
    expect(s.round).toBe(1); // next round opened
    expect(s.phase).toBe('clue');
  });

  it('a caught impostor who guesses the word steals 3 points', () => {
    let s: ImpostorState = impostorEngine.createInitialState(cfg(3), makeRng(4));
    for (let seat = 0; seat < 3; seat++) {
      s = impostorEngine.applyAction(s, { type: 'clue', idx: 0 }, seat, makeRng(4));
    }
    const impostor = s.impostors[0]!;
    const crew = [0, 1, 2].filter((i) => i !== impostor);
    for (let seat = 0; seat < 3; seat++) {
      const target = seat === impostor ? crew[0]! : impostor;
      s = impostorEngine.applyAction(s, { type: 'vote', target }, seat, makeRng(4));
    }
    const realIdx = s.guessOptions[0]!.indexOf(s.words[0]!);
    s = impostorEngine.applyAction(s, { type: 'guess', idx: realIdx }, impostor, makeRng(4));
    expect(s.scores[impostor]).toBe(3);
    expect(s.scores.filter((v, i) => v === 0 && i !== impostor)).toHaveLength(2);
  });

  it('a vote tie (or a missed accusation) lets the impostor keep 2 points', () => {
    let s: ImpostorState = impostorEngine.createInitialState(cfg(4), makeRng(5));
    for (let seat = 0; seat < 4; seat++) {
      s = impostorEngine.applyAction(s, { type: 'clue', idx: 0 }, seat, makeRng(5));
    }
    const impostor = s.impostors[0]!;
    // split the vote: 1-1-1-1 → tie → survive
    const targets = [0, 1, 2, 3].map((i) => (i + 1) % 4);
    for (let seat = 0; seat < 4; seat++) {
      s = impostorEngine.applyAction(s, { type: 'vote', target: targets[seat]! }, seat, makeRng(5));
    }
    expect(s.scores[impostor]).toBe(2);
    expect(s.phase).toBe('clue');
    expect(s.round).toBe(1);
  });

  it('rejects clues/votes/guesses out of turn or out of range', () => {
    const s = impostorEngine.createInitialState(cfg(3), makeRng(6));
    expect(impostorEngine.validate(s, { type: 'clue', idx: 0 }, 1)).toBe(false);
    expect(impostorEngine.validate(s, { type: 'clue', idx: 4 }, 0)).toBe(false);
    expect(impostorEngine.validate(s, { type: 'vote', target: 1 }, 0)).toBe(false); // still clue phase
  });

  it('full bot games finish with consistent scores (fuzz)', () => {
    for (const n of [3, 4, 5, 6]) {
      for (let seed = 1; seed <= 3; seed++) {
        let s = impostorEngine.createInitialState(cfg(n), makeRng(seed * 13 + n));
        const rng = makeRng(seed * 13 + n);
        let guard = 0;
        while (!impostorEngine.isGameOver(s) && guard++ < 400) {
          const actor = impostorEngine.currentPlayers(s)[0]!;
          const move = impostorEngine.chooseBotMove(s, actor, rng, 'medium')!;
          expect(impostorEngine.validate(s, move, actor)).toBe(true);
          s = impostorEngine.applyAction(s, move, actor, rng);
        }
        expect(impostorEngine.isGameOver(s)).toBe(true);
        // each round distributes 2 (survived), n-1 (crew sweep) or 3 (steal) points
        const total = s.scores.reduce((a, b) => a + b, 0);
        expect(total).toBeGreaterThanOrEqual(n * 2);
        expect(total).toBeLessThanOrEqual(n * Math.max(n - 1, 3));
        expect(impostorEngine.winners(s).length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
