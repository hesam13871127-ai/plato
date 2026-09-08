import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { reversiEngine, reversiLegalIdxs, flipsFor, discCounts, type ReversiState } from './engine';

function cfg(): GameConfig {
  return {
    seed: 111,
    slots: [
      { id: 0, kind: 'bot', name: 'a' },
      { id: 1, kind: 'bot', name: 'b' },
    ],
  };
}

describe('reversi engine', () => {
  it('starts with 4 discs in the middle and exactly 4 legal moves for dark', () => {
    const s = reversiEngine.createInitialState(cfg(), makeRng(1));
    expect(s.board.filter((c) => c !== 0)).toHaveLength(4);
    // classic Othello opening: d3, c4, f5, e6
    expect(reversiLegalIdxs(s.board, 0).sort((a, b) => a - b)).toEqual([19, 26, 37, 44]);
    // light (if it were her turn) has the mirrored four moves
    expect(reversiLegalIdxs(s.board, 1)).toHaveLength(4);
  });

  it('flips discs in every direction of a placed move', () => {
    const s = reversiEngine.createInitialState(cfg(), makeRng(1));
    // dark plays d3 (idx 19) → flips e4?? no: flips d4 (idx 27)
    const after = reversiEngine.applyAction(s, { type: 'move', idx: 19 }, 0, makeRng(1));
    expect(after.board[19]).toBe(1);
    expect(after.board[27]).toBe(1); // flipped to dark
    expect(after.board[35]).toBe(1);
    expect(after.board[28]).toBe(1); // untouched dark
    expect(after.board[36]).toBe(2); // untouched light
    expect(after.turn).toBe(1);
    // disc conservation: 4 → 5
    expect(after.board.filter((c) => c !== 0)).toHaveLength(5);
  });

  it('rejects moves that flip nothing or land on occupied cells', () => {
    const s = reversiEngine.createInitialState(cfg(), makeRng(1));
    expect(reversiEngine.validate(s, { type: 'move', idx: 0 }, 0)).toBe(false); // no flip
    expect(reversiEngine.validate(s, { type: 'move', idx: 27 }, 0)).toBe(false); // occupied
    expect(reversiEngine.validate(s, { type: 'move', idx: 19 }, 1)).toBe(false); // not light's turn
    expect(flipsFor(s.board, 0, 0)).toHaveLength(0);
  });

  it('auto-passes when the opponent has no legal move (turn stays)', () => {
    // near-full board: dark plays e1 (4) flipping d1/f1; light is left with
    // only e3 and cannot move anywhere, while dark can still play e2 → auto-pass
    const board = Array.from({ length: 64 }, () => 1); // all dark
    board[3] = 2; // d1 light
    board[5] = 2; // f1 light
    board[20] = 2; // e3 light
    board[4] = 0; // e1 empty
    board[12] = 0; // e2 empty
    const s: ReversiState = { board, turn: 0, phase: 'play', lastEvent: null };
    const after = reversiEngine.applyAction(s, { type: 'move', idx: 4 }, 0, makeRng(1));
    expect(after.board[3]).toBe(1); // d1 flipped
    expect(after.board[5]).toBe(1); // f1 flipped
    expect(after.turn).toBe(0); // light auto-passed — dark plays again
    expect(after.phase).toBe('play');
    expect(reversiEngine.validate(after, { type: 'move', idx: 12 }, 0)).toBe(true); // dark still has e2
  });

  it('ends the game when neither side can move and elects the majority', () => {
    // one empty cell left (h8) that nobody can legally fill: after dark's
    // final flip the game is over immediately
    const board = Array.from({ length: 64 }, () => 1); // all dark
    board[3] = 2; // d1 light
    board[5] = 2; // f1 light
    board[4] = 0; // e1 empty
    board[63] = 0; // h8 empty (unplayable for both)
    const s: ReversiState = { board, turn: 0, phase: 'play', lastEvent: null };
    const after = reversiEngine.applyAction(s, { type: 'move', idx: 4 }, 0, makeRng(1));
    expect(after.phase).toBe('over');
    const counts = discCounts(after);
    expect(counts.dark).toBe(63); // 60 dark + e1 + both flips, h8 stays empty
    expect(counts.light).toBe(0);
    expect(reversiEngine.winners(after)).toEqual([0]);
  });

  it('corners are prized: bot takes a corner when available', () => {
    // empty-ish board where a1 (idx 0) is legally playable by dark
    const board = Array.from({ length: 64 }, () => 0);
    board[1] = 2; // b1 light
    board[9] = 2; // b2 light
    board[2] = 1; // c1 dark anchors the flip line
    board[18] = 1; // c3 dark anchors the column flip
    const s: ReversiState = { board, turn: 0, phase: 'play', lastEvent: null };
    expect(flipsFor(board, 0, 0).length).toBeGreaterThan(0); // corner move is legal
    const move = reversiEngine.chooseBotMove(s, 0, makeRng(5), 'hard')!;
    expect(move.idx).toBe(0);
  });

  it('full bot games always finish with a legal, conserved board (fuzz)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      let s = reversiEngine.createInitialState(cfg(), makeRng(1));
      const rng = makeRng(seed * 41);
      let guard = 0;
      let moves = 0;
      while (!reversiEngine.isGameOver(s) && guard++ < 200) {
        const move = reversiEngine.chooseBotMove(s, s.turn, rng, 'medium');
        if (!move) break;
        expect(reversiEngine.validate(s, move, s.turn)).toBe(true);
        s = reversiEngine.applyAction(s, move, s.turn, rng);
        moves++;
      }
      expect(reversiEngine.isGameOver(s)).toBe(true);
      const counts = discCounts(s);
      expect(counts.dark + counts.light).toBe(4 + moves); // conservation
      expect(moves).toBeLessThanOrEqual(60);
      expect(reversiEngine.winners(s).length).toBeGreaterThanOrEqual(1);
    }
  });
});
