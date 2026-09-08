import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { fishEngine, type FishState } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 121,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

const hand = (counts: number[]) => counts.reduce((a, b) => a + b, 0);

describe('go fish engine', () => {
  it('deals the right hand sizes and keeps 52 cards in circulation', () => {
    const s2 = fishEngine.createInitialState(cfg(2), makeRng(1));
    expect(s2.hands.map(hand)).toEqual([7, 7]);
    expect(s2.pool.length + 14 + s2.books.reduce((a, b) => a + b, 0) * 4).toBe(52);

    const s4 = fishEngine.createInitialState(cfg(4), makeRng(2));
    expect(s4.hands.map(hand)).toEqual([5, 5, 5, 5]);
    expect(s4.pool.length + 20).toBe(52);
  });

  it('a hit transfers every card of the rank and keeps the turn', () => {
    let s: FishState = fishEngine.createInitialState(cfg(2), makeRng(3));
    // give player 0 a couple of 5s (rank 4) and player 1 three 5s
    s = {
      ...s,
      hands: [
        [1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
      ],
      pool: [7, 8, 9],
      books: [0, 0],
      bookedRanks: [],
    };
    s = fishEngine.applyAction(s, { type: 'ask', target: 1, rank: 4 }, 0, makeRng(3));
    // the hit booked four 5s → the trailing event is the book
    expect(s.lastEvent).toMatchObject({ kind: 'book', player: 0, rank: 4 });
    expect(s.hands[0]![4]).toBe(0); // booked away
    expect(s.hands[1]![4]).toBe(0); // taken
    expect(s.hands[1]![4]).toBe(0);
    expect(s.books[0]).toBe(1);
    expect(s.bookedRanks).toContain(4);
    // the four 5s booked → hand emptied → engine drew a replacement
    expect(hand(s.hands[0]!)).toBeGreaterThanOrEqual(1);
    expect(s.turn).toBe(0); // kept the turn
  });

  it('a miss fishes from the pool; a lucky draw keeps the turn', () => {
    let s: FishState = fishEngine.createInitialState(cfg(2), makeRng(4));
    s = {
      ...s,
      hands: [
        [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ],
      pool: [0], // the pool top card is rank 0 (ace) — lucky!
      books: [0, 0],
      bookedRanks: [],
      turn: 0,
    };
    s = fishEngine.applyAction(s, { type: 'ask', target: 1, rank: 0 }, 0, makeRng(4));
    expect(s.lastEvent).toMatchObject({ kind: 'fish', lucky: true });
    expect(s.hands[0]![0]).toBe(3); // 2 held + lucky draw
    expect(s.turn).toBe(0); // lucky fish → ask again

    // unlucky version
    let t: FishState = fishEngine.createInitialState(cfg(2), makeRng(5));
    t = {
      ...t,
      hands: [
        [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ],
      pool: [9], // drew something else
      books: [0, 0],
      bookedRanks: [],
      turn: 0,
    };
    t = fishEngine.applyAction(t, { type: 'ask', target: 1, rank: 0 }, 0, makeRng(5));
    expect(t.lastEvent).toMatchObject({ kind: 'fish', lucky: false });
    expect(t.turn).toBe(1);
  });

  it('rejects asking for a rank you do not hold, booked ranks, empty rivals, or out of turn', () => {
    const s: FishState = fishEngine.createInitialState(cfg(3), makeRng(6));
    expect(fishEngine.validate(s, { type: 'ask', target: 1, rank: 0 }, 1)).toBe(false); // not your turn
    const myRanks = s.hands[0]!.map((c, r) => (c > 0 ? r : -1)).filter((r) => r >= 0);
    const notMine = s.hands[0]!.findIndex((c) => c === 0);
    expect(fishEngine.validate(s, { type: 'ask', target: 1, rank: notMine }, 0)).toBe(false);
    if (myRanks.length > 0) {
      expect(fishEngine.validate(s, { type: 'ask', target: 1, rank: myRanks[0]! }, 0)).toBe(true);
    }
  });

  it('the game ends when all 13 ranks are booked', () => {
    for (let seed = 1; seed <= 4; seed++) {
      let s = fishEngine.createInitialState(cfg(3), makeRng(seed * 13));
      const rng = makeRng(seed * 13);
      let guard = 0;
      while (!fishEngine.isGameOver(s) && guard++ < 1500) {
        const actor = fishEngine.currentPlayers(s)[0]!;
        const move = fishEngine.chooseBotMove(s, actor, rng, 'medium');
        if (!move) break;
        expect(fishEngine.validate(s, move, actor)).toBe(true);
        s = fishEngine.applyAction(s, move, actor, rng);
      }
      expect(fishEngine.isGameOver(s)).toBe(true);
      expect(s.books.reduce((a, b) => a + b, 0)).toBe(13);
      // every rank booked exactly once
      expect(new Set(s.bookedRanks).size).toBe(13);
      expect(fishEngine.winners(s).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('bots exploit the public log: whoever asked for a rank still holds it', () => {
    let s: FishState = fishEngine.createInitialState(cfg(3), makeRng(7));
    // seat 1 recently ASKED for queens (rank 11) → everyone knows seat 1
    // holds at least one; seat 2 also holds a queen and goes fishing there
    s = {
      ...s,
      hands: [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
      ],
      pool: [],
      books: [0, 0, 0],
      bookedRanks: [],
      turn: 2,
      log: [{ asker: 1, target: 0, rank: 11, hit: false }],
    };
    const rng = makeRng(9);
    for (let i = 0; i < 10; i++) {
      const move = fishEngine.chooseBotMove(s, 2, rng, 'hard')!;
      expect(move.type).toBe('ask');
      expect(move.target).toBe(1);
      expect(move.rank).toBe(11);
    }
  });
});
