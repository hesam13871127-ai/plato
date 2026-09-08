import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */

export type Seat = 0 | 1;
export interface CheckersPiece {
  player: Seat;
  king: boolean;
}
export type Square = [number, number];

export interface CheckersState {
  /** board[row][col] — row 0 at the top (black side) */
  board: (CheckersPiece | null)[][];
  turn: Seat;
  /** when set, this piece must continue its capture chain */
  chainFrom: Square | null;
  winner: Seat | null;
  captured: [number, number];
  lastEvent: {
    player: Seat;
    from: Square;
    to: Square;
    jumped: Square | null;
    crowned: boolean;
  } | null;
}

export type CheckersAction = { type: 'move'; from: Square; to: Square };

/* ------------------------------------------------------------------ */

const N = 8;

function inBoard(r: number, c: number): boolean {
  return r >= 0 && r < N && c >= 0 && c < N;
}

function forward(player: Seat): number {
  return player === 0 ? -1 : 1; // seat 0 starts at the bottom, moves up
}

function isDark(r: number, c: number): boolean {
  return (r + c) % 2 === 1;
}

export function startingBoard(): (CheckersPiece | null)[][] {
  const board: (CheckersPiece | null)[][] = Array.from({ length: N }, () => Array<CheckersPiece | null>(N).fill(null));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < N; c++) if (isDark(r, c)) board[r]![c] = { player: 1, king: false };
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < N; c++) if (isDark(r, c)) board[r]![c] = { player: 0, king: false };
  }
  return board;
}

function pieceDirs(piece: CheckersPiece): [number, number][] {
  const all: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  if (piece.king) return all;
  const f = forward(piece.player);
  return [
    [f, 1],
    [f, -1],
  ];
}

function capturesOf(board: (CheckersPiece | null)[][], from: Square): CheckersAction[] {
  const [r, c] = from;
  const piece = board[r]?.[c];
  if (!piece) return [];
  const out: CheckersAction[] = [];
  for (const [dr, dc] of pieceDirs(piece)) {
    const mr = r + dr;
    const mc = c + dc;
    const lr = r + 2 * dr;
    const lc = c + 2 * dc;
    const mid = inBoard(mr, mc) ? board[mr]?.[mc] : null;
    const landFree = inBoard(lr, lc) && board[lr]?.[lc] === null;
    if (mid && mid.player !== piece.player && landFree) {
      out.push({ type: 'move', from, to: [lr, lc] });
    }
  }
  return out;
}

function simpleMovesOf(board: (CheckersPiece | null)[][], from: Square): CheckersAction[] {
  const [r, c] = from;
  const piece = board[r]?.[c];
  if (!piece) return [];
  const out: CheckersAction[] = [];
  for (const [dr, dc] of pieceDirs(piece)) {
    const lr = r + dr;
    const lc = c + dc;
    if (inBoard(lr, lc) && board[lr]?.[lc] === null) out.push({ type: 'move', from, to: [lr, lc] });
  }
  return out;
}

function allCaptures(board: (CheckersPiece | null)[][], player: Seat): CheckersAction[] {
  const out: CheckersAction[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const p = board[r]?.[c];
      if (p && p.player === player) out.push(...capturesOf(board, [r, c]));
    }
  }
  return out;
}

function allSimpleMoves(board: (CheckersPiece | null)[][], player: Seat): CheckersAction[] {
  const out: CheckersAction[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const p = board[r]?.[c];
      if (p && p.player === player) out.push(...simpleMovesOf(board, [r, c]));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Bot search                                                          */
/* ------------------------------------------------------------------ */

function evaluate(board: (CheckersPiece | null)[][], me: Seat): number {
  let score = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const p = board[r]?.[c];
      if (!p) continue;
      let v = p.king ? 6 : 3;
      v += (3.5 - Math.abs(c - 3.5)) * 0.12; // center is good
      if (!p.king) v += (p.player === 0 ? 7 - r : r) * 0.1; // advancement
      score += p.player === me ? v : -v;
    }
  }
  return score;
}

/**
 * Alpha-beta search over positions. `chainFrom` restricts the mover to
 * continuing a capture chain with that exact piece (English draughts rule).
 */
function searchPos(
  board: (CheckersPiece | null)[][],
  chainFrom: Square | null,
  player: Seat,
  me: Seat,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const moves = chainFrom
    ? capturesOf(board, chainFrom)
    : (() => {
        const caps = allCaptures(board, player);
        return caps.length > 0 ? caps : allSimpleMoves(board, player);
      })();
  if (moves.length === 0) return player === me ? -1000 - depth : 1000 + depth;
  if (depth === 0) return evaluate(board, me);

  const maximizing = player === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const next = applyToBoard(board, move, player);
    let val: number;
    if (next === null) {
      val = 0;
    } else if (next.chain) {
      val = searchPos(next.board, move.to, player, me, depth - 1, alpha, beta);
    } else {
      val = searchPos(next.board, null, (1 - player) as Seat, me, depth - 1, alpha, beta);
    }
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

/** Pure move application used by the search. Returns null for illegal input. */
function applyToBoard(
  board: (CheckersPiece | null)[][],
  move: CheckersAction,
  player: Seat,
): { board: (CheckersPiece | null)[][]; chain: boolean } | null {
  const [fr, fc] = move.from;
  const [tr, tc] = move.to;
  const piece = board[fr]?.[fc];
  if (!piece || piece.player !== player) return null;
  const target = board[tr]?.[tc];
  if (target) return null;

  const next = board.map((row) => row.map((p) => (p ? { ...p } : null)));
  const dr = tr - fr;
  const dc = tc - fc;
  const isJump = Math.abs(dr) === 2 && Math.abs(dc) === 2;

  if (isJump) {
    const mid = next[fr + dr / 2]?.[fc + dc / 2];
    if (!mid || mid.player === player) return null;
    next[fr + dr / 2]![fc + dc / 2] = null;
  } else {
    // simple move: must not be possible while captures exist? (checked by caller)
    if (Math.abs(dr) !== 1 || Math.abs(dc) !== 1) return null;
  }
  next[fr]![fc] = null;
  const crowned = !piece.king && (piece.player === 0 ? tr === 0 : tr === N - 1);
  next[tr]![tc] = crowned ? { player: piece.player, king: true } : { ...piece };

  if (isJump && !crowned && capturesOf(next, [tr, tc]).length > 0) {
    return { board: next, chain: true };
  }
  return { board: next, chain: false };
}

/* ------------------------------------------------------------------ */

export const checkersEngine: GameEngine<CheckersState, CheckersAction> = {
  createInitialState(): CheckersState {
    return {
      board: startingBoard(),
      turn: 0,
      chainFrom: null,
      winner: null,
      captured: [0, 0],
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.winner !== null || state.turn !== playerId) return [];
    if (state.chainFrom) return capturesOf(state.board, state.chainFrom);
    const caps = allCaptures(state.board, playerId as Seat);
    if (caps.length > 0) return caps;
    return allSimpleMoves(state.board, playerId as Seat);
  },

  validate(state, action, playerId) {
    return checkersEngine.legalActions(state, playerId).some(
      (a) => a.from[0] === action.from[0] && a.from[1] === action.from[1] && a.to[0] === action.to[0] && a.to[1] === action.to[1],
    );
  },

  applyAction(state, action, playerId, _rng: RNG) {
    if (!checkersEngine.validate(state, action, playerId)) return state;
    const res = applyToBoard(state.board, action, playerId as Seat);
    if (!res) return state;

    const [fr, fc] = action.from;
    const [tr, tc] = action.to;
    const piece = state.board[fr]?.[fc] as CheckersPiece;
    const isJump = Math.abs(tr - fr) === 2;
    const crowned = !piece.king && (piece.player === 0 ? tr === 0 : tr === N - 1);
    const jumped: Square | null = isJump ? [fr + (tr - fr) / 2, fc + (tc - fc) / 2] : null;

    const captured: [number, number] = isJump
      ? ([...state.captured] as [number, number])
      : state.captured;
    if (isJump) captured[playerId]! += 1;

    const next: CheckersState = {
      ...state,
      board: res.board,
      captured,
      chainFrom: res.chain ? [tr, tc] : null,
      lastEvent: { player: playerId as Seat, from: action.from, to: action.to, jumped, crowned },
    };

    if (res.chain) return next; // same player continues

    const nextPlayer = (1 - playerId) as Seat;
    const oppMoves =
      allCaptures(res.board, nextPlayer).length > 0 || allSimpleMoves(res.board, nextPlayer).length > 0;
    if (!oppMoves) {
      return { ...next, turn: nextPlayer, winner: playerId as Seat };
    }
    return { ...next, turn: nextPlayer };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    const legal = checkersEngine.legalActions(state, playerId);
    if (legal.length === 0) return null;
    if (difficulty === 'easy') return rng.pick(legal);

    const depth = difficulty === 'hard' ? 5 : 2;
    const me = playerId as Seat;
    let best = legal[0]!;
    let bestScore = -Infinity;
    for (const move of legal) {
      const res = applyToBoard(state.board, move, me);
      if (!res) continue;
      const score =
        (res.chain
          ? searchPos(res.board, move.to, me, me, depth - 1, -Infinity, Infinity)
          : searchPos(res.board, null, (1 - me) as Seat, me, depth - 1, -Infinity, Infinity)) +
        rng.next() * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    return best;
  },

  currentPlayers(state) {
    return state.winner !== null ? [] : [state.turn];
  },

  isGameOver(state) {
    return state.winner !== null;
  },

  winners(state) {
    return state.winner !== null ? [state.winner] : [];
  },
};
