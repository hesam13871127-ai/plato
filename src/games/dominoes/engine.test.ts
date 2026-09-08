import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { dominoesEngine, type DominoState } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 42,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

function base(overrides: Partial<DominoState> = {}): DominoState {
  const state = dominoesEngine.createInitialState(cfg(2), makeRng(7));
  return { ...state, ...overrides };
}

describe('dominoes engine', () => {
  it('deals 28 tiles exactly: hands + boneyard', () => {
    for (const n of [2, 3, 4]) {
      const s = dominoesEngine.createInitialState(cfg(n), makeRng(11));
      const dealt = s.hands.reduce((acc, h) => acc + h.length, 0) + s.boneyard.length;
      expect(dealt).toBe(28);
      expect(s.hands.every((h) => h.length === (n === 4 ? 6 : 7))).toBe(true);
      expect(s.playerCount).toBe(n);
    }
  });

  it('opener holds the highest double and must open with it', () => {
    const s = dominoesEngine.createInitialState(cfg(2), makeRng(7));
    const openerTile = [...s.hands[s.turn]!].find((t) => t.id === s.openerTileId);
    expect(openerTile).toBeDefined();
    const allTiles = s.hands.flat();
    const bestDouble = allTiles.filter((t) => t.a === t.b).sort((x, y) => y.a - x.a)[0];
    if (bestDouble) {
      expect(openerTile!.a).toBe(bestDouble.a);
    }
    const legal = dominoesEngine.legalActions(s, s.turn);
    expect(legal).toEqual([{ type: 'place', tileId: s.openerTileId, end: 'right' }]);
  });

  it('places matching tiles and orients the chain correctly', () => {
    const s = base({
      hands: [
        [
          { id: 11, a: 5, b: 2 },
          { id: 12, a: 4, b: 3 },
        ],
        [{ id: 1, a: 0, b: 1 }],
      ],
      boneyard: [],
      chain: [{ tileId: 9, left: 3, right: 5, double: false }],
      turn: 0,
      firstMove: false,
      passes: 0,
    });
    // right: [5|2] must attach its 5 to the right end (5)
    let next = dominoesEngine.applyAction(s, { type: 'place', tileId: 11, end: 'right' }, 0, makeRng(1));
    expect(next.chain[next.chain.length - 1]).toMatchObject({ left: 5, right: 2 });
    expect(next.turn).toBe(1);
    // p1 cannot match ends (3 / 2) with empty boneyard → passes back to p0
    next = dominoesEngine.applyAction(next, { type: 'pass' }, 1, makeRng(1));
    expect(next.turn).toBe(0);
    // left: [4|3] must attach its 3 to the left end (3)
    next = dominoesEngine.applyAction(next, { type: 'place', tileId: 12, end: 'left' }, 0, makeRng(1));
    expect(next.chain[0]).toMatchObject({ left: 4, right: 3 });
    expect(next.hands[0]!.length).toBe(0);
    expect(dominoesEngine.isGameOver(next)).toBe(true);
  });

  it('rejects non-matching placements', () => {
    const s = base({
      hands: [[{ id: 20, a: 6, b: 6 }], []],
      boneyard: [{ id: 1, a: 0, b: 1 }],
      chain: [{ tileId: 9, left: 3, right: 5, double: false }],
      turn: 0,
      firstMove: false,
    });
    expect(dominoesEngine.validate(s, { type: 'place', tileId: 20, end: 'right' }, 0)).toBe(false);
    expect(dominoesEngine.legalActions(s, 0)).toEqual([{ type: 'draw' }]);
  });

  it('offers draw while boneyard has tiles, pass when empty', () => {
    const s = base({
      hands: [[{ id: 20, a: 6, b: 6 }], []],
      boneyard: [{ id: 1, a: 0, b: 1 }],
      chain: [{ tileId: 9, left: 3, right: 5, double: false }],
      turn: 0,
      firstMove: false,
    });
    const afterDraw = dominoesEngine.applyAction(s, { type: 'draw' }, 0, makeRng(1));
    expect(afterDraw.hands[0]!.length).toBe(2);
    expect(afterDraw.turn).toBe(0); // still your turn after drawing
    const empty = base({
      ...s,
      boneyard: [],
      passes: 0,
    });
    expect(dominoesEngine.legalActions(empty, 0)).toEqual([{ type: 'pass' }]);
  });

  it('ends the round when a hand is emptied and scores pips', () => {
    const s = base({
      hands: [[{ id: 10, a: 3, b: 5 }], [{ id: 1, a: 0, b: 1 }]],
      boneyard: [],
      chain: [{ tileId: 9, left: 3, right: 5, double: false }],
      turn: 0,
      firstMove: false,
    });
    const done = dominoesEngine.applyAction(s, { type: 'place', tileId: 10, end: 'right' }, 0, makeRng(1));
    expect(dominoesEngine.isGameOver(done)).toBe(true);
    expect(dominoesEngine.winners(done)).toEqual([0]);
    expect(done.result!.points).toBe(1); // opponent held [0|1]
  });

  it('declares a blocked game after everyone passes; lowest pips wins', () => {
    let s = base({
      hands: [
        [
          { id: 20, a: 6, b: 6 },
          { id: 21, a: 6, b: 4 },
        ],
        [{ id: 1, a: 0, b: 1 }],
      ],
      boneyard: [],
      chain: [{ tileId: 9, left: 3, right: 5, double: false }],
      turn: 0,
      firstMove: false,
      passes: 0,
    });
    s = dominoesEngine.applyAction(s, { type: 'pass' }, 0, makeRng(1));
    expect(s.turn).toBe(1);
    s = dominoesEngine.applyAction(s, { type: 'pass' }, 1, makeRng(1));
    expect(dominoesEngine.isGameOver(s)).toBe(true);
    expect(dominoesEngine.winners(s)).toEqual([1]); // 1 pip vs 22 pips
    expect(s.result!.points).toBe(22);
  });

  it('blocks acting out of turn', () => {
    const s = base({ turn: 1 });
    expect(dominoesEngine.legalActions(s, 0)).toEqual([]);
  });

  it('bots always return a legal action on their turn', () => {
    let s = dominoesEngine.createInitialState(cfg(4), makeRng(99));
    for (let i = 0; i < 200 && !dominoesEngine.isGameOver(s); i++) {
      const turn = s.turn;
      const move = dominoesEngine.chooseBotMove(s, turn, makeRng(i + 1), 'hard');
      expect(move).not.toBeNull();
      const after = dominoesEngine.applyAction(s, move!, turn, makeRng(i + 1));
      expect(after).not.toBe(s); // an illegal bot move must never happen
      s = after;
    }
  });
});
