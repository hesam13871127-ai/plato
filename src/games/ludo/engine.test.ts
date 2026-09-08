import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { cellOf, ludoEngine, movableTokens, type LudoState } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 1,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

function base(overrides: Partial<LudoState> = {}): LudoState {
  const s = ludoEngine.createInitialState(cfg(2), makeRng(1));
  return { ...s, ...overrides };
}

/** find a seed whose first d6 roll is `target` (deterministic dice for tests) */
function seedThatRolls(target: number): number {
  for (let seed = 1; seed < 5000; seed++) {
    if (makeRng(seed).int(6) + 1 === target) return seed;
  }
  throw new Error('no seed found');
}

describe('ludo engine', () => {
  it('starts with all tokens in yards and a roll expected', () => {
    const s = ludoEngine.createInitialState(cfg(4), makeRng(1));
    expect(s.tokens.every((hand) => hand.every((t) => t.step === -1))).toBe(true);
    expect(s.phase).toBe('roll');
    expect(ludoEngine.legalActions(s, 0)).toEqual([{ type: 'roll' }]);
    expect(ludoEngine.legalActions(s, 1)).toEqual([]);
  });

  it('can only leave the yard on a six', () => {
    const s = base({ phase: 'move', dice: 3, turn: 0 });
    expect(movableTokens(s, 0, 3)).toEqual([]);
    const s6 = base({ phase: 'move', dice: 6, turn: 0 });
    expect(movableTokens(s6, 0, 6)).toEqual([0, 1, 2, 3]);
  });

  it('moving out of the yard lands on the start cell', () => {
    const s = base({ phase: 'move', dice: 6, turn: 0 });
    const after = ludoEngine.applyAction(s, { type: 'move', token: 0 }, 0, makeRng(3));
    expect(after.tokens[0]![0]).toMatchObject({ step: 0 });
    expect(after.phase).toBe('roll'); // six → extra roll
    expect(after.turn).toBe(0);
  });

  it('captures opponents on a plain cell and sends them home', () => {
    // p0 token at step 3 (cell 3); p1 token sits on cell 6
    const s = base({
      phase: 'move',
      dice: 3,
      turn: 0,
      tokens: [
        [{ step: 3 }, { step: -1 }, { step: -1 }, { step: -1 }],
        [{ step: 45 }, { step: -1 }, { step: -1 }, { step: -1 }],
      ],
    });
    expect(cellOf(1, 45)).toBe(6); // sanity: victim really is on cell 6
    const after = ludoEngine.applyAction(s, { type: 'move', token: 0 }, 0, makeRng(3));
    expect(after.tokens[0]![0]).toMatchObject({ step: 6 });
    expect(after.tokens[1]![0]).toMatchObject({ step: -1 }); // sent home
    expect(after.lastEvent?.kind).toBe('capture');
    expect(after.turn).toBe(1); // dice was 3 → next player
  });

  it('never captures on safe (star/start) cells', () => {
    // p0 lands on cell 8 (star, safe) where p1 already sits
    const s = base({
      phase: 'move',
      dice: 3,
      turn: 0,
      tokens: [
        [{ step: 5 }, { step: -1 }, { step: -1 }, { step: -1 }],
        [{ step: 47 }, { step: -1 }, { step: -1 }, { step: -1 }],
      ],
    });
    expect(cellOf(1, 47)).toBe(8);
    const after = ludoEngine.applyAction(s, { type: 'move', token: 0 }, 0, makeRng(3));
    expect(after.tokens[0]![0]).toMatchObject({ step: 8 });
    expect(after.tokens[1]![0]).toMatchObject({ step: 47 }); // untouched
  });

  it('requires an exact roll to finish', () => {
    const s = base({
      phase: 'move',
      dice: 4,
      turn: 0,
      tokens: [
        [{ step: 52 }, { step: -1 }, { step: -1 }, { step: -1 }],
        [{ step: -1 }, { step: -1 }, { step: -1 }, { step: -1 }],
      ],
    });
    expect(movableTokens(s, 0, 4)).toEqual([0]); // 52 + 4 = 56 exact
    const s2 = base({
      phase: 'move',
      dice: 5,
      turn: 0,
      tokens: [
        [{ step: 52 }, { step: -1 }, { step: -1 }, { step: -1 }],
        [{ step: -1 }, { step: -1 }, { step: -1 }, { step: -1 }],
      ],
    });
    expect(movableTokens(s2, 0, 5)).toEqual([]); // 57 would overshoot
  });

  it('wins when all four tokens reach home', () => {
    const s = base({
      phase: 'move',
      dice: 4,
      turn: 0,
      tokens: [
        [{ step: 56 }, { step: 56 }, { step: 56 }, { step: 52 }],
        [{ step: -1 }, { step: -1 }, { step: -1 }, { step: -1 }],
      ],
    });
    const after = ludoEngine.applyAction(s, { type: 'move', token: 3 }, 0, makeRng(3));
    expect(ludoEngine.isGameOver(after)).toBe(true);
    expect(ludoEngine.winners(after)).toEqual([0]);
  });

  it('forfeits the turn on a third consecutive six', () => {
    const s = base({ phase: 'roll', turn: 0, sixStreak: 2 });
    const after = ludoEngine.applyAction(s, { type: 'roll' }, 0, makeRng(seedThatRolls(6)));
    expect(after.lastEvent?.kind).toBe('forfeit');
    expect(after.turn).toBe(1);
    expect(after.phase).toBe('roll');
  });

  it('auto-skips the turn when no token can move', () => {
    const s = base({ phase: 'roll', turn: 0, sixStreak: 0 });
    const after = ludoEngine.applyAction(s, { type: 'roll' }, 0, makeRng(seedThatRolls(3)));
    expect(after.lastEvent?.kind).toBe('skip');
    expect(after.turn).toBe(1);
  });

  it('bots finish a full deterministic game without illegal moves', () => {
    let s = ludoEngine.createInitialState(cfg(2), makeRng(2024));
    for (let i = 0; i < 4000 && !ludoEngine.isGameOver(s); i++) {
      const turn = s.turn;
      const move = ludoEngine.chooseBotMove(s, turn, makeRng(i * 31 + 7), 'hard');
      expect(move).not.toBeNull();
      const after = ludoEngine.applyAction(s, move!, turn, makeRng(i * 17 + 3));
      expect(after).not.toBe(s);
      s = after;
    }
    expect(ludoEngine.isGameOver(s)).toBe(true);
    expect(ludoEngine.winners(s).length).toBe(1);
  });
});
