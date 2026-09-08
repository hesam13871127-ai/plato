import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { LADDERS, SNAKES, cellRC, snakesEngine, type SnakesState } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 1,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

function seedThatRolls(target: number): number {
  for (let seed = 1; seed < 20000; seed++) {
    if (makeRng(seed).int(6) + 1 === target) return seed;
  }
  throw new Error('no seed');
}

describe('snakes & ladders engine', () => {
  it('starts everyone off-board at 0', () => {
    const s = snakesEngine.createInitialState(cfg(4), makeRng(1));
    expect(s.pos).toEqual([0, 0, 0, 0]);
    expect(s.phase).toBe('roll');
    expect(snakesEngine.legalActions(s, 1)).toEqual([]);
  });

  it('enters the board with the first roll', () => {
    const s = snakesEngine.createInitialState(cfg(2), makeRng(1));
    const after = snakesEngine.applyAction(s, { type: 'roll' }, 0, makeRng(seedThatRolls(3)));
    expect(after.pos[0]).toBe(3);
    expect(after.lastEvent!.from).toBe(0);
  });

  it('slides down snakes and climbs ladders', () => {
    const base: SnakesState = {
      ...snakesEngine.createInitialState(cfg(2), makeRng(1)),
      pos: [15, 0], // one below the snake at 16
      turn: 0,
    };
    const bitten = snakesEngine.applyAction(base, { type: 'roll' }, 0, makeRng(seedThatRolls(1)));
    expect(bitten.pos[0]).toBe(SNAKES[16]);
    expect(bitten.lastEvent!.snake).toBe(true);

    const ladderBase: SnakesState = { ...base, pos: [20, 0] }; // one below ladder 21
    const climbed = snakesEngine.applyAction(ladderBase, { type: 'roll' }, 0, makeRng(seedThatRolls(1)));
    expect(climbed.pos[0]).toBe(LADDERS[21]);
    expect(climbed.lastEvent!.ladder).toBe(true);
  });

  it('rolling a 6 grants an extra roll', () => {
    const s: SnakesState = {
      ...snakesEngine.createInitialState(cfg(2), makeRng(1)),
      pos: [50, 10],
      turn: 0,
    };
    const after = snakesEngine.applyAction(s, { type: 'roll' }, 0, makeRng(seedThatRolls(6)));
    expect(after.turn).toBe(0);
    expect(after.lastEvent!.extra).toBe(true);
  });

  it('reaching 100 wins immediately', () => {
    const s: SnakesState = {
      ...snakesEngine.createInitialState(cfg(2), makeRng(1)),
      pos: [97, 30],
      turn: 0,
    };
    const after = snakesEngine.applyAction(s, { type: 'roll' }, 0, makeRng(seedThatRolls(5)));
    expect(after.pos[0]).toBe(100);
    expect(snakesEngine.isGameOver(after)).toBe(true);
    expect(snakesEngine.winners(after)).toEqual([0]);
  });

  it('boustrophedon mapping keeps rows consistent', () => {
    expect(cellRC(1)).toEqual([0, 0]);
    expect(cellRC(10)).toEqual([0, 9]);
    expect(cellRC(11)).toEqual([1, 9]);
    expect(cellRC(20)).toEqual([1, 0]);
    expect(cellRC(100)).toEqual([9, 0]);
  });

  it('bots play a full game to completion', () => {
    let s = snakesEngine.createInitialState(cfg(3), makeRng(9));
    for (let i = 0; i < 2000 && !snakesEngine.isGameOver(s); i++) {
      const move = snakesEngine.chooseBotMove(s, s.turn, makeRng(i + 1), 'medium');
      expect(move).not.toBeNull();
      s = snakesEngine.applyAction(s, move!, s.turn, makeRng(i * 13 + 7));
    }
    expect(snakesEngine.isGameOver(s)).toBe(true);
    expect(snakesEngine.winners(s).length).toBe(1);
  });
});
