import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { golfEngine, HOLES, MAX_STROKES, totals, type GolfState } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 71,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

describe('mini golf engine', () => {
  it('course geometry is sane (tee/cup inside, bumpers clear of cup)', () => {
    for (const h of HOLES) {
      expect(h.tee[0]).toBeGreaterThan(1);
      expect(h.tee[0]).toBeLessThan(h.w - 1);
      expect(h.cup[0]).toBeGreaterThan(1);
      expect(h.cup[0]).toBeLessThan(h.w - 1);
      for (const b of h.bumpers) {
        expect(b.x - b.r).toBeGreaterThan(0.5);
        expect(b.x + b.r).toBeLessThan(h.w - 0.5);
        // bumpers must not smother the cup or tee
        expect(Math.hypot(b.x - h.cup[0], b.y - h.cup[1])).toBeGreaterThan(b.r + 0.9);
        expect(Math.hypot(b.x - h.tee[0], b.y - h.tee[1])).toBeGreaterThan(b.r + 0.9);
      }
    }
  });

  it('a stroke records a path; the same player keeps striking until holed', () => {
    let s = golfEngine.createInitialState(cfg(2), makeRng(1));
    s = golfEngine.applyAction(s, { type: 'stroke', angle: 0, power: 0.7 }, 0, makeRng(1));
    expect(s.lastShot).not.toBeNull();
    expect(s.lastShot!.path.length).toBeGreaterThanOrEqual(2);
    expect(s.strokes[0]![0]).toBe(1);
    if (!s.lastShot!.holed) {
      expect(s.turn).toBe(0); // still player 0 on the same hole
      const end = s.lastShot!.path[s.lastShot!.path.length - 1]!;
      expect(s.ball).toEqual(end); // ball rests where the shot ended
    }
  });

  it('identical inputs produce identical paths (deterministic replay)', () => {
    const s = golfEngine.createInitialState(cfg(2), makeRng(1));
    const a = golfEngine.applyAction(s, { type: 'stroke', angle: 0.4, power: 0.8 }, 0, makeRng(1));
    const b = golfEngine.applyAction(s, { type: 'stroke', angle: 0.4, power: 0.8 }, 0, makeRng(1));
    expect(a.lastShot!.path).toEqual(b.lastShot!.path);
  });

  it('holing out moves to the next hole; the course ends after hole 3', () => {
    let s: GolfState = golfEngine.createInitialState(cfg(2), makeRng(1));
    // force hole-outs: give strokes and use the cup directly via a tiny putt from the cup
    for (let hole = 0; hole < HOLES.length; hole++) {
      for (let p = 0; p < 2; p++) {
        // place the ball on the cup and tap it (guaranteed hole-out)
        s = { ...s, ball: [...HOLES[s.hole]!.cup] };
        const before = s.hole;
        s = golfEngine.applyAction(s, { type: 'stroke', angle: 0, power: 0.05 }, p, makeRng(2));
        expect(s.lastShot!.holed).toBe(true);
        if (hole < HOLES.length - 1 || p === 0) {
          expect(s.hole).toBe(p === 1 ? before + 1 : before);
        }
      }
    }
    expect(golfEngine.isGameOver(s)).toBe(true);
    expect(totals(s)).toEqual([3, 3]);
  });

  it('caps strokes per hole at MAX_STROKES (picked up and moved on)', () => {
    let s = golfEngine.createInitialState(cfg(1), makeRng(1));
    const rng = makeRng(5);
    for (let i = 0; i < MAX_STROKES; i++) {
      // aim away from the cup: straight up into the wall will never hole out on hole 0
      s = golfEngine.applyAction(s, { type: 'stroke', angle: Math.PI / 2, power: 0.2 }, 0, rng);
    }
    expect(s.strokes[0]![0]).toBe(MAX_STROKES);
    expect(s.lastShot!.pickedUp || s.lastShot!.holed).toBe(true);
    expect(s.hole).toBe(1); // picked up → the course moves on
    expect(golfEngine.isGameOver(s)).toBe(false);
  });

  it('validates power range and turn ownership', () => {
    const s = golfEngine.createInitialState(cfg(2), makeRng(1));
    expect(golfEngine.validate(s, { type: 'stroke', angle: 0, power: 0 }, 0)).toBe(false);
    expect(golfEngine.validate(s, { type: 'stroke', angle: 0, power: 1.2 }, 0)).toBe(false);
    expect(golfEngine.validate(s, { type: 'stroke', angle: 0, power: 0.5 }, 1)).toBe(false);
    expect(golfEngine.validate(s, { type: 'stroke', angle: 2.2, power: 0.5 }, 0)).toBe(true);
  });

  it('full bot rounds always finish with plausible scores (fuzz)', () => {
    for (let seed = 1; seed <= 4; seed++) {
      let s = golfEngine.createInitialState(cfg(3), makeRng(1));
      const rng = makeRng(seed * 23);
      let guard = 0;
      while (!golfEngine.isGameOver(s) && guard++ < 500) {
        const move = golfEngine.chooseBotMove(s, s.turn, rng, 'medium')!;
        expect(golfEngine.validate(s, move, s.turn)).toBe(true);
        s = golfEngine.applyAction(s, move, s.turn, rng);
      }
      expect(golfEngine.isGameOver(s)).toBe(true);
      for (const t of totals(s)) {
        expect(t).toBeGreaterThanOrEqual(3);
        expect(t).toBeLessThanOrEqual(3 * MAX_STROKES);
      }
      expect(golfEngine.winners(s).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('hard bots need fewer strokes than easy bots over a course', () => {
    const run = (diff: 'easy' | 'hard', seed: number) => {
      let s = golfEngine.createInitialState(cfg(1), makeRng(1));
      const rng = makeRng(seed);
      let guard = 0;
      while (!golfEngine.isGameOver(s) && guard++ < 300) {
        s = golfEngine.applyAction(s, golfEngine.chooseBotMove(s, 0, rng, diff)!, 0, rng);
      }
      return totals(s)[0]!;
    };
    const hard = run('hard', 7);
    const easy = run('easy', 7);
    expect(hard).toBeLessThanOrEqual(easy);
  });
});
