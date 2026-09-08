import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { emojiEngine } from './engine';
import { PUZZLES } from './puzzles';

function cfg(n: number): GameConfig {
  return {
    seed: 3,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

describe('emoji charades engine', () => {
  it('deals 5 puzzles per player with no repeats', () => {
    let s = emojiEngine.createInitialState(cfg(3), makeRng(7));
    expect(s.totalRounds).toBe(15);
    const seen = new Set<number>();
    while (!emojiEngine.isGameOver(s)) {
      if (s.phase === 'ask') {
        expect(seen.has(s.qi!)).toBe(false);
        seen.add(s.qi!);
        const item = PUZZLES[s.qi!]!;
        s = emojiEngine.applyAction(s, { type: 'answer', choice: s.order.indexOf(item.answer) }, s.turn, makeRng(1));
      } else {
        s = emojiEngine.applyAction(s, { type: 'next' }, s.lastEvent!.player, makeRng(1));
      }
    }
    expect(seen.size).toBe(15);
  });

  it('the display permutation never breaks correctness', () => {
    // for 200 random states, the correct display index must always point at the answer
    for (let seed = 1; seed <= 200; seed++) {
      const s = emojiEngine.createInitialState(cfg(2), makeRng(seed));
      const item = PUZZLES[s.qi!]!;
      const correctDisplay = s.order.indexOf(item.answer);
      const after = emojiEngine.applyAction(s, { type: 'answer', choice: correctDisplay }, 0, makeRng(1));
      expect(after.lastEvent?.correct).toBe(true);
    }
  });

  it('rotates turns between players and finishes with the best scorer', () => {
    let s = emojiEngine.createInitialState(cfg(2), makeRng(4));
    const turns: number[] = [];
    while (!emojiEngine.isGameOver(s)) {
      if (s.phase === 'ask') {
        turns.push(s.turn);
        const item = PUZZLES[s.qi!]!;
        const correct = s.order.indexOf(item.answer);
        const choice = s.turn === 0 ? correct : (correct + 2) % 4;
        s = emojiEngine.applyAction(s, { type: 'answer', choice }, s.turn, makeRng(1));
      } else {
        s = emojiEngine.applyAction(s, { type: 'next' }, s.lastEvent!.player, makeRng(1));
      }
    }
    expect(turns.length).toBe(10);
    expect(turns[1]).toBe(1);
    expect(emojiEngine.winners(s)).toEqual([0]);
  });

  it('bot moves are always legal and hard is nearly perfect', () => {
    const rng = makeRng(17);
    let right = 0;
    for (let i = 0; i < 40; i++) {
      const s = emojiEngine.createInitialState(cfg(2), makeRng(i + 1));
      const move = emojiEngine.chooseBotMove(s, 0, rng, 'hard')!;
      expect(emojiEngine.validate(s, move, 0)).toBe(true);
      const item = PUZZLES[s.qi!]!;
      if (move.type === 'answer' && move.choice === s.order.indexOf(item.answer)) right++;
    }
    expect(right).toBeGreaterThanOrEqual(36);
  });

  it('bank stays healthy: emoji present, 4 options, valid answer', () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(36);
    for (const p of PUZZLES) {
      expect(p.emojis.trim().length).toBeGreaterThan(0);
      expect(p.options).toHaveLength(4);
      expect(p.answer).toBeLessThan(4);
      for (const o of p.options) {
        expect(o.fa.length).toBeGreaterThan(0);
        expect(o.en.length).toBeGreaterThan(0);
      }
    }
  });
});
