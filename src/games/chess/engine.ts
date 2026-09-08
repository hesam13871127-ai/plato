import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ChessColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface ChessPiece {
  color: ChessColor;
  type: PieceType;
}

export interface ChessMove {
  from: number;
  to: number;
  promo?: 'q' | 'r' | 'b' | 'n';
}

export interface ChessState {
  /** 64 squares; index = rank*8 + file; rank 0 = White's first rank (a1 = 0) */
  board: (ChessPiece | null)[];
  turn: ChessColor;
  /** bit flags: 1 = white O-O, 2 = white O-O-O, 4 = black O-O, 8 = black O-O-O */
  castling: number;
  /** en-passant target square (the square behind a just double-pushed pawn) */
  ep: number | null;
  halfmove: number;
  status: 'playing' | 'checkmate' | 'stalemate' | 'draw';
  winner: ChessColor | null;
  lastMove: ChessMove | null;
}

export type ChessAction = ChessMove;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const KNIGHT_OFFS: [number, number][] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_OFFS: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG_DIRS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO_DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function sq(file: number, rank: number): number {
  return rank * 8 + file;
}
function fileOf(i: number): number {
  return i % 8;
}
function rankOf(i: number): number {
  return (i / 8) | 0;
}
function inBoard(f: number, r: number): boolean {
  return f >= 0 && f < 8 && r >= 0 && r < 8;
}

export function findKing(board: (ChessPiece | null)[], color: ChessColor): number {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.type === 'k' && p.color === color) return i;
  }
  return -1;
}

/** Is square `target` attacked by any piece of `by`? */
export function isAttacked(board: (ChessPiece | null)[], target: number, by: ChessColor): boolean {
  const tf = fileOf(target);
  const tr = rankOf(target);

  // pawns (white pawns attack toward higher ranks)
  const pr = by === 'w' ? tr - 1 : tr + 1;
  if (pr >= 0 && pr < 8) {
    for (const df of [-1, 1]) {
      const f = tf + df;
      if (f < 0 || f > 7) continue;
      const p = board[sq(f, pr)];
      if (p && p.color === by && p.type === 'p') return true;
    }
  }
  // knights
  for (const [df, dr] of KNIGHT_OFFS) {
    const f = tf + df;
    const r = tr + dr;
    if (!inBoard(f, r)) continue;
    const p = board[sq(f, r)];
    if (p && p.color === by && p.type === 'n') return true;
  }
  // king
  for (const [df, dr] of KING_OFFS) {
    const f = tf + df;
    const r = tr + dr;
    if (!inBoard(f, r)) continue;
    const p = board[sq(f, r)];
    if (p && p.color === by && p.type === 'k') return true;
  }
  // sliders
  for (const [df, dr] of DIAG_DIRS) {
    let f = tf + df;
    let r = tr + dr;
    while (inBoard(f, r)) {
      const p = board[sq(f, r)];
      if (p) {
        if (p.color === by && (p.type === 'b' || p.type === 'q')) return true;
        break;
      }
      f += df;
      r += dr;
    }
  }
  for (const [df, dr] of ORTHO_DIRS) {
    let f = tf + df;
    let r = tr + dr;
    while (inBoard(f, r)) {
      const p = board[sq(f, r)];
      if (p) {
        if (p.color === by && (p.type === 'r' || p.type === 'q')) return true;
        break;
      }
      f += df;
      r += dr;
    }
  }
  return false;
}

function inCheck(board: (ChessPiece | null)[], color: ChessColor): boolean {
  const k = findKing(board, color);
  return k >= 0 && isAttacked(board, k, color === 'w' ? 'b' : 'w');
}

/** Apply a move to a board copy (no legality filtering — caller ensures pseudo-legality). */
function makeOnBoard(board: (ChessPiece | null)[], move: ChessMove, castling: number, ep: number | null): { board: (ChessPiece | null)[]; castling: number; ep: number | null } {
  const b = board.slice();
  const piece = b[move.from];
  if (!piece) return { board: b, castling, ep };
  const ff = fileOf(move.from);
  const fr = rankOf(move.from);
  const tf = fileOf(move.to);
  const tr = rankOf(move.to);

  const newEp: number | null =
    piece.type === 'p' && Math.abs(tr - fr) === 2 ? sq(ff, (fr + tr) / 2) : null;

  // en passant capture
  if (piece.type === 'p' && ep !== null && move.to === ep && b[move.to] === null && tf !== ff) {
    b[sq(tf, fr)] = null; // captured pawn sits on the from-rank
  }
  // castling rook shuffle
  if (piece.type === 'k' && Math.abs(tf - ff) === 2) {
    if (tf === 6) {
      b[sq(5, fr)] = b[sq(7, fr)];
      b[sq(7, fr)] = null;
    } else {
      b[sq(3, fr)] = b[sq(0, fr)];
      b[sq(0, fr)] = null;
    }
  }

  b[move.to] = piece;
  if (piece.type === 'p' && (tr === 7 || tr === 0)) {
    b[move.to] = { color: piece.color, type: move.promo ?? 'q' };
  }
  b[move.from] = null;

  // castling rights
  let c = castling;
  const clearMask = (i: number): number => {
    if (i === sq(4, 0)) return ~0b0011;
    if (i === sq(0, 0)) return ~0b0010;
    if (i === sq(7, 0)) return ~0b0001;
    if (i === sq(4, 7)) return ~0b1100;
    if (i === sq(0, 7)) return ~0b1000;
    if (i === sq(7, 7)) return ~0b0100;
    return ~0;
  };
  c &= clearMask(move.from) & clearMask(move.to);

  return { board: b, castling: c, ep: newEp };
}

function pseudoMoves(state: ChessState, color: ChessColor): ChessMove[] {
  const moves: ChessMove[] = [];
  const enemy: ChessColor = color === 'w' ? 'b' : 'w';
  const { board } = state;

  const push = (from: number, to: number, promo?: ChessMove['promo']) => {
    moves.push(promo ? { from, to, promo } : { from, to });
  };

  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (!piece || piece.color !== color) continue;
    const f = fileOf(i);
    const r = rankOf(i);

    if (piece.type === 'p') {
      const dir = color === 'w' ? 1 : -1;
      const home = color === 'w' ? 1 : 6;
      const last = color === 'w' ? 7 : 0;
      const r1 = r + dir;
      if (inBoard(f, r1) && board[sq(f, r1)] === null) {
        if (r1 === last) for (const promo of ['q', 'r', 'b', 'n'] as const) push(i, sq(f, r1), promo);
        else push(i, sq(f, r1));
        const r2 = r + 2 * dir;
        if (r === home && board[sq(f, r2)] === null) push(i, sq(f, r2));
      }
      for (const df of [-1, 1]) {
        const cf = f + df;
        if (!inBoard(cf, r1)) continue;
        const target = board[sq(cf, r1)];
        if (target && target.color === enemy) {
          if (r1 === last) for (const promo of ['q', 'r', 'b', 'n'] as const) push(i, sq(cf, r1), promo);
          else push(i, sq(cf, r1));
        } else if (target === null && state.ep === sq(cf, r1)) {
          push(i, sq(cf, r1));
        }
      }
      continue;
    }

    if (piece.type === 'n' || piece.type === 'k') {
      const offs = piece.type === 'n' ? KNIGHT_OFFS : KING_OFFS;
      for (const [df, dr] of offs) {
        const nf = f + df;
        const nr = r + dr;
        if (!inBoard(nf, nr)) continue;
        const target = board[sq(nf, nr)];
        if (target && target.color === color) continue;
        push(i, sq(nf, nr));
      }
      // castling
      if (piece.type === 'k' && f === 4 && r === (color === 'w' ? 0 : 7)) {
        const homeRank = color === 'w' ? 0 : 7;
        const kingBit = color === 'w' ? 1 : 4;
        const queenBit = color === 'w' ? 2 : 8;
        const enemyFrom: ChessColor = enemy;
        if (
          state.castling & kingBit &&
          board[sq(5, homeRank)] === null &&
          board[sq(6, homeRank)] === null &&
          board[sq(7, homeRank)]?.type === 'r' &&
          board[sq(7, homeRank)]?.color === color &&
          !isAttacked(board, sq(4, homeRank), enemyFrom) &&
          !isAttacked(board, sq(5, homeRank), enemyFrom) &&
          !isAttacked(board, sq(6, homeRank), enemyFrom)
        ) {
          push(i, sq(6, homeRank));
        }
        if (
          state.castling & queenBit &&
          board[sq(3, homeRank)] === null &&
          board[sq(2, homeRank)] === null &&
          board[sq(1, homeRank)] === null &&
          board[sq(0, homeRank)]?.type === 'r' &&
          board[sq(0, homeRank)]?.color === color &&
          !isAttacked(board, sq(4, homeRank), enemyFrom) &&
          !isAttacked(board, sq(3, homeRank), enemyFrom) &&
          !isAttacked(board, sq(2, homeRank), enemyFrom)
        ) {
          push(i, sq(2, homeRank));
        }
      }
      continue;
    }

    const dirs = piece.type === 'b' ? DIAG_DIRS : piece.type === 'r' ? ORTHO_DIRS : [...DIAG_DIRS, ...ORTHO_DIRS];
    for (const [df, dr] of dirs) {
      let nf = f + df;
      let nr = r + dr;
      while (inBoard(nf, nr)) {
        const target = board[sq(nf, nr)];
        if (target && target.color === color) break;
        push(i, sq(nf, nr));
        if (target) break;
        nf += df;
        nr += dr;
      }
    }
  }
  return moves;
}

export function legalMoves(state: ChessState, color: ChessColor = state.turn): ChessMove[] {
  return pseudoMoves(state, color).filter((m) => {
    const after = makeOnBoard(state.board, m, state.castling, state.ep);
    return !inCheck(after.board, color);
  });
}

function insufficientMaterial(board: (ChessPiece | null)[]): boolean {
  const pieces: ChessPiece[] = [];
  for (const p of board) if (p && p.type !== 'k') pieces.push(p);
  if (pieces.length === 0) return true;
  if (pieces.length === 1 && (pieces[0]!.type === 'b' || pieces[0]!.type === 'n')) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Bot                                                                 */
/* ------------------------------------------------------------------ */

const PIECE_VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// compact piece-square tables from white's perspective (index = rank*8+file)
const PAWN_PST = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, -20, -20, 10, 10, 5,
  5, -5, -10, 0, 0, -10, -5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, 5, 10, 25, 25, 10, 5, 5,
  10, 10, 20, 30, 30, 20, 10, 10,
  50, 50, 50, 50, 50, 50, 50, 50,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const KNIGHT_PST = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const KING_PST = [
  20, 30, 10, 0, 0, 10, 30, 20,
  20, 20, 0, 0, 0, 0, 20, 20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
];

function evaluate(board: (ChessPiece | null)[], me: ChessColor): number {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const mirror = p.color === 'w' ? i : 63 - i;
    let v = PIECE_VALUE[p.type];
    if (p.type === 'p') v += PAWN_PST[mirror]!;
    else if (p.type === 'n') v += KNIGHT_PST[mirror]!;
    else if (p.type === 'k') v += KING_PST[mirror]!;
    score += p.color === me ? v : -v;
  }
  return score;
}

function moveOrderScore(m: ChessMove, board: (ChessPiece | null)[]): number {
  const victim = board[m.to];
  if (victim) return 10 * PIECE_VALUE[victim.type] - PIECE_VALUE[board[m.from]!.type];
  return 0;
}

function search(
  board: (ChessPiece | null)[],
  castling: number,
  ep: number | null,
  color: ChessColor,
  me: ChessColor,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const stateLike: ChessState = {
    board,
    turn: color,
    castling,
    ep,
    halfmove: 0,
    status: 'playing',
    winner: null,
    lastMove: null,
  };
  const moves = legalMoves(stateLike, color);
  if (moves.length === 0) {
    return inCheck(board, color) ? (color === me ? -100000 - depth : 100000 + depth) : 0;
  }
  if (depth === 0) return evaluate(board, me);

  moves.sort((a, b) => moveOrderScore(b, board) - moveOrderScore(a, board));
  const maximizing = color === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const m of moves) {
    const next = makeOnBoard(board, m, castling, ep);
    const val = search(next.board, next.castling, next.ep, color === 'w' ? 'b' : 'w', me, depth - 1, alpha, beta);
    if (maximizing) {
      if (val > best) best = val;
      if (best > alpha) alpha = best;
    } else {
      if (val < best) best = val;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

function initialState(): ChessState {
  const board: (ChessPiece | null)[] = Array(64).fill(null);
  const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let f = 0; f < 8; f++) {
    board[sq(f, 0)] = { color: 'w', type: back[f]! };
    board[sq(f, 1)] = { color: 'w', type: 'p' };
    board[sq(f, 6)] = { color: 'b', type: 'p' };
    board[sq(f, 7)] = { color: 'b', type: back[f]! };
  }
  return {
    board,
    turn: 'w',
    castling: 0b1111,
    ep: null,
    halfmove: 0,
    status: 'playing',
    winner: null,
    lastMove: null,
  };
}

export const chessEngine: GameEngine<ChessState, ChessAction> = {
  createInitialState(): ChessState {
    return initialState();
  },

  legalActions(state, playerId) {
    if (state.status !== 'playing') return [];
    const color: ChessColor = playerId === 0 ? 'w' : 'b';
    if (state.turn !== color) return [];
    return legalMoves(state, color);
  },

  validate(state, action, playerId) {
    return chessEngine.legalActions(state, playerId).some(
      (m) => m.from === action.from && m.to === action.to && m.promo === action.promo,
    );
  },

  applyAction(state, action, playerId) {
    if (!chessEngine.validate(state, action, playerId)) return state;
    const mover: ChessColor = playerId === 0 ? 'w' : 'b';
    const piece = state.board[action.from]!;
    const isCapture = state.board[action.to] !== null;
    const next = makeOnBoard(state.board, action, state.castling, state.ep);
    const opponent: ChessColor = mover === 'w' ? 'b' : 'w';

    const halfmove = piece.type === 'p' || isCapture ? 0 : state.halfmove + 1;

    const nextTurn = opponent;
    const stateLike: ChessState = {
      board: next.board,
      turn: nextTurn,
      castling: next.castling,
      ep: next.ep,
      halfmove,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    const oppMoves = legalMoves(stateLike, nextTurn);
    const oppInCheck = inCheck(next.board, nextTurn);

    let status: ChessState['status'] = 'playing';
    let winner: ChessColor | null = null;
    if (oppMoves.length === 0) {
      if (oppInCheck) {
        status = 'checkmate';
        winner = mover;
      } else {
        status = 'stalemate';
      }
    } else if (halfmove >= 100 || insufficientMaterial(next.board)) {
      status = 'draw';
    }

    return {
      ...stateLike,
      status,
      winner,
      lastMove: action,
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    const legal = chessEngine.legalActions(state, playerId);
    if (legal.length === 0) return null;
    if (difficulty === 'easy') {
      // mostly random, but take free material sometimes
      const captures = legal.filter((m) => state.board[m.to]);
      if (captures.length > 0 && rng.next() < 0.5) return rng.pick(captures);
      return rng.pick(legal);
    }
    const me: ChessColor = playerId === 0 ? 'w' : 'b';
    const depth = difficulty === 'hard' ? 3 : 2;
    let best = legal[0]!;
    let bestScore = -Infinity;
    const ordered = [...legal].sort((a, b) => moveOrderScore(b, state.board) - moveOrderScore(a, state.board));
    for (const m of ordered) {
      const next = makeOnBoard(state.board, m, state.castling, state.ep);
      const score = search(next.board, next.castling, next.ep, me === 'w' ? 'b' : 'w', me, depth - 1, -Infinity, Infinity) + rng.next() * 4;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  },

  currentPlayers(state) {
    if (state.status !== 'playing') return [];
    return [state.turn === 'w' ? 0 : 1];
  },

  isGameOver(state) {
    return state.status !== 'playing';
  },

  winners(state) {
    if (state.status === 'checkmate' && state.winner) return [state.winner === 'w' ? 0 : 1];
    return [];
  },
};

export function inCheckNow(state: ChessState): boolean {
  return inCheck(state.board, state.turn);
}
