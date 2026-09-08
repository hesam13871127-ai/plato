import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { skeeEngine, SKEE_HOLES, SK_BALLS } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 141,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

const straightUp = Math.PI / 2;

describe('skeeball engine', () => {
  it('a full-power straight roll drops into the 100 hole', () => {
    let s = skeeEngine.createInitialState(cfg(2), makeRng(1));
    s = skeeEngine.applyAction(s, { type: 'roll', angle: straightUp, power: 1 }, 0, makeRng(1));
    expect(s.lastShot?.hole).toBe(0); // the 100-point hole
    expect(s.lastShot?.points).toBe(100);
    expect(s.scores[0]).toBe(100);
  });

  it('a weak ball rolls back down the ramp for 0', () => {
    let s = skeeEngine.createInitialState(cfg(2), makeRng(1));
    s = skeeEngine.applyAction(s, { type: 'roll', angle: straightUp, power: 0.2 }, 0, makeRng(1));
    expect(s.lastShot?.points).toBe(0);
    expect(s.lastShot?.hole).toBeNull();
  });

  it('identical rolls are perfectly deterministic', () => {
    const s = skeeEngine.createInitialState(cfg(2), makeRng(1));
    const a = skeeEngine.applyAction(s, { type: 'roll', angle: straightUp - 0.12, power: 0.8 }, 0, makeRng(1));
    const b = skeeEngine.applyAction(s, { type: 'roll', angle: straightUp - 0.12, power: 0.8 }, 0, makeRng(1));
    expect(a.lastShot?.path).toEqual(b.lastShot?.path);
    expect(a.lastShot?.points).toBe(b.lastShot?.points);
  });

  it('every hole is reachable with a well-aimed roll', () => {
    let s = skeeEngine.createInitialState(cfg(2), makeRng(1));
    // power that reaches the top: try a sweep of angles at each hole
    for (let h = 0; h < SKEE_HOLES.length; h++) {
      const target = SKEE_HOLES[h]!;
      const angle = Math.atan2(target.y - 1.5, target.x - 3);
      let scored = false;
      for (const power of [1, 0.97, 0.94, 0.91, 0.88, 0.85, 0.82, 0.79, 0.76, 0.73, 0.7, 0.67, 0.64, 0.6, 0.55]) {
        const t = skeeEngine.applyAction(s, { type: 'roll', angle, power }, 0, makeRng(1));
        if (t.lastShot?.hole === h) {
          scored = true;
          break;
        }
      }
      expect(scored).toBe(true);
    }
  });

  it('alternates turns, plays 9 balls each and elects the top scorer', () => {
    let s = skeeEngine.createInitialState(cfg(2), makeRng(1));
    const rng = makeRng(9);
    let guard = 0;
    const turnLog: number[] = [];
    while (!skeeEngine.isGameOver(s) && guard++ < 40) {
      turnLog.push(s.turn);
      const move = skeeEngine.chooseBotMove(s, s.turn, rng, 'medium')!;
      expect(skeeEngine.validate(s, move, s.turn)).toBe(true);
      s = skeeEngine.applyAction(s, move, s.turn, rng);
    }
    expect(skeeEngine.isGameOver(s)).toBe(true);
    expect(s.rolled).toEqual([SK_BALLS, SK_BALLS]);
    expect(turnLog.slice(0, 4)).toEqual([0, 1, 0, 1]);
    const best = Math.max(...s.scores);
    expect(skeeEngine.winners(s).length).toBeGreaterThanOrEqual(1);
    expect(s.scores[skeeEngine.winners(s)[0]!]).toBe(best);
  });

  it('rejects sideways rolls, bad power and out-of-turn rolls', () => {
    const s = skeeEngine.createInitialState(cfg(2), makeRng(1));
    expect(skeeEngine.validate(s, { type: 'roll', angle: 0, power: 0.8 }, 0)).toBe(false); // sideways
    expect(skeeEngine.validate(s, { type: 'roll', angle: straightUp, power: 0 }, 0)).toBe(false);
    expect(skeeEngine.validate(s, { type: 'roll', angle: straightUp, power: 1.2 }, 0)).toBe(false);
    expect(skeeEngine.validate(s, { type: 'roll', angle: straightUp, power: 0.8 }, 1)).toBe(false);
    expect(skeeEngine.validate(s, { type: 'roll', angle: straightUp, power: 0.8 }, 0)).toBe(true);
  });

  it('hard bots outscore easy bots over a full game (same seed)', () => {
    const run = (diff: 'easy' | 'hard', seed: number) => {
      let s = skeeEngine.createInitialState(cfg(1), makeRng(1));
      const rng = makeRng(seed);
      while (!skeeEngine.isGameOver(s)) {
        s = skeeEngine.applyAction(s, skeeEngine.chooseBotMove(s, 0, rng, diff)!, 0, rng);
      }
      return s.scores[0]!;
    };
    const hard = run('hard', 77);
    const easy = run('easy', 77);
    expect(hard).toBeGreaterThan(easy);
  });
});
