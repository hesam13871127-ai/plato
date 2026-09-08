import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { bingoEngine, completedLines, type BingoCard } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 1,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

function cardWith(numbers: number[][]): BingoCard {
  return {
    numbers,
    marked: numbers.map((col) => col.map((n) => n === 0)),
  };
}

describe('bingo engine', () => {
  it('deals unique numbers per column range and a 75-ball pool', () => {
    const s = bingoEngine.createInitialState(cfg(4), makeRng(7));
    expect(s.pool.length + s.drawn.length).toBe(75);
    for (const card of s.cards) {
      for (let c = 0; c < 5; c++) {
        const col = card.numbers[c]!;
        expect(new Set(col).size).toBe(5);
        for (const n of col) {
          if (n === 0) continue;
          expect(n).toBeGreaterThan(c * 15);
          expect(n).toBeLessThanOrEqual(c * 15 + 15);
        }
      }
      expect(card.numbers[2]![2]).toBe(0);
      expect(card.marked[2]![2]).toBe(true);
    }
  });

  it('marks the drawn number on every card', () => {
    let s = bingoEngine.createInitialState(cfg(2), makeRng(3));
    // force a known number: put card0's B number into the next draw by exhausting
    const target = s.cards[0]!.numbers[0]![0]!;
    let guard = 0;
    while (s.lastEvent?.number !== target && guard++ < 200 && s.phase === 'draw') {
      s = bingoEngine.applyAction(s, { type: 'draw' }, s.turn, makeRng(guard * 31 + 5));
    }
    expect(s.drawn).toContain(target);
    for (const card of s.cards) {
      for (let c = 0; c < 5; c++) {
        for (let r = 0; r < 5; r++) {
          if (card.numbers[c]![r] === target) expect(card.marked[c]![r]).toBe(true);
        }
      }
    }
  });

  it('detects completed lines including diagonals and the free center', () => {
    const card = cardWith([
      [1, 2, 3, 4, 5].map((n) => n * 1),
      [16, 17, 18, 19, 20],
      [31, 32, 0, 34, 35],
      [46, 47, 48, 49, 50],
      [61, 62, 63, 64, 65],
    ]);
    // top row marked
    card.marked[0]![0] = true;
    card.marked[1]![0] = true;
    card.marked[2]![0] = true;
    card.marked[3]![0] = true;
    card.marked[4]![0] = true;
    // diagonal (0,0)(1,1)(2,2=free)(3,3)(4,4)
    card.marked[1]![1] = true;
    card.marked[3]![3] = true;
    card.marked[4]![4] = true;
    expect(completedLines(card)).toBe(2);
  });

  it('ends the game when someone completes a line', () => {
    let s = bingoEngine.createInitialState(cfg(2), makeRng(11));
    let guard = 0;
    while (s.phase === 'draw' && guard++ < 120) {
      s = bingoEngine.applyAction(s, { type: 'draw' }, s.turn, makeRng(guard * 17 + 3));
    }
    expect(s.phase).toBe('over');
    expect(bingoEngine.winners(s).length).toBeGreaterThanOrEqual(1);
    for (const w of bingoEngine.winners(s)) {
      expect(completedLines(s.cards[w]!)).toBeGreaterThan(0);
    }
  });

  it('bots finish a full game legally', () => {
    let s = bingoEngine.createInitialState(cfg(3), makeRng(99));
    for (let i = 0; i < 100 && !bingoEngine.isGameOver(s); i++) {
      const move = bingoEngine.chooseBotMove(s, s.turn, makeRng(i + 1), 'medium');
      expect(move).not.toBeNull();
      s = bingoEngine.applyAction(s, move!, s.turn, makeRng(i * 13 + 1));
    }
    expect(bingoEngine.isGameOver(s)).toBe(true);
  });
});
