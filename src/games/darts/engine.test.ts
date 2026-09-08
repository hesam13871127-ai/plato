import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import {
  dartsEngine,
  scoreAt,
  START_SCORE,
  DARTS_PER_TURN,
  R_BULL,
  R_BULL25,
  R_TRIPLE_IN,
  R_TRIPLE_OUT,
  R_DOUBLE_IN,
  R_DOUBLE_OUT,
  type DartsState,
} from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 61,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

describe('darts board math', () => {
  it('bull, 25-ring and miss zones', () => {
    expect(scoreAt(0, 0)).toEqual({ value: 50, label: 'Bull' });
    expect(scoreAt(R_BULL - 1, 0)).toEqual({ value: 50, label: 'Bull' });
    expect(scoreAt((R_BULL + R_BULL25) / 2, 0)).toEqual({ value: 25, label: '25' });
    expect(scoreAt(200, 0)).toEqual({ value: 0, label: 'Miss' });
    expect(scoreAt(0, 300)).toEqual({ value: 0, label: 'Miss' });
  });

  it('sector 20 at the top, neighbours 5 and 1 on the sides', () => {
    const midTripleY = (R_TRIPLE_IN + R_TRIPLE_OUT) / 2;
    expect(scoreAt(0, midTripleY)).toEqual({ value: 60, label: 'T20' });
    // slightly clockwise from top → sector 1
    const ang1 = (72 * Math.PI) / 180;
    expect(scoreAt(Math.cos(ang1) * midTripleY, Math.sin(ang1) * midTripleY).value).toBe(3); // T1
    // slightly counter-clockwise from top → sector 5
    const ang5 = (108 * Math.PI) / 180;
    expect(scoreAt(Math.cos(ang5) * midTripleY, Math.sin(ang5) * midTripleY).value).toBe(15); // T5
    // right horizontal → sector 6
    expect(scoreAt(midTripleY, 0)).toEqual({ value: 18, label: 'T6' });
    // left horizontal → sector 11
    expect(scoreAt(-midTripleY, 0)).toEqual({ value: 33, label: 'T11' });
  });

  it('double ring doubles, singles single, between rings is single', () => {
    const midDouble = (R_DOUBLE_IN + R_DOUBLE_OUT) / 2;
    expect(scoreAt(0, midDouble)).toEqual({ value: 40, label: 'D20' });
    const singleY = (R_BULL25 + R_TRIPLE_IN) / 2;
    expect(scoreAt(0, singleY)).toEqual({ value: 20, label: '20' });
    const outerSingleY = (R_TRIPLE_OUT + R_DOUBLE_IN) / 2;
    expect(scoreAt(0, outerSingleY).value).toBe(20);
  });
});

describe('darts engine', () => {
  it('subtracts hits and rotates after three darts', () => {
    let s = dartsEngine.createInitialState(cfg(2), makeRng(1));
    const midTripleY = (R_TRIPLE_IN + R_TRIPLE_OUT) / 2;
    s = dartsEngine.applyAction(s, { type: 'throw', x: 0, y: midTripleY }, 0, makeRng(1)); // 60
    s = dartsEngine.applyAction(s, { type: 'throw', x: 0, y: midTripleY }, 0, makeRng(1)); // 60
    expect(s.scores[0]).toBe(START_SCORE - 120);
    expect(s.turn).toBe(0);
    s = dartsEngine.applyAction(s, { type: 'throw', x: 0, y: midTripleY }, 0, makeRng(1)); // 60 → turn ends
    expect(s.dartsLeft).toBe(DARTS_PER_TURN);
    expect(s.turn).toBe(1);
    expect(s.turnStart).toBe(START_SCORE);
  });

  it('busting reverts the whole turn score and passes the turn', () => {
    let s = dartsEngine.createInitialState(cfg(2), makeRng(1));
    s = { ...s, scores: [30, START_SCORE], turnStart: 30 };
    const midDouble = (R_DOUBLE_IN + R_DOUBLE_OUT) / 2;
    s = dartsEngine.applyAction(s, { type: 'throw', x: 0, y: midDouble }, 0, makeRng(2)); // 40 → 30-40 <0 bust
    expect(s.lastEvent?.bust).toBe(true);
    expect(s.scores[0]).toBe(30); // reverted to the turn start
    expect(s.turn).toBe(1);
    expect(s.dartsLeft).toBe(DARTS_PER_TURN);
  });

  it('landing exactly on zero wins immediately', () => {
    let s = dartsEngine.createInitialState(cfg(2), makeRng(1));
    s = { ...s, scores: [40, START_SCORE], turnStart: 40 };
    const midDouble = (R_DOUBLE_IN + R_DOUBLE_OUT) / 2;
    s = dartsEngine.applyAction(s, { type: 'throw', x: 0, y: midDouble }, 0, makeRng(3)); // D20 = 40
    expect(s.phase).toBe('over');
    expect(dartsEngine.winners(s)).toEqual([0]);
  });

  it('rejects throws out of turn or off the wall', () => {
    const s = dartsEngine.createInitialState(cfg(2), makeRng(1));
    expect(dartsEngine.validate(s, { type: 'throw', x: 0, y: 0 }, 1)).toBe(false);
    expect(dartsEngine.validate(s, { type: 'throw', x: 400, y: 0 }, 0)).toBe(false);
    expect(dartsEngine.validate(s, { type: 'throw', x: 100, y: 100 }, 0)).toBe(true);
  });

  it('hard bots hit far more points than easy bots', () => {
    const s = dartsEngine.createInitialState(cfg(2), makeRng(1));
    const total = (diff: 'easy' | 'hard') => {
      const rng = makeRng(99);
      let sum = 0;
      for (let i = 0; i < 90; i++) {
        const move = dartsEngine.chooseBotMove(s, 0, rng, diff)!;
        sum += scoreAt(move.x, move.y).value;
      }
      return sum;
    };
    const hard = total('hard');
    const easy = total('easy');
    expect(hard).toBeGreaterThan(easy);
    expect(hard / 90).toBeGreaterThan(32); // hard averages 32+ per dart near T20
  });

  it('bots legally finish a full 501 game (fuzz, always terminates)', () => {
    for (let seed = 1; seed <= 4; seed++) {
      let s = dartsEngine.createInitialState(cfg(3), makeRng(1));
      const rng = makeRng(seed * 17);
      let guard = 0;
      while (!dartsEngine.isGameOver(s) && guard++ < 2000) {
        const move = dartsEngine.chooseBotMove(s, s.turn, rng, 'medium')!;
        expect(dartsEngine.validate(s, move, s.turn)).toBe(true);
        s = dartsEngine.applyAction(s, move, s.turn, rng);
      }
      expect(dartsEngine.isGameOver(s)).toBe(true);
      expect(s.scores[dartsEngine.winners(s)[0]!]).toBe(0);
    }
  });

  it('aiming logic: remaining 50 → bull, even ≤40 → the matching double', () => {
    const s: DartsState = { ...dartsEngine.createInitialState(cfg(2), makeRng(1)), scores: [50, 501] };
    const rng = makeRng(5);
    // for remaining 50, the hard bot should hit bull very often
    let bulls = 0;
    for (let i = 0; i < 40; i++) {
      const m = dartsEngine.chooseBotMove(s, 0, rng, 'hard')!;
      if (scoreAt(m.x, m.y).value === 50) bulls++;
    }
    expect(bulls).toBeGreaterThanOrEqual(25);
  });
});
