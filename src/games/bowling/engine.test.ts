import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { bowlingEngine, scoreGame } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 1,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

describe('bowling engine', () => {
  it('scores a perfect game as 300', () => {
    const frames = Array.from({ length: 10 }, (_, i) => (i === 9 ? [10, 10, 10] : [10]));
    expect(scoreGame(frames)).toBe(300);
  });

  it('scores spares and open frames correctly', () => {
    // all spares of 5/5 with a 5 next → each frame 15
    const frames = [
      [5, 5], [5, 5], [5, 5], [5, 5], [5, 5], [5, 5], [5, 5], [5, 5], [5, 5], [5, 5, 5],
    ];
    expect(scoreGame(frames)).toBe(150);
    // open frames
    expect(scoreGame([[3, 4], [2, 6], [0, 0]])).toBe(15);
    // strike then open
    expect(scoreGame([[10], [3, 4]])).toBe(24);
    // strike, strike, open
    expect(scoreGame([[10], [10], [3, 4]])).toBe(47); // 23 + 17 + 7
  });

  it('a straight hard throw knocks down a good number of pins', () => {
    const s = bowlingEngine.createInitialState(cfg(1), makeRng(1));
    const after = bowlingEngine.applyAction(s, { type: 'throw', angle: 0.004, power: 1 }, 0, makeRng(1));
    expect(after.lastEvent!.knocked).toBeGreaterThanOrEqual(5);
    // a strike reracks the pins immediately
    expect(after.standing.length).toBe(after.lastEvent!.knocked === 10 ? 10 : 10 - after.lastEvent!.knocked);
  });

  it('a gutter-ish throw (bumper graze) knocks down few or none', () => {
    const s = bowlingEngine.createInitialState(cfg(1), makeRng(1));
    const after = bowlingEngine.applyAction(s, { type: 'throw', angle: 0.42, power: 0.9 }, 0, makeRng(1));
    expect(after.lastEvent!.knocked).toBeLessThanOrEqual(4);
  });

  it('second roll plays the remaining standing pins', () => {
    let s = bowlingEngine.createInitialState(cfg(1), makeRng(1));
    s = bowlingEngine.applyAction(s, { type: 'throw', angle: 0.2, power: 0.95 }, 0, makeRng(1));
    if (s.lastEvent!.knocked < 10 && s.frame === 0 && s.roll === 1) {
      const standingBefore = s.standing.length;
      s = bowlingEngine.applyAction(s, { type: 'throw', angle: 0.05, power: 1 }, 0, makeRng(1));
      expect(s.lastEvent!.knocked).toBeLessThanOrEqual(standingBefore);
      expect(s.turn).toBe(0);
      expect(s.frame).toBe(1); // frame advanced after the second roll
    }
  });

  it('runs a complete game for two bots and reports winners', () => {
    let s = bowlingEngine.createInitialState(cfg(2), makeRng(5));
    let guard = 0;
    while (!bowlingEngine.isGameOver(s) && guard++ < 300) {
      const move = bowlingEngine.chooseBotMove(s, s.turn, makeRng(guard), 'medium');
      expect(move).not.toBeNull();
      s = bowlingEngine.applyAction(s, move!, s.turn, makeRng(1));
    }
    expect(bowlingEngine.isGameOver(s)).toBe(true);
    // both players have 10 frames recorded
    expect(s.frames[0]!.length).toBe(10);
    expect(s.frames[1]!.length).toBe(10);
    const winners = bowlingEngine.winners(s);
    expect(winners.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects throws out of turn or with bad power', () => {
    const s = bowlingEngine.createInitialState(cfg(2), makeRng(1));
    expect(bowlingEngine.validate(s, { type: 'throw', angle: 0, power: 0.5 }, 1)).toBe(false);
    expect(bowlingEngine.validate(s, { type: 'throw', angle: 0, power: 1.5 }, 0)).toBe(false);
    expect(bowlingEngine.validate(s, { type: 'throw', angle: 2, power: 0.5 }, 0)).toBe(false);
  });
});
