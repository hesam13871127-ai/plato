import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { checkersEngine, type CheckersState } from './engine';

const cfg: GameConfig = {
  seed: 1,
  slots: [
    { id: 0, kind: 'human', name: 'a' },
    { id: 1, kind: 'bot', name: 'b' },
  ],
};

function emptyBoard(): CheckersState {
  const s = checkersEngine.createInitialState(cfg, makeRng(1));
  return { ...s, board: s.board.map((row) => row.map(() => null)) };
}

function place(s: CheckersState, r: number, c: number, player: 0 | 1, king = false) {
  s.board[r]![c] = { player, king };
}

describe('checkers engine', () => {
  it('sets up 12 men per side on dark squares', () => {
    const s = checkersEngine.createInitialState(cfg, makeRng(1));
    let p0 = 0;
    let p1 = 0;
    s.board.forEach((row, r) =>
      row.forEach((p, c) => {
        if (!p) return;
        expect((r + c) % 2).toBe(1);
        expect(p.king).toBe(false);
        if (p.player === 0) p0++;
        else p1++;
      }),
    );
    expect(p0).toBe(12);
    expect(p1).toBe(12);
  });

  it('men only move forward diagonally', () => {
    const s = emptyBoard();
    place(s, 5, 2, 0);
    const legal = checkersEngine.legalActions(s, 0);
    expect(legal).toEqual([
      { type: 'move', from: [5, 2], to: [4, 3] },
      { type: 'move', from: [5, 2], to: [4, 1] },
    ]);
  });

  it('captures are mandatory — simple moves disappear', () => {
    let s = emptyBoard();
    place(s, 5, 2, 0);
    place(s, 4, 3, 1);
    const legal = checkersEngine.legalActions(s, 0);
    expect(legal).toEqual([{ type: 'move', from: [5, 2], to: [3, 4] }]);
  });

  it('multi-jumps chain with the same piece and are mandatory to continue', () => {
    let s = emptyBoard();
    place(s, 5, 2, 0);
    place(s, 4, 3, 1);
    place(s, 2, 5, 1); // second victim after landing on (3,4)
    const first = checkersEngine.applyAction(s, { type: 'move', from: [5, 2], to: [3, 4] }, 0, makeRng(1));
    expect(first.chainFrom).toEqual([3, 4]);
    expect(first.turn).toBe(0);
    expect(checkersEngine.legalActions(first, 0)).toEqual([{ type: 'move', from: [3, 4], to: [1, 6] }]);
    const second = checkersEngine.applyAction(first, { type: 'move', from: [3, 4], to: [1, 6] }, 0, makeRng(1));
    expect(second.chainFrom).toBeNull();
    expect(second.turn).toBe(1);
    expect(second.captured).toEqual([2, 0]);
    expect(second.board[4]![3]).toBeNull();
    expect(second.board[2]![5]).toBeNull();
  });

  it('crowning at the last row ends the turn even mid-chain', () => {
    let s = emptyBoard();
    place(s, 2, 1, 0);
    place(s, 1, 2, 1); // first victim
    place(s, 1, 4, 1); // would be a second victim if the chain continued
    const after = checkersEngine.applyAction(s, { type: 'move', from: [2, 1], to: [0, 3] }, 0, makeRng(1));
    expect(after.board[0]![3]).toMatchObject({ player: 0, king: true });
    expect(after.lastEvent?.crowned).toBe(true);
    expect(after.chainFrom).toBeNull();
    expect(after.turn).toBe(1); // crowning ends the turn
  });

  it('kings move in all four diagonal directions', () => {
    let s = emptyBoard();
    place(s, 3, 4, 0, true);
    const tos = checkersEngine.legalActions(s, 0).map((a) => `${a.to[0]},${a.to[1]}`).sort();
    expect(tos).toEqual(['2,3', '2,5', '4,3', '4,5']);
  });

  it('kings capture in both directions and captures stay mandatory', () => {
    let s = emptyBoard();
    place(s, 3, 4, 0, true);
    place(s, 2, 3, 1);
    place(s, 4, 5, 1);
    const tos = checkersEngine.legalActions(s, 0).map((a) => `${a.to[0]},${a.to[1]}`).sort();
    expect(tos).toEqual(['1,2', '5,6']); // over (2,3) and over (4,5) — no simple moves offered
  });

  it('a player with no legal moves loses', () => {
    let s = emptyBoard();
    // p1's last man is boxed in
    place(s, 0, 1, 1);
    place(s, 1, 0, 0);
    place(s, 1, 2, 0);
    place(s, 2, 3, 0); // blocks the jump over (1,2)
    place(s, 5, 6, 0); // p0's mover
    const after = checkersEngine.applyAction(s, { type: 'move', from: [5, 6], to: [4, 5] }, 0, makeRng(1));
    expect(checkersEngine.isGameOver(after)).toBe(true);
    expect(checkersEngine.winners(after)).toEqual([0]);
  });

  it('two hard bots finish a legal game', () => {
    let s = checkersEngine.createInitialState(cfg, makeRng(1));
    let player: 0 | 1 = 0;
    for (let i = 0; i < 400 && !checkersEngine.isGameOver(s); i++) {
      const move = checkersEngine.chooseBotMove(s, player, makeRng(i * 7 + 1), 'hard');
      expect(move).not.toBeNull();
      const after = checkersEngine.applyAction(s, move!, player, makeRng(1));
      expect(after).not.toBe(s);
      s = after;
      player = (1 - player) as 0 | 1;
    }
    expect(checkersEngine.isGameOver(s)).toBe(true);
  });
});
