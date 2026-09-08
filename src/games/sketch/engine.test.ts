import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { ROUNDS, sketchEngine, sketchScore, type SketchState } from './engine';
import { TARGETS, type Pt } from './targets';

function cfg(n: number): GameConfig {
  return {
    seed: 41,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

describe('sketch engine', () => {
  it('a perfect copy scores 100', () => {
    for (const t of TARGETS) {
      expect(sketchScore(t.strokes, t.strokes)).toBe(100);
    }
  });

  it('empty or garbage strokes score 0', () => {
    expect(sketchScore(TARGETS[0]!.strokes, [])).toBe(0);
    expect(sketchScore(TARGETS[0]!.strokes, [[]])).toBe(0);
    expect(sketchScore(TARGETS[0]!.strokes, [[[0.05, 0.05]], [[0.95, 0.95]]])).toBe(0);
  });

  it('a close copy beats a distant scribble', () => {
    const target = TARGETS[0]!.strokes; // house occupies x 0.24-0.76, y 0.26-0.84
    const close: Pt[][] = target.map((st) => st.map(([x, y]) => [x + 0.012, y - 0.012] as Pt));
    const far: Pt[][] = [
      [[0.04, 0.04], [0.2, 0.1]],
      [[0.86, 0.06], [0.96, 0.16]],
    ];
    expect(sketchScore(target, close)).toBeGreaterThan(90);
    expect(sketchScore(target, far)).toBe(0);
  });

  it('hard bot draws better than easy bot (same seed)', () => {
    const rngHard = makeRng(77);
    const rngEasy = makeRng(77);
    const hardMove = sketchEngine.chooseBotMove(
      { ...baseState(), targets: [0, 1, 2] } as SketchState,
      0,
      rngHard,
      'hard',
    )!;
    const easyMove = sketchEngine.chooseBotMove(
      { ...baseState(), targets: [0, 1, 2] } as SketchState,
      0,
      rngEasy,
      'easy',
    )!;
    const hardScore = sketchScore(TARGETS[0]!.strokes, hardMove.strokes);
    const easyScore = sketchScore(TARGETS[0]!.strokes, easyMove.strokes);
    expect(hardScore).toBe(100);
    expect(easyScore).toBeLessThan(hardScore);
  });

  it('rotates players and rounds and finishes after ROUNDS×players attempts', () => {
    let s = sketchEngine.createInitialState(cfg(2), makeRng(5));
    const seenTurns: number[] = [];
    let guard = 0;
    while (!sketchEngine.isGameOver(s) && guard++ < 30) {
      if (s.phase === 'draw') {
        seenTurns.push(s.turn);
        const rng = makeRng(guard);
        const move = sketchEngine.chooseBotMove(s, s.turn, rng, 'medium')!;
        expect(sketchEngine.validate(s, move, s.turn)).toBe(true);
        s = sketchEngine.applyAction(s, move, s.turn, rng);
      }
    }
    expect(seenTurns).toEqual([0, 1, 0, 1, 0, 1]);
    expect(s.attempts).toHaveLength(ROUNDS * 2);
    expect(sketchEngine.winners(s).length).toBeGreaterThanOrEqual(1);
    // scores recorded for every attempt
    const total = s.scores.reduce((a, b) => a + b, 0);
    expect(total).toBe(s.attempts.reduce((a, at) => a + at.score, 0));
  });

  it('rejects submitting out of turn or with malformed strokes', () => {
    const s = sketchEngine.createInitialState(cfg(2), makeRng(5));
    expect(sketchEngine.validate(s, { type: 'submit', strokes: [] }, 1)).toBe(false);
    expect(sketchEngine.validate(s, { type: 'submit', strokes: [[[NaN, 0.5]]] }, 0)).toBe(false);
    expect(sketchEngine.validate(s, { type: 'submit', strokes: [[[0.5, 0.5]]] }, 0)).toBe(true);
  });

  it('picks 3 distinct targets from the gallery', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = sketchEngine.createInitialState(cfg(2), makeRng(seed));
      expect(s.targets).toHaveLength(3);
      expect(new Set(s.targets).size).toBe(3);
      for (const t of s.targets) expect(t).toBeGreaterThanOrEqual(0);
    }
  });
});

function baseState(): SketchState {
  return sketchEngine.createInitialState(cfg(2), makeRng(9));
}
