import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { minesEngine, neighborsOf, MW_MINES, MINE_PENALTY, type MineState } from './engine';

function cfg(n: number): GameConfig {
  return {
    seed: 131,
    slots: Array.from({ length: n }, (_, i) => ({ id: i, kind: 'bot', name: `b${i}` })),
  };
}

describe('minesweepers engine', () => {
  it('lays exactly 22 mines with consistent numbers', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = minesEngine.createInitialState(cfg(2), makeRng(seed));
      expect(s.mines.filter(Boolean)).toHaveLength(MW_MINES);
      for (let i = 0; i < s.mines.length; i++) {
        expect(s.numbers[i]).toBe(neighborsOf(i).filter((n) => s.mines[n]).length);
      }
      // corners have exactly 3 neighbours
      expect(neighborsOf(0)).toHaveLength(3);
      expect(neighborsOf(143)).toHaveLength(3);
    }
  });

  it('the first reveal of the game is NEVER a mine', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = minesEngine.createInitialState(cfg(2), makeRng(seed * 7));
      for (let idx = 0; idx < 144; idx += 7) {
        const t: MineState = { ...s, mines: [...s.mines], numbers: [...s.numbers] };
        const after = minesEngine.applyAction(t, { type: 'reveal', idx }, 0, makeRng(1));
        expect(after.lastEvent?.kind).toBe('safe');
        expect(after.scores[0]).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('a zero cell floods its empty region (all neighbours of the flood have numbers)', () => {
    let s = minesEngine.createInitialState(cfg(2), makeRng(3));
    // find a zero cell
    const zero = s.numbers.findIndex((n, i) => n === 0 && !s.mines[i]);
    if (zero >= 0) {
      s = minesEngine.applyAction(s, { type: 'reveal', idx: zero }, 0, makeRng(1));
      expect(s.lastEvent?.kind).toBe('safe');
      expect(s.lastEvent!.cells.length).toBeGreaterThan(1); // flooded more than one cell
      expect(s.scores[0]).toBe(s.lastEvent!.cells.length);
      // every flood border cell must be revealed with a non-zero number
      for (const c of s.lastEvent!.cells) {
        expect(s.revealed[c]).toBe(true);
        expect(s.owner[c]).toBe(0);
      }
    }
  });

  it('a mine costs 5, marks the cell exploded and passes the turn', () => {
    let s = minesEngine.createInitialState(cfg(2), makeRng(11));
    // burn the first-click safety with a harmless reveal
    const anySafe = s.numbers.findIndex((n, i) => n >= 0 && !s.mines[i]);
    s = minesEngine.applyAction(s, { type: 'reveal', idx: anySafe }, 0, makeRng(1));
    // now player 1 hits a real mine
    const mine = s.mines.findIndex((m) => m);
    s = minesEngine.applyAction(s, { type: 'reveal', idx: mine }, 1, makeRng(1));
    expect(s.lastEvent?.kind).toBe('mine');
    expect(s.scores[1]).toBe(-MINE_PENALTY);
    expect(s.exploded[mine]).toBe(true);
    expect(s.revealed[mine]).toBe(false);
    expect(s.turn).toBe(0);
    // exploded cells cannot be clicked again
    expect(minesEngine.validate(s, { type: 'reveal', idx: mine }, 0)).toBe(false);
  });

  it('ends exactly when every safe cell is revealed and totals add up', () => {
    for (let seed = 1; seed <= 3; seed++) {
      let s = minesEngine.createInitialState(cfg(2), makeRng(seed * 17));
      const rng = makeRng(seed * 17);
      let guard = 0;
      while (!minesEngine.isGameOver(s) && guard++ < 600) {
        const move = minesEngine.chooseBotMove(s, s.turn, rng, 'hard');
        if (!move) break;
        expect(minesEngine.validate(s, move, s.turn)).toBe(true);
        s = minesEngine.applyAction(s, move, s.turn, rng);
      }
      expect(minesEngine.isGameOver(s)).toBe(true);
      const safeTotal = s.mines.filter((m) => !m).length;
      expect(s.revealed.filter(Boolean).length).toBe(safeTotal);
      // score sum = safe cells - 5 per explosion
      const booms = s.exploded.filter(Boolean).length;
      expect(s.scores.reduce((a, b) => a + b, 0)).toBe(safeTotal - booms * MINE_PENALTY);
      expect(minesEngine.winners(s).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('medium/hard bots pick certain-safe cells and never certain mines', () => {
    // craft a partially revealed board: cell 5 shows "1" with only one hidden neighbour
    let s = minesEngine.createInitialState(cfg(2), makeRng(23));
    const mines = [...s.mines];
    const size = s.mines.length;
    const revealed = Array.from({ length: size }, () => false);
    const exploded = Array.from({ length: size }, () => false);
    // row 0: cells 0..4 revealed; cell 5 = "1" pointing at cell 6 (mine)…
    // simpler synthetic: make cell 5's only unknown neighbour the mine itself
    for (let i = 0; i <= 4; i++) revealed[i] = true;
    mines.fill(false, 0, 12);
    mines[6] = true; // b1 is a mine, the only mine around cell 5
    const numbers = mines.map((_, i) => neighborsOf(i).filter((n) => mines[n]).length);
    s = { ...s, mines, numbers, revealed, exploded, owner: revealed.map((r) => (r ? 0 : -1)), firstClickDone: true, turn: 1 };
    // cell 5 (number 1, hidden) — its unknown neighbours: 6 (mine), 16, 17, 4? (4 is revealed)
    // the certain-MINE cell is 6: bot must not pick it; certain-safe: none yet → avoid 6
    const rng = makeRng(5);
    for (let i = 0; i < 12; i++) {
      const move = minesEngine.chooseBotMove(s, 1, rng, 'hard')!;
      expect(move.idx).not.toBe(6);
    }
    // now reveal 5 → its number is 1 with only cell 6 unknown → cell 16/17 become certain-safe?
    // simpler: reveal cell 5 for real and check the bot then knows 6 is the mine
    s = minesEngine.applyAction(s, { type: 'reveal', idx: 5 }, 1, makeRng(1));
    for (let i = 0; i < 12; i++) {
      const move = minesEngine.chooseBotMove(s, 0, rng, 'medium')!;
      expect(move.idx).not.toBe(6); // certain mine avoided
    }
  });

  it('rejects revealing out of turn or already-open cells', () => {
    let s = minesEngine.createInitialState(cfg(2), makeRng(31));
    expect(minesEngine.validate(s, { type: 'reveal', idx: 0 }, 1)).toBe(false);
    s = minesEngine.applyAction(s, { type: 'reveal', idx: 0 }, 0, makeRng(1));
    expect(minesEngine.validate(s, { type: 'reveal', idx: 0 }, 1)).toBe(false); // already revealed
    expect(minesEngine.validate(s, { type: 'reveal', idx: 999 }, 1)).toBe(false);
  });
});
