import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import type { GameConfig } from '../../core/types';
import { chessEngine, inCheckNow, sq, type ChessState } from './engine';

const cfg: GameConfig = {
  seed: 1,
  slots: [
    { id: 0, kind: 'human', name: 'w' },
    { id: 1, kind: 'bot', name: 'b' },
  ],
};

function play(s: ChessState, from: number, to: number, promo?: 'q' | 'r' | 'b' | 'n'): ChessState {
  return chessEngine.applyAction(s, { from, to, promo }, fromSqPlayer(s, from), makeRng(1));
}

function fromSqPlayer(s: ChessState, from: number): number {
  const p = s.board[from];
  return p && p.color === 'w' ? 0 : 1;
}

function emptyState(turn: 'w' | 'b' = 'w'): ChessState {
  const s = chessEngine.createInitialState(cfg, makeRng(1));
  return { ...s, board: Array(64).fill(null), turn, castling: 0, ep: null };
}

describe('chess engine', () => {
  it('has exactly 20 legal moves at the start', () => {
    const s = chessEngine.createInitialState(cfg, makeRng(1));
    expect(chessEngine.legalActions(s, 0).length).toBe(20);
    expect(chessEngine.legalActions(s, 1)).toEqual([]); // not black's turn
  });

  it('recognizes the fool’s mate', () => {
    let s = chessEngine.createInitialState(cfg, makeRng(1));
    s = play(s, sq(5, 1), sq(5, 2)); // f3
    s = play(s, sq(4, 6), sq(4, 4)); // e5
    s = play(s, sq(6, 1), sq(6, 3)); // g4
    s = play(s, sq(3, 7), sq(7, 3)); // Qh4#
    expect(s.status).toBe('checkmate');
    expect(chessEngine.winners(s)).toEqual([1]); // black mates
  });

  it('moves pieces and captures correctly', () => {
    let s = emptyState();
    s.board[sq(4, 0)] = { color: 'w', type: 'k' };
    s.board[sq(0, 3)] = { color: 'w', type: 'q' };
    s.board[sq(7, 7)] = { color: 'b', type: 'k' };
    s.board[sq(3, 3)] = { color: 'b', type: 'r' };
    const after = play(s, sq(0, 3), sq(3, 3)); // Qxd4?? rook
    expect(after.board[sq(3, 3)]).toEqual({ color: 'w', type: 'q' });
    expect(after.board[sq(0, 3)]).toBeNull();
    expect(after.turn).toBe('b');
  });

  it('detects check and forbids leaving the king in check', () => {
    let s = emptyState();
    s.board[sq(4, 0)] = { color: 'w', type: 'k' };
    s.board[sq(7, 7)] = { color: 'b', type: 'k' };
    s.board[sq(4, 7)] = { color: 'b', type: 'r' }; // rook on e-file → white in check
    s.board[sq(0, 1)] = { color: 'w', type: 'n' };
    expect(inCheckNow(s)).toBe(true);
    const legal = chessEngine.legalActions(s, 0);
    // only king moves out of check (knight can't block e-file in one move from a2)
    for (const m of legal) expect(m.from).toBe(sq(4, 0));
  });

  it('castles kingside, moving the rook too', () => {
    let s = emptyState();
    s.board[sq(4, 0)] = { color: 'w', type: 'k' };
    s.board[sq(7, 0)] = { color: 'w', type: 'r' };
    s.board[sq(7, 7)] = { color: 'b', type: 'k' };
    s.castling = 1;
    const after = play(s, sq(4, 0), sq(6, 0)); // O-O
    expect(after.board[sq(6, 0)]).toEqual({ color: 'w', type: 'k' });
    expect(after.board[sq(5, 0)]).toEqual({ color: 'w', type: 'r' });
    expect(after.board[sq(7, 0)]).toBeNull();
  });

  it('refuses castling through an attacked square', () => {
    let s = emptyState();
    s.board[sq(4, 0)] = { color: 'w', type: 'k' };
    s.board[sq(7, 0)] = { color: 'w', type: 'r' };
    s.board[sq(7, 7)] = { color: 'b', type: 'k' };
    s.board[sq(5, 4)] = { color: 'b', type: 'r' }; // attacks the f-file
    s.castling = 1;
    const legal = chessEngine.legalActions(s, 0);
    expect(legal.some((m) => m.from === sq(4, 0) && m.to === sq(6, 0))).toBe(false);
    // without the attacker, castling is allowed
    s.board[sq(5, 4)] = null;
    const legal2 = chessEngine.legalActions(s, 0);
    expect(legal2.some((m) => m.from === sq(4, 0) && m.to === sq(6, 0))).toBe(true);
  });

  it('captures en passant', () => {
    let s = emptyState();
    s.board[sq(4, 4)] = { color: 'w', type: 'p' }; // e5
    s.board[sq(4, 0)] = { color: 'w', type: 'k' };
    s.board[sq(4, 7)] = { color: 'b', type: 'k' };
    s.board[sq(3, 4)] = { color: 'b', type: 'p' }; // black pawn just double-pushed to d5
    s.ep = sq(3, 5); // d6
    s.turn = 'w';
    const after = play(s, sq(4, 4), sq(3, 5)); // exd6 e.p.
    expect(after.board[sq(3, 5)]).toEqual({ color: 'w', type: 'p' });
    expect(after.board[sq(3, 4)]).toBeNull(); // the d5 pawn is gone
  });

  it('promotes pawns (default queen, or chosen piece)', () => {
    let s = emptyState();
    s.board[sq(0, 6)] = { color: 'w', type: 'p' };
    s.board[sq(4, 0)] = { color: 'w', type: 'k' };
    s.board[sq(4, 7)] = { color: 'b', type: 'k' };
    const after = play(s, sq(0, 6), sq(0, 7), 'n');
    expect(after.board[sq(0, 7)]).toEqual({ color: 'w', type: 'n' });
  });

  it('declares stalemate', () => {
    let s = emptyState('w');
    s.board[sq(0, 7)] = { color: 'b', type: 'k' }; // a8
    s.board[sq(2, 6)] = { color: 'w', type: 'k' }; // c7
    s.board[sq(1, 5)] = { color: 'w', type: 'q' }; // b6
    // white just moved the queen to b6 — the position is stalemate for black
    const stateLike: ChessState = { ...s, status: 'playing' };
    const legal = chessEngine.legalActions(stateLike, 1);
    expect(legal.length).toBe(0);
    expect(inCheckNow({ ...stateLike, turn: 'b' })).toBe(false);
  });

  it('declares a draw on insufficient material', () => {
    let s = emptyState();
    s.board[sq(4, 0)] = { color: 'w', type: 'k' };
    s.board[sq(4, 7)] = { color: 'b', type: 'k' };
    s.board[sq(3, 3)] = { color: 'b', type: 'b' }; // lone bishop
    s.turn = 'w';
    const after = play(s, sq(4, 0), sq(4, 1)); // any king move
    expect(after.status).toBe('draw');
    expect(chessEngine.winners(after)).toEqual([]);
  });

  it('two bots finish a legal game from the start position', () => {
    let s = chessEngine.createInitialState(cfg, makeRng(7));
    let player = 0;
    for (let i = 0; i < 300 && !chessEngine.isGameOver(s); i++) {
      const move = chessEngine.chooseBotMove(s, player, makeRng(i * 3 + 1), 'medium');
      expect(move).not.toBeNull();
      const after = chessEngine.applyAction(s, move!, player, makeRng(1));
      expect(after).not.toBe(s);
      s = after;
      player = 1 - player;
    }
    expect(chessEngine.isGameOver(s)).toBe(true);
  });
});
