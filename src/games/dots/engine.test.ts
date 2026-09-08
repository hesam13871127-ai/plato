import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { dotsEngine, edgeIndex, type DotsState } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 1,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

describe('dots & boxes engine', () => {
  it('starts with all edges open and no boxes', () => {
    const s = dotsEngine.createInitialState(cfg(2), makeRng(1));
    expect(s.h.every((e) => e === -1)).toBe(true);
    expect(s.v.every((e) => e === -1)).toBe(true);
    expect(s.boxes.every((b) => b === -1)).toBe(true);
    expect(s.remaining).toBe(40); // 2 * 4 * 5
    expect(dotsEngine.legalActions(s, 0).length).toBe(40);
    expect(dotsEngine.legalActions(s, 1)).toEqual([]);
  });

  it('completing a box grants another turn and a point', () => {
    let s = dotsEngine.createInitialState(cfg(2), makeRng(1));
    // build 3 sides of box (0,0)
    const place = (kind: 'h' | 'v', r: number, c: number) => {
      s = dotsEngine.applyAction(s, { type: 'line', kind, r, c }, s.turn, makeRng(1));
    };
    place('h', 0, 0); // p0 top
    place('h', 1, 0); // p1 bottom
    place('v', 0, 0); // p0 left
    place('v', 0, 2); // p1 an unrelated line (right of box (0,1))
    expect(s.turn).toBe(0);
    // p0 closes box (0,0) with the right side
    s = dotsEngine.applyAction(s, { type: 'line', kind: 'v', r: 0, c: 1 }, 0, makeRng(1));
    expect(s.boxes[0]).toBe(0);
    expect(s.scores[0]).toBe(1);
    expect(s.turn).toBe(0); // extra turn
    expect(s.lastEvent!.gained).toBe(1);
  });

  it('a line that completes two boxes scores both', () => {
    let s = dotsEngine.createInitialState(cfg(2), makeRng(1));
    const n = s.n;
    const h = Array(n * (n + 1)).fill(-1);
    const v = Array(n * (n + 1)).fill(-1);
    const boxes = Array(n * n).fill(-1);
    // fully fence box (0,0) and (0,1) except the shared vertical edge
    h[edgeIndex('h', 0, 0, n)!] = 0;
    h[edgeIndex('h', 0, 1, n)!] = 0;
    h[edgeIndex('h', 1, 0, n)!] = 0;
    h[edgeIndex('h', 1, 1, n)!] = 0;
    v[edgeIndex('v', 0, 0, n)!] = 0;
    v[edgeIndex('v', 0, 2, n)!] = 0;
    v[edgeIndex('v', 0, 3, n)!] = 0;
    const crafted: DotsState = {
      ...s,
      h,
      v,
      boxes,
      scores: [0, 0],
      remaining: 40 - 7,
      turn: 0,
      lastEvent: null,
    };
    const after = dotsEngine.applyAction(crafted, { type: 'line', kind: 'v', r: 0, c: 1 }, 0, makeRng(1));
    expect(after.scores[0]).toBe(2);
    expect(after.boxes[0]).toBe(0);
    expect(after.boxes[1]).toBe(0);
    expect(after.lastEvent!.gained).toBe(2);
  });

  it('rejects already-drawn and out-of-range lines', () => {
    const s = dotsEngine.createInitialState(cfg(2), makeRng(1));
    const first = dotsEngine.applyAction(s, { type: 'line', kind: 'h', r: 0, c: 0 }, 0, makeRng(1));
    expect(dotsEngine.validate(first, { type: 'line', kind: 'h', r: 0, c: 0 }, 0)).toBe(false);
    expect(dotsEngine.validate(first, { type: 'line', kind: 'h', r: 0, c: 0 }, 1)).toBe(false); // p1's turn
    expect(dotsEngine.validate(first, { type: 'line', kind: 'h', r: 5, c: 0 }, 1)).toBe(false);
    expect(dotsEngine.validate(first, { type: 'line', kind: 'v', r: 0, c: 5 }, 1)).toBe(false);
  });

  it('finishes when all lines are drawn and reports the correct winner(s)', () => {
    let s = dotsEngine.createInitialState(cfg(2), makeRng(1));
    let player = 0;
    for (let i = 0; i < 50 && !dotsEngine.isGameOver(s); i++) {
      const move = dotsEngine.chooseBotMove(s, player, makeRng(i + 1), 'hard');
      expect(move).not.toBeNull();
      s = dotsEngine.applyAction(s, move!, player, makeRng(1));
      player = s.turn;
    }
    expect(dotsEngine.isGameOver(s)).toBe(true);
    expect(s.scores.reduce((a, b) => a + b, 0)).toBe(16); // 4×4 boxes
    const winners = dotsEngine.winners(s);
    expect(winners.length).toBeGreaterThanOrEqual(1);
    const top = Math.max(...s.scores);
    expect(s.scores[winners[0]!]).toBe(top);
  });

  it('bots never play illegal lines in 3-4 player games', () => {
    let s = dotsEngine.createInitialState(cfg(4), makeRng(3));
    let guard = 0;
    while (!dotsEngine.isGameOver(s) && guard++ < 100) {
      const move = dotsEngine.chooseBotMove(s, s.turn, makeRng(guard), 'medium');
      expect(move).not.toBeNull();
      s = dotsEngine.applyAction(s, move!, s.turn, makeRng(1));
    }
    expect(dotsEngine.isGameOver(s)).toBe(true);
  });
});
