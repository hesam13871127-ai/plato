import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { memoryEngine, type MemoryState } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 31,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

/** deal a fixed layout for deterministic assertions */
function fixedState(pairs: string[]): MemoryState {
  const symbols = [...pairs, ...pairs];
  return {
    playerCount: 2,
    cols: 4,
    rows: 4,
    symbols,
    revealed: symbols.map(() => false),
    owner: symbols.map(() => -1),
    seen: symbols.map(() => false),
    first: null,
    peek: [],
    turn: 0,
    pairs: [0, 0],
    phase: 'pick',
    lastEvent: null,
  };
}

describe('memory engine', () => {
  it('deals a symmetric grid sized by player count', () => {
    const s2 = memoryEngine.createInitialState(cfg(2), makeRng(1));
    expect([s2.cols, s2.rows]).toEqual([4, 4]);
    const s3 = memoryEngine.createInitialState(cfg(3), makeRng(1));
    expect([s3.cols, s3.rows]).toEqual([5, 4]);
    const s4 = memoryEngine.createInitialState(cfg(4), makeRng(1));
    expect([s4.cols, s4.rows]).toEqual([6, 4]);
    for (const s of [s2, s3, s4]) {
      const counts = new Map<string, number>();
      for (const sym of s.symbols) counts.set(sym, (counts.get(sym) ?? 0) + 1);
      expect([...counts.values()].every((c) => c === 2)).toBe(true);
      expect(s.symbols.length).toBe(s.cols * s.rows);
    }
  });

  it('first pick stores the card; second matching pick keeps both and grants an extra turn', () => {
    let s = fixedState(['🦊', '🐼', '🐧', '🦉', '🐢', '🦄', '🐝', '🦋']);
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 0 }, 0, makeRng(1));
    expect(s.first).toBe(0);
    expect(s.lastEvent).toEqual({ player: 0, a: 0, b: null, match: false });
    // idx 8 holds the same symbol as idx 0
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 8 }, 0, makeRng(1));
    expect(s.revealed[0]).toBe(true);
    expect(s.revealed[8]).toBe(true);
    expect(s.owner[0]).toBe(0);
    expect(s.pairs[0]).toBe(1);
    expect(s.turn).toBe(0); // extra turn
    expect(s.first).toBeNull();
  });

  it('mismatch flips back, passes the turn and shows the peek pair', () => {
    let s = fixedState(['🦊', '🐼', '🐧', '🦉', '🐢', '🦄', '🐝', '🦋']);
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 0 }, 0, makeRng(1));
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 1 }, 0, makeRng(1)); // different symbol
    expect(s.revealed[0]).toBe(false);
    expect(s.revealed[1]).toBe(false);
    expect(s.peek).toEqual([0, 1]);
    expect(s.turn).toBe(1);
    expect(s.pairs).toEqual([0, 0]);
    // cards were "seen" — the bot can remember them
    expect(s.seen[0]).toBe(true);
    expect(s.seen[1]).toBe(true);
  });

  it('rejects revealing matched cards or the same card twice', () => {
    let s = fixedState(['🦊', '🐼']);
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 0 }, 0, makeRng(1));
    expect(memoryEngine.validate(s, { type: 'reveal', idx: 0 }, 0)).toBe(false);
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 2 }, 0, makeRng(1)); // match
    expect(memoryEngine.validate(s, { type: 'reveal', idx: 0 }, 0)).toBe(false);
    expect(memoryEngine.validate(s, { type: 'reveal', idx: 2 }, 0)).toBe(false);
    expect(memoryEngine.validate(s, { type: 'reveal', idx: 1 }, 1)).toBe(false); // wrong turn
  });

  it('ends when all pairs are found and elects the player with most pairs', () => {
    // layout: symbols = [A,B,C,A,B,C]
    let s = fixedState(['🦊', '🐼', '🐧']);
    // p0 takes the 🦊 pair and gets an extra turn
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 0 }, 0, makeRng(1));
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 3 }, 0, makeRng(1));
    expect(s.pairs[0]).toBe(1);
    expect(s.turn).toBe(0);
    // p0 mismatches (🐼 vs 🐧) → turn passes
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 1 }, 0, makeRng(1));
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 2 }, 0, makeRng(1));
    expect(s.turn).toBe(1);
    // p1 mismatches too (🐼 vs 🐧) → back to p0
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 1 }, 1, makeRng(1));
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 5 }, 1, makeRng(1));
    expect(s.turn).toBe(0);
    expect(memoryEngine.isGameOver(s)).toBe(false);
    // p0 sweeps the last two pairs
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 1 }, 0, makeRng(1));
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 4 }, 0, makeRng(1));
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 2 }, 0, makeRng(1));
    s = memoryEngine.applyAction(s, { type: 'reveal', idx: 5 }, 0, makeRng(1));
    expect(memoryEngine.isGameOver(s)).toBe(true);
    expect(s.pairs).toEqual([3, 0]);
    expect(memoryEngine.winners(s)).toEqual([0]);
  });

  it('hard bot always matches a pair it has seen', () => {
    const base = fixedState(['🦊', '🐼', '🐧', '🦉', '🐢', '🦄', '🐝', '🦋']);
    // both 🦊 cards (idx 0 and its twin idx 8) were flashed earlier — hard bot remembers
    const s: MemoryState = { ...base, turn: 1, seen: base.seen.map((v, i) => v || i === 0 || i === 8) };
    const rng = makeRng(4);
    const first = memoryEngine.chooseBotMove(s, 1, rng, 'hard')!;
    expect(first.type).toBe('reveal');
    expect([0, 8]).toContain(first.idx);
    const s2 = memoryEngine.applyAction(s, first, 1, rng);
    const second = memoryEngine.chooseBotMove(s2, 1, rng, 'hard')!;
    expect(second.type).toBe('reveal');
    const s3 = memoryEngine.applyAction(s2, second, 1, rng);
    expect(s3.pairs[1]).toBe(1);
    expect(s3.turn).toBe(1); // matched → extra turn
  });

  it('a random scribble of clicks never breaks invariants (fuzz)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let s = memoryEngine.createInitialState(cfg(2), makeRng(seed));
      const rng = makeRng(seed * 13);
      let guard = 0;
      while (!memoryEngine.isGameOver(s) && guard++ < 400) {
        const move = memoryEngine.chooseBotMove(s, s.turn, rng, 'medium');
        if (!move) break;
        expect(memoryEngine.validate(s, move, s.turn)).toBe(true);
        s = memoryEngine.applyAction(s, move, s.turn, rng);
      }
      expect(memoryEngine.isGameOver(s)).toBe(true);
      const total = s.pairs.reduce((a, b) => a + b, 0);
      expect(total).toBe(s.symbols.length / 2);
    }
  });
});
