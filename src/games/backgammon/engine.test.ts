import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { backgammonEngine, pipCount, type BackgammonState } from './engine';

const cfg: GameConfig = {
  seed: 1,
  slots: [
    { id: 0, kind: 'human', name: 'a' },
    { id: 1, kind: 'bot', name: 'b' },
  ],
};

function rollPair(a: number, b: number): number {
  for (let seed = 1; seed < 40000; seed++) {
    const r = makeRng(seed);
    if (r.int(6) + 1 === a && r.int(6) + 1 === b) return seed;
  }
  throw new Error('no seed');
}

function emptyState(): BackgammonState {
  const s = backgammonEngine.createInitialState(cfg, makeRng(1));
  return { ...s, points: Array(24).fill(0), bar: [0, 0], borneOff: [0, 0] };
}

function moved(state: BackgammonState, action: Parameters<typeof backgammonEngine.applyAction>[1], player: number): BackgammonState {
  return backgammonEngine.applyAction(state, action, player, makeRng(1));
}

describe('backgammon engine', () => {
  it('sets up the classic starting position (167 pips each)', () => {
    const s = backgammonEngine.createInitialState(cfg, makeRng(1));
    expect(pipCount(s, 0)).toBe(167);
    expect(pipCount(s, 1)).toBe(167);
    expect(s.points[23]).toBe(2);
    expect(s.points[5]).toBe(5);
    expect(s.points[0]).toBe(-2);
    expect(s.points[18]).toBe(-5);
  });

  it('moves a checker by the die value in the right direction', () => {
    let s = emptyState();
    s.points[23] = 2; // white on 24
    s = { ...s, phase: 'move', remaining: [3, 5], dice: [3, 5], turn: 0 };
    const after = moved(s, { type: 'move', from: 23, to: 20, die: 3 }, 0);
    expect(after.points[20]).toBe(1);
    expect(after.points[23]).toBe(1);
    expect(after.remaining).toEqual([5]);

    let b = emptyState();
    b.points[0] = -2; // black on 1
    b = { ...b, phase: 'move', remaining: [4, 6], dice: [4, 6], turn: 1 };
    const afterB = moved(b, { type: 'move', from: 0, to: 4, die: 4 }, 1);
    expect(afterB.points[4]).toBe(-1);
    expect(afterB.points[0]).toBe(-1);
  });

  it('blocks landing on two enemy checkers and hits single blots', () => {
    let s = emptyState();
    s.points[7] = 3; // white on 8
    s.points[4] = -2; // black pair on 5 → blocked for die 3
    s = { ...s, phase: 'move', remaining: [3, 6], dice: [3, 6], turn: 0 };
    expect(backgammonEngine.validate(s, { type: 'move', from: 7, to: 4, die: 3 }, 0)).toBe(false);

    let h = emptyState();
    h.points[7] = 3;
    h.points[4] = -1; // black blot on 5
    h = { ...h, phase: 'move', remaining: [3, 6], dice: [3, 6], turn: 0 };
    const after = moved(h, { type: 'move', from: 7, to: 4, die: 3 }, 0);
    expect(after.points[4]).toBe(1); // white owns it now
    expect(after.bar[1]).toBe(1); // black sent to the bar
    expect(after.lastEvent!.kind).toBe('hit');
  });

  it('must enter from the bar before anything else', () => {
    let s = emptyState();
    s.bar[0] = 2;
    s.points[5] = 3;
    s = { ...s, phase: 'move', remaining: [2, 4], dice: [2, 4], turn: 0 };
    const legal = backgammonEngine.legalActions(s, 0);
    expect(legal.length).toBeGreaterThan(0);
    for (const m of legal) {
      if (m.type === 'move') expect(m.from).toBe('bar');
    }
    // entering point for die 2 is 24-2 = 22
    const after = moved(s, { type: 'move', from: 'bar', to: 22, die: 2 }, 0);
    expect(after.points[22]).toBe(1);
    expect(after.bar[0]).toBe(1);
  });

  it('bears off with the exact die and from the farthest point with a bigger die', () => {
    let s = emptyState();
    s.points[2] = 1; // white on point 3
    s.points[0] = 2; // white on point 1
    s = { ...s, phase: 'move', remaining: [3, 6], dice: [3, 6], turn: 0 };
    const after = moved(s, { type: 'move', from: 2, to: 'off', die: 3 }, 0);
    expect(after.borneOff[0]).toBe(1);
    expect(after.points[2]).toBe(0);

    // bigger die from the farthest point only
    let t = emptyState();
    t.points[1] = 1; // point 2 — farthest
    t.points[0] = 1; // point 1
    t = { ...t, phase: 'move', remaining: [5, 6], dice: [5, 6], turn: 0 };
    // die 5 from point 1 (distance 1) is legal only if no farther checkers: point 2 has one → illegal
    expect(backgammonEngine.validate(t, { type: 'move', from: 0, to: 'off', die: 5 }, 0)).toBe(false);
    expect(backgammonEngine.validate(t, { type: 'move', from: 1, to: 'off', die: 5 }, 0)).toBe(true);
  });

  it('cannot bear off while checkers remain outside the home board', () => {
    let s = emptyState();
    s.points[2] = 1;
    s.points[10] = 1; // still outside
    s = { ...s, phase: 'move', remaining: [3, 3], dice: [3, 3], turn: 0 };
    expect(backgammonEngine.validate(s, { type: 'move', from: 2, to: 'off', die: 3 }, 0)).toBe(false);
  });

  it('doubles grant four moves', () => {
    let s = emptyState();
    s.points[23] = 4;
    s = { ...s, phase: 'move', remaining: [2, 2, 2, 2], dice: [2, 2], turn: 0 };
    for (let i = 0; i < 4; i++) {
      s = moved(s, { type: 'move', from: 23, to: 21, die: 2 }, 0);
    }
    expect(s.phase).toBe('roll');
    expect(s.turn).toBe(1);
    expect(s.points[21]).toBe(4); // four checkers landed on point 22
    expect(s.points[23]).toBe(0);
  });

  it('auto-passes when no move is possible after a roll', () => {
    let s = emptyState();
    s.points[23] = 2; // white on 24
    s.points[20] = -2; // black on 21 blocks die 3
    s.points[21] = -2; // black on 22 blocks die 2
    const rolled = backgammonEngine.applyAction(
      { ...s, phase: 'roll' },
      { type: 'roll' },
      0,
      makeRng(rollPair(3, 2)),
    );
    expect(rolled.lastEvent!.kind).toBe('skip');
    expect(rolled.turn).toBe(1);
    expect(rolled.phase).toBe('roll');
  });

  it('wins after bearing off all 15 checkers', () => {
    let s = emptyState();
    s.points[0] = 15;
    s.borneOff[0] = 14;
    s.points[0] = 1;
    s = { ...s, phase: 'move', remaining: [1], dice: [1, 1], turn: 0 };
    const after = moved(s, { type: 'move', from: 0, to: 'off', die: 1 }, 0);
    expect(after.borneOff[0]).toBe(15);
    expect(backgammonEngine.isGameOver(after)).toBe(true);
    expect(backgammonEngine.winners(after)).toEqual([0]);
  });

  it('two bots finish a full legal game', () => {
    let s = backgammonEngine.createInitialState(cfg, makeRng(17));
    for (let i = 0; i < 2000 && !backgammonEngine.isGameOver(s); i++) {
      const move = backgammonEngine.chooseBotMove(s, s.turn, makeRng(i * 7 + 1), 'hard');
      expect(move).not.toBeNull();
      const after = backgammonEngine.applyAction(s, move!, s.turn, makeRng(i * 13 + 3));
      expect(after).not.toBe(s);
      s = after;
    }
    expect(backgammonEngine.isGameOver(s)).toBe(true);
    expect(s.borneOff[s.winner!]).toBe(15);
  });
});
