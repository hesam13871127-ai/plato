import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { seaEngine, randomFleet, validateFleet, GRID, type SeaState } from './engine';

function cfg(): GameConfig {
  return {
    seed: 101,
    slots: [
      { id: 0, kind: 'bot', name: 'a' },
      { id: 1, kind: 'bot', name: 'b' },
    ],
  };
}

function fleetA(): { size: number; x: number; y: number; horizontal: boolean }[] {
  return [
    { size: 5, x: 0, y: 0, horizontal: true },
    { size: 4, x: 0, y: 1, horizontal: true },
    { size: 3, x: 0, y: 2, horizontal: true },
    { size: 3, x: 0, y: 3, horizontal: true },
    { size: 2, x: 0, y: 4, horizontal: true },
  ];
}

describe('sea battle fleet validation', () => {
  it('accepts a legal fleet and random fleets over many seeds', () => {
    expect(validateFleet(fleetA())).toBe(true);
    for (let seed = 1; seed <= 40; seed++) {
      expect(validateFleet(randomFleet(makeRng(seed)))).toBe(true);
    }
  });

  it('rejects overlap, out-of-bounds and wrong ship counts', () => {
    const base = fleetA();
    expect(validateFleet([...base.slice(0, 4), { ...base[4]!, x: 0, y: 0, horizontal: true }])).toBe(false); // overlap
    expect(
      validateFleet([...base.slice(0, 4), { size: 2, x: GRID - 1, y: 4, horizontal: true }]),
    ).toBe(false); // out of bounds
    expect(validateFleet(base.slice(0, 4))).toBe(false); // missing ship
    expect(
      validateFleet([...base.slice(0, 4), { size: 2, x: 0, y: 4, horizontal: false }]),
    ).toBe(true); // vertical is fine here
  });
});

describe('sea battle engine', () => {
  it('placement phase: both fleets must be placed before battle starts', () => {
    let s = seaEngine.createInitialState(cfg(), makeRng(1));
    expect(seaEngine.currentPlayers(s)).toEqual([0, 1]);
    s = seaEngine.applyAction(s, { type: 'fleet', ships: fleetA() }, 0, makeRng(1));
    expect(s.placed[0]).toBe(true);
    expect(s.phase).toBe('place');
    expect(seaEngine.currentPlayers(s)).toEqual([1]);
    s = seaEngine.applyAction(s, { type: 'fleet', ships: fleetA() }, 1, makeRng(1));
    expect(s.phase).toBe('battle');
    expect(s.turn).toBe(0);
  });

  it('a hit keeps the turn, a miss passes it, sunk ships are announced', () => {
    let s: SeaState = seaEngine.createInitialState(cfg(), makeRng(1));
    s = seaEngine.applyAction(s, { type: 'fleet', ships: fleetA() }, 0, makeRng(1));
    s = seaEngine.applyAction(s, { type: 'fleet', ships: fleetA() }, 1, makeRng(1));
    // fleet A row 0 has the carrier at (0..4, 0)
    s = seaEngine.applyAction(s, { type: 'fire', x: 2, y: 0 }, 0, makeRng(1));
    expect(s.lastEvent?.hit).toBe(true);
    expect(s.turn).toBe(0); // hit → shoot again
    s = seaEngine.applyAction(s, { type: 'fire', x: 9, y: 9 }, 0, makeRng(1));
    expect(s.lastEvent?.hit).toBe(false);
    expect(s.turn).toBe(1); // miss → pass
    // player 1 sinks player 0's carrier (5 cells)
    s = seaEngine.applyAction(s, { type: 'fire', x: 0, y: 0 }, 1, makeRng(1));
    s = seaEngine.applyAction(s, { type: 'fire', x: 1, y: 0 }, 1, makeRng(1));
    s = seaEngine.applyAction(s, { type: 'fire', x: 3, y: 0 }, 1, makeRng(1));
    s = seaEngine.applyAction(s, { type: 'fire', x: 4, y: 0 }, 1, makeRng(1));
    expect(s.sunkCells[0]).toHaveLength(0);
    s = seaEngine.applyAction(s, { type: 'fire', x: 2, y: 0 }, 1, makeRng(1));
    expect(s.lastEvent?.sunkSize).toBe(5);
    expect(s.sunkCells[0]).toHaveLength(5);
  });

  it('sinking the whole fleet wins the game', () => {
    let s: SeaState = seaEngine.createInitialState(cfg(), makeRng(1));
    s = seaEngine.applyAction(s, { type: 'fleet', ships: fleetA() }, 0, makeRng(1));
    s = seaEngine.applyAction(s, { type: 'fleet', ships: fleetA() }, 1, makeRng(1));
    // player 0 sweeps every ship cell of player 1 (rows 0..4, x 0..4 minus extras)
    const cells = [
      [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
      [0, 1], [1, 1], [2, 1], [3, 1],
      [0, 2], [1, 2], [2, 2],
      [0, 3], [1, 3], [2, 3],
      [0, 4], [1, 4],
    ];
    for (const [x, y] of cells) {
      s = seaEngine.applyAction(s, { type: 'fire', x, y }, 0, makeRng(1));
    }
    expect(seaEngine.isGameOver(s)).toBe(true);
    expect(seaEngine.winners(s)).toEqual([0]);
  });

  it('rejects firing twice at the same cell, out of turn, or before placement', () => {
    let s: SeaState = seaEngine.createInitialState(cfg(), makeRng(1));
    expect(seaEngine.validate(s, { type: 'fire', x: 0, y: 0 }, 0)).toBe(false); // still placing
    s = seaEngine.applyAction(s, { type: 'fleet', ships: fleetA() }, 0, makeRng(1));
    s = seaEngine.applyAction(s, { type: 'fleet', ships: fleetA() }, 1, makeRng(1));
    s = seaEngine.applyAction(s, { type: 'fire', x: 0, y: 0 }, 0, makeRng(1)); // hit → still player 0
    expect(seaEngine.validate(s, { type: 'fire', x: 0, y: 0 }, 0)).toBe(false); // same cell twice
    expect(seaEngine.validate(s, { type: 'fire', x: 2, y: 5 }, 1)).toBe(false); // not player 1's turn
    expect(seaEngine.validate(s, { type: 'fire', x: 2, y: 5 }, 0)).toBe(true);
  });

  it('bot hunt mode uses parity; after a hit it targets neighbours', () => {
    let s: SeaState = seaEngine.createInitialState(cfg(), makeRng(1));
    s = seaEngine.applyAction(s, { type: 'fleet', ships: randomFleet(makeRng(3)) }, 0, makeRng(3));
    s = seaEngine.applyAction(s, { type: 'fleet', ships: randomFleet(makeRng(4)) }, 1, makeRng(4));
    // hunt shots stay on the even parity checkerboard until the first hit lands
    const rng = makeRng(11);
    let hitEvent: { x: number; y: number } | null = null;
    let guard = 0;
    while (!hitEvent && guard++ < 200) {
      const actor = seaEngine.currentPlayers(s)[0]!;
      const move = seaEngine.chooseBotMove(s, actor, rng, 'medium')!;
      if (actor === 0 && move.type === 'fire') {
        expect(seaEngine.validate(s, move, 0)).toBe(true);
        expect((move.x + move.y) % 2).toBe(0);
      }
      s = seaEngine.applyAction(s, move, actor, rng);
      if (actor === 0 && s.lastEvent?.hit) hitEvent = { x: s.lastEvent.x, y: s.lastEvent.y };
    }
    expect(hitEvent).not.toBeNull();
    // after a hit it is player 0's turn again and the bot must shoot adjacent
    expect(s.turn).toBe(0);
    const next = seaEngine.chooseBotMove(s, 0, rng, 'medium')!;
    if (next.type === 'fire') {
      expect(Math.abs(next.x - hitEvent!.x) + Math.abs(next.y - hitEvent!.y)).toBe(1);
    }
  });

  it('full bot games terminate with a winner within 100 shots each', () => {
    for (let seed = 1; seed <= 4; seed++) {
      let s = seaEngine.createInitialState(cfg(), makeRng(1));
      const rng = makeRng(seed * 37);
      let guard = 0;
      while (!seaEngine.isGameOver(s) && guard++ < 400) {
        const actor = seaEngine.currentPlayers(s)[0]!;
        const move = seaEngine.chooseBotMove(s, actor, rng, 'medium');
        if (!move) break;
        expect(seaEngine.validate(s, move, actor)).toBe(true);
        s = seaEngine.applyAction(s, move, actor, rng);
      }
      expect(seaEngine.isGameOver(s)).toBe(true);
      expect(seaEngine.winners(s)).toHaveLength(1);
      expect(s.shots[0]!.length).toBeLessThanOrEqual(100);
      expect(s.shots[1]!.length).toBeLessThanOrEqual(100);
      // no duplicate shots
      for (const list of s.shots) {
        expect(new Set(list.map((sh) => `${sh.x},${sh.y}`)).size).toBe(list.length);
      }
    }
  });
});
