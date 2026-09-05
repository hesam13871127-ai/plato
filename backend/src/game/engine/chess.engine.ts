import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

// Compact chess. Board: 8×8, rank 0 = black back rank, rank 7 = white back rank.
// Pieces: uppercase = white (K,Q,R,B,N,P), lowercase = black (k,q,r,b,n,p), '' empty.
type Piece = string;
type Board = Piece[][];

interface ChessBoard extends Record<string, unknown> {
  board: Board;
  turnColor: 'w' | 'b';
  captured: { w: string[]; b: string[] };
  history: string[];
  /** Plies since a pawn move or capture (50-move rule triggers at 100). */
  halfmoveClock: number;
}

/**
 * Chess for two players (turn-based). Implements full legal move generation for
 * all pieces, check/checkmate/stalemate detection and the 50-move draw rule.
 * Bots run a 1-ply (easy) to 3-ply (hard/expert) alpha-beta minimax with
 * capture-ordered move search and material evaluation, plus difficulty-scaled
 * random mistakes. Coordinates are 0-indexed [rank, file] with rank 0 = black's
 * back rank and rank 7 = white's back rank.
 *
 * Note: castling and en-passant are intentionally omitted to keep the engine
 * self-contained; promotion is supported (auto-queen).
 */
@Injectable()
export class ChessEngine extends BaseGameEngine {
  readonly slug = 'chess';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  private static readonly START: string[] = [
    'rnbqkbnr',
    'pppppppp',
    '........',
    '........',
    '........',
    '........',
    'PPPPPPPP',
    'RNBQKBNR',
  ];

  createInitialState(config: MatchConfig): GameState {
    const board: Board = ChessEngine.START.map((row) =>
      row.split('').map((ch) => (ch === '.' ? '' : ch)),
    );
    const cb: ChessBoard = {
      board,
      turnColor: 'w',
      captured: { w: [], b: [] },
      history: [],
      halfmoveClock: 0,
    };
    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: 0, // seat 0 = white
      turnStartedAt: new Date().toISOString(),
      seats: config.seats.map((s, i) => ({
        seatNumber: i,
        playerId: s.playerId,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        connected: true,
        score: 0,
      })),
      board: cb as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: config.seats.map(() => 0),
      version: 1,
    };
  }

  private colorOf(piece: Piece): 'w' | 'b' | null {
    if (!piece) return null;
    return piece === piece.toUpperCase() ? 'w' : 'b';
  }

  private seatColor(seat: number): 'w' | 'b' {
    return seat === 0 ? 'w' : 'b';
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    if (action.type !== 'move') return { ok: false, error: 'Unknown action.' };
    const cb = state.board as unknown as ChessBoard;
    const from = (action.payload as { from?: unknown }).from as [number, number] | undefined;
    const to = (action.payload as { to?: unknown }).to as [number, number] | undefined;
    if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2) {
      return { ok: false, error: 'Move needs from/to coordinates.' };
    }
    const moves = this.legalMoves(cb, this.seatColor(action.seat));
    const legal = moves.some((m) => m.from[0] === from[0] && m.from[1] === from[1] && m.to[0] === to[0] && m.to[1] === to[1]);
    if (!legal) return { ok: false, error: 'Illegal move.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Illegal move.');
    const next = this.clone(state);
    const cb = next.board as unknown as ChessBoard;
    const from = (action.payload as { from: [number, number] }).from;
    const to = (action.payload as { to: [number, number] }).to;
    this.makeMove(cb, from, to);
    next.version += 1;
    next.turn += 1;

    // makeMove flips turnColor, so cb.turnColor is now the side to move
    // (opponent of the seat that just acted).
    const opponentColor = cb.turnColor;
    const opponentSeat = opponentColor === 'w' ? 0 : 1;
    const moverSeat = opponentSeat === 0 ? 1 : 0;
    const replies = this.legalMoves(cb, opponentColor);
    const opponentInCheck = this.isSquareAttacked(cb, this.kingSquare(cb, opponentColor), opponentColor === 'w' ? 'b' : 'w');
    const fiftyMove = cb.halfmoveClock >= 100;
    if (replies.length === 0 || fiftyMove) {
      // Checkmate: side to move has no legal reply AND is in check → mover wins.
      // Otherwise draw (stalemate or the 50-move rule).
      const checkmate = replies.length === 0 && opponentInCheck;
      const draw = !checkmate;
      next.phase = 'completed';
      next.winnerSeat = draw ? null : moverSeat;
      next.winnerSeats = draw ? [] : [moverSeat];
      next.currentSeat = -1;
      next.scores = next.scores.map((_, i) => (!draw && i === moverSeat ? 1 : 0));
      return next;
    }
    next.currentSeat = opponentSeat;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  private inBounds(r: number, f: number): boolean {
    return r >= 0 && r < 8 && f >= 0 && f < 8;
  }

  /**
   * Legal moves for `color`. Pseudo-legal moves are generated, then each is
   * applied/unmade in place and the side's king is re-tested for check. Because
   * only king moves can relocate the king, non-king moves are validated against
   * the (fixed) king square — cheap and allocation-free.
   */
  private legalMoves(cb: ChessBoard, color: 'w' | 'b'): Array<{ from: [number, number]; to: [number, number] }> {
    const moves: Array<{ from: [number, number]; to: [number, number] }> = [];
    const enemy = color === 'w' ? 'b' : 'w';
    const kingSq = this.kingSquare(cb, color);
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = cb.board[r][f];
        if (this.colorOf(p) !== color) continue;
        const isKing = p.toLowerCase() === 'k';
        for (const to of this.pieceMoves(cb, r, f, p)) {
          const undo = this.applyMove(cb, [r, f], to);
          const kingAfter = isKing ? to : kingSq;
          const safe = !this.isSquareAttacked(cb, kingAfter, enemy);
          this.unmake(cb, undo);
          if (safe) moves.push({ from: [r, f], to });
        }
      }
    }
    return moves;
  }

  private pieceMoves(cb: ChessBoard, r: number, f: number, piece: Piece): Array<[number, number]> {
    const color = this.colorOf(piece)!;
    const type = piece.toLowerCase();
    const moves: Array<[number, number]> = [];
    const isEnemyKing = (nr: number, nf: number): boolean => {
      const t = cb.board[nr][nf];
      return !!t && t.toLowerCase() === 'k' && this.colorOf(t) !== color;
    };
    const add = (nr: number, nf: number): boolean => {
      if (!this.inBounds(nr, nf)) return false;
      const target = cb.board[nr][nf];
      if (!target) {
        moves.push([nr, nf]);
        return true;
      }
      // Never capture a king directly: checkmate is "no legal reply", so a
      // king-on-king "capture" is an illegal square and the ray must stop.
      if (this.colorOf(target) !== color && !isEnemyKing(nr, nf)) moves.push([nr, nf]);
      return false;
    };
    const slide = (dirs: Array<[number, number]>) => {
      for (const [dr, df] of dirs) {
        let nr = r + dr;
        let nf = f + df;
        while (this.inBounds(nr, nf)) {
          const t = cb.board[nr][nf];
          if (!t) {
            moves.push([nr, nf]);
          } else {
            if (this.colorOf(t) !== color && !isEnemyKing(nr, nf)) moves.push([nr, nf]);
            break;
          }
          nr += dr;
          nf += df;
        }
      }
    };

    if (type === 'p') {
      // Rank 0 is black's back rank, rank 7 white's back rank. White pawns move
      // "up the board" from rank 6 toward rank 0 (dir = -1); black from rank 1
      // toward rank 7 (dir = +1).
      const dir = color === 'w' ? -1 : 1;
      const startRank = color === 'w' ? 6 : 1;
      // forward
      if (this.inBounds(r + dir, f) && !cb.board[r + dir][f]) {
        moves.push([r + dir, f]);
        if (r === startRank && !cb.board[r + 2 * dir][f]) moves.push([r + 2 * dir, f]);
      }
      // captures
      for (const df of [-1, 1]) {
        const nr = r + dir;
        const nf = f + df;
        if (this.inBounds(nr, nf)) {
          const t = cb.board[nr][nf];
          if (t && this.colorOf(t) !== color && t.toLowerCase() !== 'k') moves.push([nr, nf]);
        }
      }
    } else if (type === 'n') {
      for (const [dr, df] of [
        [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
      ]) {
        add(r + dr, f + df);
      }
    } else if (type === 'b') {
      slide([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    } else if (type === 'r') {
      slide([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    } else if (type === 'q') {
      slide([[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]);
    } else if (type === 'k') {
      for (const [dr, df] of [
        [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
      ]) {
        add(r + dr, f + df);
      }
    }
    return moves;
  }

  private kingSquare(cb: ChessBoard, color: 'w' | 'b'): [number, number] {
    const king = color === 'w' ? 'K' : 'k';
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        if (cb.board[r][f] === king) return [r, f];
      }
    }
    return [-1, -1];
  }

  /**
   * True if `square` is attacked by any piece of `byColor`. Attack detection is
   * independent of the king-capture rule (a slide "attacks" the king square even
   * though a move may never capture a king), so this uses its own ray scans.
   */
  private isSquareAttacked(cb: ChessBoard, square: [number, number], byColor: 'w' | 'b'): boolean {
    const [tr, tf] = square;
    if (!this.inBounds(tr, tf)) return false;
    // White pawns move toward rank 0, so they attack diagonally from rank tr+1
    // (the square behind the target in movement terms). Black is the mirror.
    const pawnRank = byColor === 'w' ? tr + 1 : tr - 1;
    if (this.inBounds(pawnRank, 0)) {
      for (const pf of [tf - 1, tf + 1]) {
        if (this.inBounds(pawnRank, pf)) {
          const pc = cb.board[pawnRank][pf];
          if (pc && this.colorOf(pc) === byColor && pc.toLowerCase() === 'p') return true;
        }
      }
    }
    // King adjacency.
    const enemyKing = byColor === 'w' ? 'K' : 'k';
    for (const dr of [-1, 0, 1]) {
      for (const df of [-1, 0, 1]) {
        if (dr === 0 && df === 0) continue;
        if (this.inBounds(tr + dr, tf + df) && cb.board[tr + dr][tf + df] === enemyKing) return true;
      }
    }
    // Knight attacks.
    for (const [dr, df] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]) {
      const nr = tr + dr;
      const nf = tf + df;
      if (this.inBounds(nr, nf)) {
        const pc = cb.board[nr][nf];
        if (pc && this.colorOf(pc) === byColor && pc.toLowerCase() === 'n') return true;
      }
    }
    // Sliding attacks: rook/queen along orthogonals, bishop/queen along diagonals.
    const ortho: Array<[number, number]> = [[1,0],[-1,0],[0,1],[0,-1]];
    const diag: Array<[number, number]> = [[1,1],[1,-1],[-1,1],[-1,-1]];
    const ray = (dirs: Array<[number, number]>, targets: string[]) => {
      for (const [dr, df] of dirs) {
        let nr = tr + dr;
        let nf = tf + df;
        while (this.inBounds(nr, nf)) {
          const pc = cb.board[nr][nf];
          if (pc) {
            if (this.colorOf(pc) === byColor && targets.includes(pc.toLowerCase())) return true;
            break;
          }
          nr += dr;
          nf += df;
        }
      }
      return false;
    };
    if (ray(ortho, ['r', 'q'])) return true;
    if (ray(diag, ['b', 'q'])) return true;
    return false;
  }

  /** Apply a player's chosen move on the authoritative (cloned) board. */
  private makeMove(cb: ChessBoard, from: [number, number], to: [number, number]): void {
    const [fr, ff] = from;
    const [tr, tf] = to;
    const piece = cb.board[fr][ff];
    const captured = cb.board[tr][tf];
    const color = this.colorOf(piece)!;
    if (captured) {
      if (color === 'w') cb.captured.w.push(captured);
      else cb.captured.b.push(captured);
    }
    cb.board[tr][tf] = piece;
    cb.board[fr][ff] = '';
    // Auto-promotion to queen.
    if (piece.toLowerCase() === 'p') {
      const promoRank = color === 'w' ? 0 : 7;
      if (tr === promoRank) cb.board[tr][tf] = color === 'w' ? 'Q' : 'q';
    }
    cb.turnColor = color === 'w' ? 'b' : 'w';
    cb.history.push(`${piece}${ff},${fr}-${tf},${tr}`);
    cb.halfmoveClock = piece.toLowerCase() === 'p' || captured ? 0 : (cb.halfmoveClock ?? 0) + 1;
  }

  // ── Bot AI (minimax + alpha-beta) ────────────────────────────────────────

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const cb = state.board as unknown as ChessBoard;
    const color = this.seatColor(seat);
    const moves = this.legalMoves(cb, color);
    const mistakeChance = difficulty === 'easy' ? 0.5 : difficulty === 'medium' ? 0.25 : difficulty === 'hard' ? 0.08 : 0.02;
    let chosen: { from: [number, number]; to: [number, number] };
    if (moves.length === 0) {
      chosen = { from: [0, 0], to: [0, 0] };
    } else if (Math.random() < mistakeChance) {
      chosen = moves[Math.floor(Math.random() * moves.length)];
    } else {
      // Depth capped at 3: each legal move already runs a full check-safety
      // simulation, so deeper plies blow up combinatorially. Strength scales via
      // mistake rate plus capture-first move ordering rather than raw depth.
      const depth = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
      chosen = this.search(cb, color, depth);
    }
    return {
      action: { seat, type: 'move', payload: { from: chosen.from, to: chosen.to } },
      delayMs: this.think(difficulty),
    };
  }

  private search(
    cb: ChessBoard,
    color: 'w' | 'b',
    depth: number,
  ): { from: [number, number]; to: [number, number] } {
    let bestMove = this.legalMoves(cb, color)[0];
    let bestValue = -Infinity;
    // Mutable work board for the tree (avoids allocating a full clone per node).
    for (const move of this.orderedMoves(cb, color)) {
      const undo = this.applyMove(cb, move.from, move.to);
      const value = this.minimax(cb, depth - 1, -Infinity, Infinity, false, color);
      this.unmake(cb, undo);
      if (value > bestValue) {
        bestValue = value;
        bestMove = move;
      }
    }
    return bestMove;
  }

  private minimax(
    cb: ChessBoard,
    depth: number,
    alpha: number,
    beta: number,
    maximizing: boolean,
    aiColor: 'w' | 'b',
  ): number {
    const turn = cb.turnColor;
    const moves = this.orderedMoves(cb, turn);
    if (moves.length === 0) {
      // Side to move is either checkmated (in check) or stalemated.
      const inCheck = this.isSquareAttacked(cb, this.kingSquare(cb, turn), turn === 'w' ? 'b' : 'w');
      // Mated side loses; from AI perspective, far away from the horizon it's
      // still decisive — use a large score so the bot avoids/forces mate.
      const matedIsAi = turn === aiColor;
      if (inCheck) return matedIsAi ? -100000 - depth : 100000 + depth;
      return 0;
    }
    if (depth === 0) return this.evaluate(cb, aiColor);
    if (maximizing) {
      let value = -Infinity;
      for (const move of moves) {
        const undo = this.applyMove(cb, move.from, move.to);
        value = Math.max(value, this.minimax(cb, depth - 1, alpha, beta, false, aiColor));
        this.unmake(cb, undo);
        alpha = Math.max(alpha, value);
        if (beta <= alpha) break;
      }
      return value;
    }
    let value = Infinity;
    for (const move of moves) {
      const undo = this.applyMove(cb, move.from, move.to);
      value = Math.min(value, this.minimax(cb, depth - 1, alpha, beta, true, aiColor));
      this.unmake(cb, undo);
      beta = Math.min(beta, value);
      if (beta <= alpha) break;
    }
    return value;
  }

  /**
   * Legal moves with captures (especially of high-value pieces) first, so
   * alpha-beta pruning cuts early and depth stays fast.
   */
  private orderedMoves(cb: ChessBoard, color: 'w' | 'b'): Array<{ from: [number, number]; to: [number, number] }> {
    const moves = this.legalMoves(cb, color);
    const val: Record<string, number> = { p: 10, n: 32, b: 33, r: 50, q: 90, k: 0 };
    moves.sort((a, b) => {
      const ta = cb.board[a.to[0]][a.to[1]];
      const tb = cb.board[b.to[0]][b.to[1]];
      const va = ta ? val[ta.toLowerCase()] ?? 0 : -1;
      const vb = tb ? val[tb.toLowerCase()] ?? 0 : -1;
      return vb - va;
    });
    return moves;
  }

  private applyMove(cb: ChessBoard, from: [number, number], to: [number, number]): {
    from: [number, number];
    to: [number, number];
    piece: Piece;
    captured: Piece;
    turnColor: 'w' | 'b';
    halfmoveClock: number;
    promoted: boolean;
  } {
    const [fr, ff] = from;
    const [tr, tf] = to;
    const piece = cb.board[fr][ff];
    const captured = cb.board[tr][tf];
    const prevTurn = cb.turnColor;
    const prevClock = cb.halfmoveClock ?? 0;
    cb.board[tr][tf] = piece;
    cb.board[fr][ff] = '';
    // Promotion is always to queen: white pawns promote reaching rank 0, black rank 7.
    const promoRank = this.colorOf(piece) === 'w' ? 0 : 7;
    const promoted = piece.toLowerCase() === 'p' && tr === promoRank;
    if (promoted) cb.board[tr][tf] = piece === piece.toUpperCase() ? 'Q' : 'q';
    cb.turnColor = cb.turnColor === 'w' ? 'b' : 'w';
    cb.halfmoveClock = piece.toLowerCase() === 'p' || captured ? 0 : prevClock + 1;
    return { from, to, piece, captured, turnColor: prevTurn, halfmoveClock: prevClock, promoted };
  }

  private unmake(cb: ChessBoard, u: {
    from: [number, number]; to: [number, number]; piece: Piece; captured: Piece;
    turnColor: 'w' | 'b'; halfmoveClock: number; promoted: boolean;
  }): void {
    const [fr, ff] = u.from;
    const [tr, tf] = u.to;
    // Restore the original pawn if it had promoted.
    cb.board[fr][ff] = u.promoted ? (u.piece === u.piece.toUpperCase() ? 'P' : 'p') : u.piece;
    cb.board[tr][tf] = u.captured;
    cb.turnColor = u.turnColor;
    cb.halfmoveClock = u.halfmoveClock;
  }

  private evaluate(cb: ChessBoard, aiColor: 'w' | 'b'): number {
    const values: Record<string, number> = { p: 10, n: 32, b: 33, r: 50, q: 90, k: 900 };
    let score = 0;
    for (const row of cb.board) {
      for (const piece of row) {
        if (!piece) continue;
        const v = values[piece.toLowerCase()] ?? 0;
        const mine = this.colorOf(piece) === aiColor;
        score += mine ? v : -v;
      }
    }
    return score;
  }

  protected redactHidden(state: GameState, _seat: number): GameState {
    // Chess is a perfect-information game: the board is fully public.
    const cb = state.board as unknown as ChessBoard;
    const safe = {
      board: cb.board,
      turnColor: cb.turnColor,
      captured: cb.captured,
    };
    return { ...state, board: safe as unknown as Record<string, unknown> };
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 2600 : difficulty === 'medium' ? 2000 : difficulty === 'hard' ? 1500 : 1000;
    return base + Math.floor(Math.random() * 1800);
  }

  private clone(state: GameState): GameState {
    const cb = state.board as unknown as ChessBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        board: cb.board.map((row) => [...row]),
        turnColor: cb.turnColor,
        captured: { w: [...cb.captured.w], b: [...cb.captured.b] },
        history: [...cb.history],
        halfmoveClock: cb.halfmoveClock ?? 0,
      } as unknown as Record<string, unknown>,
    };
  }
}
