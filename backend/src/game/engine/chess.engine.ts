import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

interface Piece {
  /** Piece kind: pawn, knight, bishop, rook, queen, king. */
  t: PieceType;
  /** Owning seat (0 = white, 1 = black). */
  s: number;
}

/** grid[row][col]; row 0 is the top (black's back rank), row 7 the bottom. */
type Grid = Array<Array<Piece | null>>;

interface ChessBoard extends Record<string, unknown> {
  grid: Grid;
  /** Castling rights per seat (index 0/1): kingside / queenside. */
  castling: { k: boolean[]; q: boolean[] };
  /** En-passant capture target square, valid for one ply only. */
  ep: [number, number] | null;
  /** Plies since the last pawn move or capture (100 = fifty-move draw). */
  halfmove: number;
  /** Repetition counters: serialised position (side to move included) → count. */
  positions: Record<string, number>;
  lastMove: {
    seat: number;
    from: [number, number];
    to: [number, number];
    piece: PieceType;
    captured: PieceType | null;
    promotion: boolean;
    castle: 'k' | 'q' | null;
    check: boolean;
    mate: boolean;
  } | null;
  /** Why the game ended / live check flag — drives the 3D board. */
  status: 'playing' | 'check' | 'checkmate' | 'stalemate' | 'fifty' | 'repetition' | 'material';
  moveCount: number;
}

interface ChessMove {
  seat: number;
  from: [number, number];
  to: [number, number];
  piece: PieceType;
  captured: PieceType | null;
  /** En-passant pawn capture — the taken pawn is NOT on `to`. */
  epCapture: boolean;
  /** Promotion piece for pawn reaches (four variants are generated). */
  promotion: PieceType | null;
  castle: 'k' | 'q' | null;
}

interface Undo {
  captured: Piece | null;
  capturedAt: [number, number] | null;
  prevEp: [number, number] | null;
  newEp: [number, number] | null;
  prevK0: boolean;
  prevQ0: boolean;
  prevK1: boolean;
  prevQ1: boolean;
}

const SIZE = 8;
const inBoard = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
/** Home (back) rank of a seat: white bottom (7), black top (0). */
const homeRank = (seat: number) => (seat === 0 ? 7 : 0);
/** White pawns march up (-1); black pawns march down (+1). */
const pawnDir = (seat: number) => (seat === 0 ? -1 : 1);

const KNIGHT: ReadonlyArray<readonly [number, number]> = [
  [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2],
];
const KING: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const ROOK_DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS: ReadonlyArray<readonly [number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const PIECE_ORDER: ReadonlyArray<PieceType> = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

const VAL: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/**
 * Piece-square tables (centipawns, white's point of view, row 0 = top).
 * Classic "simplified evaluation" values; black mirrors vertically.
 */
const PST: Record<PieceType, ReadonlyArray<number>> = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

const PROMOS: ReadonlyArray<PieceType> = ['q', 'r', 'b', 'n'];
const MATE = 1_000_000;

/**
 * Standard chess for two players, wave-2 rebuild.
 *
 * Full orthodox rules: sliding pieces, knights, pawn double-push, en passant,
 * promotion (under-promotion included), castling with rights/through-check
 * checks, check/checkmate, stalemate, fifty-move draw, threefold repetition
 * and insufficient-material draw. The engine exposes `status` and `lastMove`
 * for the 3D board. No hidden information.
 *
 * The public {@link legalMoves} helper mirrors the legality rules for clients
 * (and the e2e driver). Bots search with alpha-beta negamax over material +
 * piece-square evaluation: easy/medium play shallow with human slip rates,
 * hard searches two plies, expert three.
 */
@Injectable()
export class ChessEngine extends BaseGameEngine {
  readonly slug = 'chess';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const grid: Grid = Array.from({ length: SIZE }, () => Array<Piece | null>(SIZE).fill(null));
    for (let c = 0; c < SIZE; c++) {
      grid[0][c] = { t: PIECE_ORDER[c], s: 1 };
      grid[1][c] = { t: 'p', s: 1 };
      grid[6][c] = { t: 'p', s: 0 };
      grid[7][c] = { t: PIECE_ORDER[c], s: 0 };
    }
    const board: ChessBoard = {
      grid,
      castling: { k: [true, true], q: [true, true] },
      ep: null,
      halfmove: 0,
      positions: {},
      lastMove: null,
      status: 'playing',
      moveCount: 0,
    };
    board.positions[this.positionKey(board, 0)] = 1;
    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: 0,
      turnStartedAt: new Date().toISOString(),
      seats: config.seats.map((s, i) => ({
        seatNumber: i,
        playerId: s.playerId,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        connected: true,
        score: 0,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: config.seats.map(() => 0),
      version: 1,
    };
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'The game is already over.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    if (action.type !== 'move') return { ok: false, error: 'Unknown action.' };
    const board = state.board as unknown as ChessBoard;
    const from = parseSquare(action.payload.from);
    const to = parseSquare(action.payload.to);
    if (!from || !to) return { ok: false, error: 'Choose valid squares.' };
    const piece = board.grid[from[0]][from[1]];
    if (!piece) return { ok: false, error: 'There is no piece there.' };
    if (piece.s !== action.seat) return { ok: false, error: 'That piece is not yours.' };

    const rawPromo = action.payload.promotion;
    let promo: PieceType | null = null;
    if (rawPromo !== undefined && rawPromo !== null) {
      if (typeof rawPromo !== 'string' || !PROMOS.includes(rawPromo as PieceType)) {
        return { ok: false, error: 'Promotion must be queen, rook, bishop or knight.' };
      }
      promo = rawPromo as PieceType;
    }

    const legal = this.legalMovesFor(board, action.seat);
    const candidates = legal.filter(
      (m) => m.from[0] === from[0] && m.from[1] === from[1] && m.to[0] === to[0] && m.to[1] === to[1],
    );
    if (candidates.length === 0) return { ok: false, error: 'That move is not legal.' };
    const match =
      candidates.find((m) => m.promotion === (m.promotion ? promo ?? 'q' : null)) ??
      candidates[0];
    if (match.promotion && !promo) promo = 'q'; // default crowning
    if (promo && !match.promotion) return { ok: false, error: 'That piece cannot promote.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as ChessBoard;
    const from = parseSquare(action.payload.from) as [number, number];
    const to = parseSquare(action.payload.to) as [number, number];
    const seat = action.seat;
    const promo = (action.payload.promotion as PieceType | undefined) ?? null;

    const legal = this.legalMovesFor(board, seat);
    const move =
      legal.find(
        (m) =>
          m.from[0] === from[0] && m.from[1] === from[1] &&
          m.to[0] === to[0] && m.to[1] === to[1] &&
          m.promotion === (m.promotion ? promo ?? 'q' : null),
      ) ?? legal[0];

    const undo = this.make(board.grid, board.castling, board.ep, move);
    board.ep = undo.newEp;
    board.halfmove = move.piece === 'p' || move.captured ? 0 : board.halfmove + 1;
    board.moveCount += 1;

    const opponent = (seat + 1) % 2;
    const key = this.positionKey(board, opponent);
    board.positions[key] = (board.positions[key] ?? 0) + 1;

    const oppLegal = this.legalMovesFor(board, opponent);
    const inCheck = this.kingAttacked(board.grid, opponent);
    board.lastMove = {
      seat,
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured,
      promotion: move.promotion !== null,
      castle: move.castle,
      check: inCheck,
      mate: inCheck && oppLegal.length === 0,
    };
    next.version += 1;

    if (oppLegal.length === 0) {
      if (inCheck) {
        board.status = 'checkmate';
        this.finish(next, seat);
      } else {
        board.status = 'stalemate';
        this.finish(next, null);
      }
      return next;
    }
    if (board.halfmove >= 100) {
      board.status = 'fifty';
      this.finish(next, null);
      return next;
    }
    if ((board.positions[key] ?? 0) >= 3) {
      board.status = 'repetition';
      this.finish(next, null);
      return next;
    }
    if (this.insufficientMaterial(board.grid)) {
      board.status = 'material';
      this.finish(next, null);
      return next;
    }

    board.status = inCheck ? 'check' : 'playing';
    next.currentSeat = opponent;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as ChessBoard;
    const legal = this.legalMovesFor(board, seat);
    if (legal.length === 0) {
      // Defensive: the session service never asks a finished engine.
      return { action: { seat, type: 'move', payload: { from: [6, 4], to: [4, 4] } }, delayMs: 500 };
    }
    const mistakeChance =
      difficulty === 'easy' ? 0.45 : difficulty === 'medium' ? 0.18 : difficulty === 'hard' ? 0.06 : 0.0;
    const depth = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : difficulty === 'hard' ? 2 : 3;

    let pick: ChessMove;
    if (Math.random() < mistakeChance) {
      pick = legal[Math.floor(Math.random() * legal.length)];
    } else {
      const jitter = difficulty === 'easy' ? 60 : difficulty === 'medium' ? 30 : 0;
      pick = this.searchRoot(board, seat, depth, jitter);
    }
    return {
      action: {
        seat,
        type: 'move',
        payload: {
          from: [pick.from[0], pick.from[1]],
          to: [pick.to[0], pick.to[1]],
          ...(pick.promotion ? { promotion: pick.promotion } : {}),
        },
      },
      delayMs: this.think(difficulty),
    };
  }

  /** Legal moves for the seat to move — the client mirror of the rules. */
  legalMoves(state: GameState): ChessMove[] {
    const board = state.board as unknown as ChessBoard;
    return this.legalMovesFor(board, state.currentSeat);
  }

  // ── move generation ───────────────────────────────────────────────────────

  private legalMovesFor(board: ChessBoard, seat: number): ChessMove[] {
    const rights = { k: [...board.castling.k], q: [...board.castling.q] };
    return this.pseudoMoves(board.grid, seat, rights, board.ep).filter((m) => {
      const undo = this.make(board.grid, rights, board.ep, m);
      const illegal = this.kingAttacked(board.grid, seat);
      this.unmake(board.grid, rights, m, undo);
      return !illegal;
    });
  }

  private pseudoMoves(
    grid: Grid,
    seat: number,
    rights: { k: boolean[]; q: boolean[] },
    ep: [number, number] | null,
  ): ChessMove[] {
    const moves: ChessMove[] = [];
    const enemy = 1 - seat;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = grid[r][c];
        if (!p || p.s !== seat) continue;

        if (p.t === 'p') {
          const dir = pawnDir(seat);
          const promoRow = seat === 0 ? 0 : 7;
          const startRow = seat === 0 ? 6 : 1;
          const push: [number, number] = [r + dir, c];
          if (inBoard(push[0], push[1]) && !grid[push[0]][push[1]]) {
            this.pushPawnMove(moves, seat, [r, c], push, null, false, push[0] === promoRow);
            const leap: [number, number] = [r + 2 * dir, c];
            if (r === startRow && !grid[leap[0]][leap[1]]) {
              moves.push({ seat, from: [r, c], to: leap, piece: 'p', captured: null, epCapture: false, promotion: null, castle: null });
            }
          }
          for (const dc of [-1, 1]) {
            const tr = r + dir;
            const tc = c + dc;
            if (!inBoard(tr, tc)) continue;
            const target = grid[tr][tc];
            if (target && target.s === enemy) {
              this.pushPawnMove(moves, seat, [r, c], [tr, tc], target.t, false, tr === promoRow);
            } else if (!target && ep && ep[0] === tr && ep[1] === tc) {
              moves.push({ seat, from: [r, c], to: [tr, tc], piece: 'p', captured: 'p', epCapture: true, promotion: null, castle: null });
            }
          }
        } else if (p.t === 'n' || p.t === 'k') {
          const offsets = p.t === 'n' ? KNIGHT : KING;
          for (const [dr, dc] of offsets) {
            const tr = r + dr;
            const tc = c + dc;
            if (!inBoard(tr, tc)) continue;
            const target = grid[tr][tc];
            if (!target) {
              moves.push({ seat, from: [r, c], to: [tr, tc], piece: p.t, captured: null, epCapture: false, promotion: null, castle: null });
            } else if (target.s === enemy) {
              moves.push({ seat, from: [r, c], to: [tr, tc], piece: p.t, captured: target.t, epCapture: false, promotion: null, castle: null });
            }
          }
        } else {
          const dirs = p.t === 'r' ? ROOK_DIRS : p.t === 'b' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
          for (const [dr, dc] of dirs) {
            let tr = r + dr;
            let tc = c + dc;
            while (inBoard(tr, tc)) {
              const target = grid[tr][tc];
              if (!target) {
                moves.push({ seat, from: [r, c], to: [tr, tc], piece: p.t, captured: null, epCapture: false, promotion: null, castle: null });
              } else {
                if (target.s === enemy) {
                  moves.push({ seat, from: [r, c], to: [tr, tc], piece: p.t, captured: target.t, epCapture: false, promotion: null, castle: null });
                }
                break;
              }
              tr += dr;
              tc += dc;
            }
          }
        }
      }
    }

    // Castling: rights intact, path empty, not out of / through / into check.
    const hr = homeRank(seat);
    const king = grid[hr][4];
    if (king && king.t === 'k' && king.s === seat) {
      if (
        rights.k[seat] &&
        grid[hr][5] === null && grid[hr][6] === null &&
        grid[hr][7]?.t === 'r' && grid[hr][7].s === seat &&
        !this.isAttacked(grid, hr, 4, enemy) &&
        !this.isAttacked(grid, hr, 5, enemy) &&
        !this.isAttacked(grid, hr, 6, enemy)
      ) {
        moves.push({ seat, from: [hr, 4], to: [hr, 6], piece: 'k', captured: null, epCapture: false, promotion: null, castle: 'k' });
      }
      if (
        rights.q[seat] &&
        grid[hr][1] === null && grid[hr][2] === null && grid[hr][3] === null &&
        grid[hr][0]?.t === 'r' && grid[hr][0].s === seat &&
        !this.isAttacked(grid, hr, 4, enemy) &&
        !this.isAttacked(grid, hr, 3, enemy) &&
        !this.isAttacked(grid, hr, 2, enemy)
      ) {
        moves.push({ seat, from: [hr, 4], to: [hr, 2], piece: 'k', captured: null, epCapture: false, promotion: null, castle: 'q' });
      }
    }
    return moves;
  }

  private pushPawnMove(
    moves: ChessMove[],
    seat: number,
    from: [number, number],
    to: [number, number],
    captured: PieceType | null,
    epCapture: boolean,
    isPromotion: boolean,
  ): void {
    if (isPromotion) {
      for (const promo of PROMOS) {
        moves.push({ seat, from, to, piece: 'p', captured, epCapture, promotion: promo, castle: null });
      }
    } else {
      moves.push({ seat, from, to, piece: 'p', captured, epCapture, promotion: null, castle: null });
    }
  }

  // ── make / unmake (mutating, always restored) ────────────────────────────

  private make(
    grid: Grid,
    rights: { k: boolean[]; q: boolean[] },
    ep: [number, number] | null,
    m: ChessMove,
  ): Undo {
    const undo: Undo = {
      captured: null,
      capturedAt: null,
      prevEp: ep,
      newEp: null,
      prevK0: rights.k[0], prevQ0: rights.q[0],
      prevK1: rights.k[1], prevQ1: rights.q[1],
    };
    const moving = grid[m.from[0]][m.from[1]] as Piece;

    if (m.epCapture) {
      const capR = m.to[0] + (m.seat === 0 ? 1 : -1);
      undo.captured = grid[capR][m.to[1]];
      undo.capturedAt = [capR, m.to[1]];
      grid[capR][m.to[1]] = null;
    } else if (grid[m.to[0]][m.to[1]]) {
      undo.captured = grid[m.to[0]][m.to[1]];
      undo.capturedAt = [m.to[0], m.to[1]];
    }

    grid[m.from[0]][m.from[1]] = null;
    grid[m.to[0]][m.to[1]] = m.promotion ? { t: m.promotion, s: m.seat } : moving;

    if (m.castle) {
      const hr = homeRank(m.seat);
      if (m.castle === 'k') {
        grid[hr][5] = grid[hr][7];
        grid[hr][7] = null;
      } else {
        grid[hr][3] = grid[hr][0];
        grid[hr][0] = null;
      }
    }

    // Castling-rights bookkeeping.
    if (m.piece === 'k') {
      rights.k[m.seat] = false;
      rights.q[m.seat] = false;
    }
    const hr = homeRank(m.seat);
    if (m.piece === 'r') {
      if (m.from[0] === hr && m.from[1] === 7) rights.k[m.seat] = false;
      if (m.from[0] === hr && m.from[1] === 0) rights.q[m.seat] = false;
    }
    if (undo.captured && undo.captured.t === 'r' && undo.capturedAt) {
      const enemy = 1 - m.seat;
      const ehr = homeRank(enemy);
      if (undo.capturedAt[0] === ehr && undo.capturedAt[1] === 7) rights.k[enemy] = false;
      if (undo.capturedAt[0] === ehr && undo.capturedAt[1] === 0) rights.q[enemy] = false;
    }

    if (m.piece === 'p' && Math.abs(m.to[0] - m.from[0]) === 2) {
      undo.newEp = [(m.from[0] + m.to[0]) / 2, m.from[1]];
    }
    return undo;
  }

  private unmake(
    grid: Grid,
    rights: { k: boolean[]; q: boolean[] },
    m: ChessMove,
    u: Undo,
  ): void {
    const moving = grid[m.to[0]][m.to[1]] as Piece;
    grid[m.from[0]][m.from[1]] =
      m.piece === 'p' && m.promotion ? { t: 'p', s: m.seat } : moving;
    grid[m.to[0]][m.to[1]] = null;
    if (u.capturedAt) grid[u.capturedAt[0]][u.capturedAt[1]] = u.captured;
    if (m.castle) {
      const hr = homeRank(m.seat);
      if (m.castle === 'k') {
        grid[hr][7] = grid[hr][5];
        grid[hr][5] = null;
      } else {
        grid[hr][0] = grid[hr][3];
        grid[hr][3] = null;
      }
    }
    rights.k[0] = u.prevK0; rights.q[0] = u.prevQ0;
    rights.k[1] = u.prevK1; rights.q[1] = u.prevQ1;
  }

  // ── attack detection ──────────────────────────────────────────────────────

  private isAttacked(grid: Grid, r: number, c: number, bySeat: number): boolean {
    // Pawns: a white pawn on (r+1, c±1) attacks (r,c); black mirrors.
    const pr = r + (bySeat === 0 ? 1 : -1);
    for (const dc of [-1, 1]) {
      if (inBoard(pr, c + dc)) {
        const p = grid[pr][c + dc];
        if (p && p.s === bySeat && p.t === 'p') return true;
      }
    }
    for (const [dr, dc] of KNIGHT) {
      const tr = r + dr;
      const tc = c + dc;
      if (!inBoard(tr, tc)) continue;
      const p = grid[tr][tc];
      if (p && p.s === bySeat && p.t === 'n') return true;
    }
    for (const [dr, dc] of KING) {
      const tr = r + dr;
      const tc = c + dc;
      if (!inBoard(tr, tc)) continue;
      const p = grid[tr][tc];
      if (p && p.s === bySeat && p.t === 'k') return true;
    }
    for (const [dr, dc] of ROOK_DIRS) {
      let tr = r + dr;
      let tc = c + dc;
      while (inBoard(tr, tc)) {
        const p = grid[tr][tc];
        if (p) {
          if (p.s === bySeat && (p.t === 'r' || p.t === 'q')) return true;
          break;
        }
        tr += dr;
        tc += dc;
      }
    }
    for (const [dr, dc] of BISHOP_DIRS) {
      let tr = r + dr;
      let tc = c + dc;
      while (inBoard(tr, tc)) {
        const p = grid[tr][tc];
        if (p) {
          if (p.s === bySeat && (p.t === 'b' || p.t === 'q')) return true;
          break;
        }
        tr += dr;
        tc += dc;
      }
    }
    return false;
  }

  private kingAttacked(grid: Grid, seat: number): boolean {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = grid[r][c];
        if (p && p.s === seat && p.t === 'k') {
          return this.isAttacked(grid, r, c, 1 - seat);
        }
      }
    }
    return false;
  }

  // ── draws ─────────────────────────────────────────────────────────────────

  private insufficientMaterial(grid: Grid): boolean {
    const knights = [0, 0];
    const bishops = [0, 0];
    const bishopSquareColors = new Set<number>();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = grid[r][c];
        if (!p || p.t === 'k') continue;
        if (p.t === 'p' || p.t === 'r' || p.t === 'q') return false;
        if (p.t === 'n') knights[p.s] += 1;
        else {
          bishops[p.s] += 1;
          bishopSquareColors.add((r + c) % 2);
        }
      }
    }
    const minors = knights[0] + knights[1] + bishops[0] + bishops[1];
    // King vs king, or a single minor against a king.
    if (minors <= 1) return true;
    // Bishops only, and all on the same square colour: nothing can give mate.
    if (knights[0] === 0 && knights[1] === 0 && bishopSquareColors.size <= 1) return true;
    return false;
  }

  private positionKey(board: ChessBoard, seatToMove: number): string {
    const parts: string[] = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = board.grid[r][c];
        parts.push(p ? (p.s === 0 ? p.t.toUpperCase() : p.t) : '.');
      }
    }
    const rights =
      (board.castling.k[0] ? 'K' : '') + (board.castling.q[0] ? 'Q' : '') +
      (board.castling.k[1] ? 'k' : '') + (board.castling.q[1] ? 'q' : '');
    parts.push('|', String(seatToMove), '|', rights || '-', '|', board.ep ? `${board.ep[0]}${board.ep[1]}` : '-');
    return parts.join('');
  }

  // ── bot search ────────────────────────────────────────────────────────────

  private searchRoot(board: ChessBoard, seat: number, depth: number, jitter: number): ChessMove {
    // Operate on private copies — the real board is never touched.
    const grid: Grid = board.grid.map((row) => row.map((p) => (p ? { ...p } : null)));
    const rights = { k: [...board.castling.k], q: [...board.castling.q] };
    const ep = board.ep ? ([...board.ep] as [number, number]) : null;
    const legal = this.legalMovesFor({ ...board, grid } as ChessBoard, seat);
    if (legal.length === 1) return legal[0];

    let best = legal[0];
    let bestScore = -Infinity;
    let alpha = -Infinity;
    for (const m of legal) {
      const u = this.make(grid, rights, ep, m);
      let score: number;
      if (depth <= 1) {
        score = this.evalBoard(grid, seat) + (jitter ? Math.random() * 2 * jitter - jitter : 0);
      } else {
        score = -this.negamax(grid, 1 - seat, depth - 1, -Infinity, -alpha, rights, u.newEp, 1);
      }
      this.unmake(grid, rights, m, u);
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
      if (score > alpha) alpha = score;
    }
    return best;
  }

  private negamax(
    grid: Grid,
    seat: number,
    depth: number,
    alphaIn: number,
    beta: number,
    rights: { k: boolean[]; q: boolean[] },
    ep: [number, number] | null,
    ply: number,
  ): number {
    let alpha = alphaIn;
    const moves = this.pseudoMoves(grid, seat, rights, ep);
    // Captures & promotions first — cheap but effective move ordering.
    moves.sort((a, b) => this.orderScore(b) - this.orderScore(a));
    let best = -Infinity;
    let anyLegal = false;
    for (const m of moves) {
      const u = this.make(grid, rights, ep, m);
      if (this.kingAttacked(grid, seat)) {
        this.unmake(grid, rights, m, u);
        continue;
      }
      anyLegal = true;
      const score =
        depth <= 1
          ? this.evalBoard(grid, seat)
          : -this.negamax(grid, 1 - seat, depth - 1, -beta, -alpha, rights, u.newEp, ply + 1);
      this.unmake(grid, rights, m, u);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    if (!anyLegal) {
      return this.kingAttacked(grid, seat) ? -MATE + ply : 0;
    }
    return best;
  }

  private orderScore(m: ChessMove): number {
    let s = 0;
    if (m.captured) s += 10 * VAL[m.captured] - VAL[m.piece];
    if (m.promotion) s += VAL[m.promotion];
    return s;
  }

  private evalBoard(grid: Grid, seat: number): number {
    let score = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = grid[r][c];
        if (!p) continue;
        const table = PST[p.t];
        if (p.s === seat) {
          score += VAL[p.t] + table[r * SIZE + c];
        } else {
          score -= VAL[p.t] + table[(SIZE - 1 - r) * SIZE + c];
        }
      }
    }
    return score;
  }

  // ── shared helpers ────────────────────────────────────────────────────────

  private finish(state: GameState, winnerSeat: number | null): void {
    const scores = state.scores.map((_, i) => (winnerSeat === null ? 0 : i === winnerSeat ? 1 : 0));
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = scores;
    state.seats = state.seats.map((s, i) => ({ ...s, score: scores[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1500 : difficulty === 'medium' ? 1100 : difficulty === 'hard' ? 800 : 550;
    return base + Math.floor(Math.random() * 900);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as ChessBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        grid: board.grid.map((row) => row.map((p) => (p ? { ...p } : null))),
        castling: { k: [...board.castling.k], q: [...board.castling.q] },
        ep: board.ep ? ([...board.ep] as [number, number]) : null,
        halfmove: board.halfmove,
        positions: { ...board.positions },
        lastMove: board.lastMove
          ? {
              ...board.lastMove,
              from: [...board.lastMove.from] as [number, number],
              to: [...board.lastMove.to] as [number, number],
            }
          : null,
        status: board.status,
        moveCount: board.moveCount,
      } as unknown as Record<string, unknown>,
    };
  }
}

function parseSquare(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const r = Number(raw[0]);
  const c = Number(raw[1]);
  if (!Number.isInteger(r) || !Number.isInteger(c) || !inBoard(r, c)) return null;
  return [r, c];
}
