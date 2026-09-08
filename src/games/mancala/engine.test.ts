import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { STORE_P0, STORE_P1, mancalaEngine, oppositePit } from './engine';

const cfg: GameConfig = {
  seed: 1,
  slots: [
    { id: 0, kind: 'human', name: 'a' },
    { id: 1, kind: 'bot', name: 'b' },
  ],
};

function sow(s: ReturnType<typeof mancalaEngine.createInitialState>, pit: number, player: number) {
  return mancalaEngine.applyAction(s, { type: 'sow', pit }, player, makeRng(1));
}

describe('mancala engine', () => {
  it('starts with 4 seeds per pit and empty stores', () => {
    const s = mancalaEngine.createInitialState(cfg, makeRng(1));
    expect(s.pits).toEqual([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
    expect(s.turn).toBe(0);
  });

  it('sows counterclockwise skipping the opponent store', () => {
    // p0 plays pit 0 (4 seeds): pits 1-4 + store get one each
    let s = mancalaEngine.createInitialState(cfg, makeRng(1));
    s = sow(s, 0, 0);
    expect(s.pits).toEqual([0, 5, 5, 5, 5, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
    expect(s.turn).toBe(1); // last seed landed in pit 4, not the store
  });

  it('landing in the own store grants an extra turn', () => {
    let s = mancalaEngine.createInitialState(cfg, makeRng(1));
    // p0 plays pit 5: seeds go to store(6), 7, 8, 9 → last in 9 → no extra.
    s = sow(s, 5, 0);
    expect(s.pits[STORE_P0]).toBe(1);
    expect(s.turn).toBe(1);
    // craft a state where the last seed lands in the store: pit 0 has 1 seed? pit 5 with 1 seed → lands in store
    const crafted = { ...mancalaEngine.createInitialState(cfg, makeRng(1)), pits: [3, 2, 2, 2, 2, 1, 0, 3, 3, 3, 3, 3, 3, 0] };
    const after = sow(crafted, 5, 0);
    expect(after.pits[STORE_P0]).toBe(1);
    expect(after.lastEvent!.extraTurn).toBe(true);
    expect(after.turn).toBe(0);
  });

  it('captures when the last seed lands in an empty own pit', () => {
    // pit 3 has 1 seed → lands in pit 4 (empty own) → captures pit 4 (1) + opposite pit 8 (3)
    const crafted = {
      ...mancalaEngine.createInitialState(cfg, makeRng(1)),
      pits: [2, 0, 0, 1, 0, 0, 0, 3, 3, 3, 3, 3, 3, 0],
    };
    const after = sow(crafted, 3, 0);
    expect(after.pits[4]).toBe(0);
    expect(after.pits[8]).toBe(0);
    expect(after.pits[STORE_P0]).toBe(1 + 3); // seed itself + opposite 3
    expect(after.lastEvent!.captured).toBe(4);
    expect(after.turn).toBe(1);
  });

  it('never allows sowing from the opponent side or an empty pit', () => {
    const s = mancalaEngine.createInitialState(cfg, makeRng(1));
    expect(mancalaEngine.validate(s, { type: 'sow', pit: 8 }, 0)).toBe(false);
    expect(mancalaEngine.validate(s, { type: 'sow', pit: 6 }, 0)).toBe(false);
    expect(mancalaEngine.validate(s, { type: 'sow', pit: 0 }, 1)).toBe(false);
    const empty = { ...s, pits: [0, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0] };
    expect(mancalaEngine.validate(empty, { type: 'sow', pit: 0 }, 0)).toBe(false);
  });

  it('sweeps the board when one side empties and declares the winner', () => {
    // p0 side empty except pit 0 with 1 seed; playing it sweeps p1's remaining
    const crafted = {
      ...mancalaEngine.createInitialState(cfg, makeRng(1)),
      pits: [1, 0, 0, 0, 0, 0, 10, 2, 3, 0, 0, 0, 0, 5],
    };
    const after = sow(crafted, 0, 0);
    // seed lands in store; p1 side (2+3) swept to p1 store
    expect(after.pits[STORE_P0]).toBe(11);
    expect(after.pits[STORE_P1]).toBe(10);
    expect(after.phase).toBe('over');
    expect(mancalaEngine.winners(after)).toEqual([0]);
  });

  it('oppositePit mapping is symmetric', () => {
    for (let i = 0; i < 6; i++) {
      expect(oppositePit(oppositePit(i))).toBe(i);
      expect(oppositePit(i)).toBe(12 - i);
    }
  });

  it('bots play a full legal game', () => {
    let s = mancalaEngine.createInitialState(cfg, makeRng(3));
    for (let i = 0; i < 500 && !mancalaEngine.isGameOver(s); i++) {
      const move = mancalaEngine.chooseBotMove(s, s.turn, makeRng(i * 11 + 1), 'hard');
      expect(move).not.toBeNull();
      s = mancalaEngine.applyAction(s, move!, s.turn, makeRng(1));
    }
    expect(mancalaEngine.isGameOver(s)).toBe(true);
    const total = s.pits.reduce((a, b) => a + b, 0);
    expect(total).toBe(48);
  });
});
