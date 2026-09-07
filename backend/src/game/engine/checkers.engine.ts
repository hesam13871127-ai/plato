import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/**
 * Cell contents: '' empty, 'r' seat-0 man, 'R' seat-0 king, 'b' seat-1 man,
 * 'B' seat-1 king. Row 0 is the TOP of the board (seat 1's back rank); seat 0
 * starts at the bottom (rows 5–7) and moves "up" (towards row 0).
 */
type Cell = '' | 'r' | 'R' | 'b' | 'B';

interface Move {
  from: [number, number];
  to: [number, number];
  /** Squares of captured pieces along a jump chain (empty for simple moves). */
  captures: Array<[number, number]>;
  /** Every intermediate landing square (multi-jump path), including `to`. */
  path: Array<[number, number]>;
}

interface CheckersBoard extends Record<string, unknown> {
  grid: Cell[][];
  lastMove: { seat: number; path: Array<[number, number]>; captures: Array<[number, number]> } | null;
  /** Count of pieces each seat has captured. */
  captured: [number, number];
  /** Plies without a capture or man move — 40 (20 moves each) declares a draw. */
  quietPlies: number;
  /** Serialised legal moves for the seat to move (UI highlights); server-only origin. */
  legal: Move[];
}

const SIZE = 8;

/**
 * Checkers (English draughts) for two players. Standard rules: men move
 * diagonally forward, kings move both ways, captures are mandatory and jump
 * chains continue while possible, men crown on the far rank. A side with no
 * legal move loses. Bots use a shallow alpha-beta search whose depth scales
 * with difficulty, with occasional natural mistakes on easy/medium.
 */
@Injectable()
export class CheckersEngine extends BaseGameEngine {
  readonly slug = 'checkers';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const grid: Cell[][] = Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(''));
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if ((r + c) % 2 === 1) {
          if (r < 3) grid[r][c] = 'b';
          else if (r > 4) grid[r][c] = 'r';
        }
      }
    }
    const board: CheckersBoard = { grid, lastMove: null, captured: [0, 0], quietPlies: 0, legal: [] };
    board.legal = this.legalMoves(board, 0);
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
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    if (action.type !== 'move') return { ok: false, error: 'Unknown action.' };
    const board = state.board as unknown as CheckersBoard;
    const move = this.findMove(board, action);
    if (!move) {
      const mustCapture = board.legal.some((m) => m.captures.length > 0);
      return { ok: false, error: mustCapture ? 'You must capture when you can.' : 'That move is not legal.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as CheckersBoard;
    const move = this.findMove(board, action)!;
    this.play(board, move, action.seat);
    next.version += 1;

    const opponent = (action.seat + 1) % 2;
    const oppMoves = this.legalMoves(board, opponent);
    if (oppMoves.length === 0) {
      board.legal = [];
      this.finish(next, action.seat);
      return next;
    }
    if (board.quietPlies >= 40) {
      board.legal = [];
      this.finishDraw(next);
      return next;
    }
    board.legal = oppMoves;
    next.currentSeat = opponent;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as CheckersBoard;
    const legal = board.legal.length ? board.legal : this.legalMoves(board, seat);
    const mistake = difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.15 : difficulty === 'hard' ? 0.05 : 0.0;
    let chosen: Move;
    if (legal.length === 1 || Math.random() < mistake) {
      chosen = legal[Math.floor(Math.random() * legal.length)];
    } else {
      const depth = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : difficulty === 'hard' ? 4 : 6;
      chosen = this.search(board, seat, legal, depth);
    }
    return {
      action: { seat, type: 'move', payload: { from: chosen.from, to: chosen.to } },
      delayMs: this.think(difficulty),
    };
  }

  // ── Rules ─────────────────────────────────────────────────────────────────

  private owner(cell: Cell): number {
    if (cell === 'r' || cell === 'R') return 0;
    if (cell === 'b' || cell === 'B') return 1;
    return -1;
  }

  private isKing(cell: Cell): boolean {
    return cell === 'R' || cell === 'B';
  }

  private directions(cell: Cell): Array<[number, number]> {
    if (this.isKing(cell)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    // Seat 0 (r) moves up (row decreasing); seat 1 (b) moves down.
    return cell === 'r' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
  }

  private inside(r: number, c: number): boolean {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  /** All legal moves for a seat; captures are mandatory when any exist. */
  legalMoves(board: CheckersBoard, seat: number): Move[] {
    const grid = board.grid;
    const captures: Move[] = [];
    const simple: Move[] = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = grid[r][c];
        if (this.owner(cell) !== seat) continue;
        this.jumpChains(grid, r, c, cell, [], [[r, c]], captures);
        if (captures.length === 0) {
          for (const [dr, dc] of this.directions(cell)) {
            const nr = r + dr;
            const nc = c + dc;
            if (this.inside(nr, nc) && grid[nr][nc] === '') {
              simple.push({ from: [r, c], to: [nr, nc], captures: [], path: [[nr, nc]] });
            }
          }
        }
      }
    }
    return captures.length > 0 ? captures : simple;
  }

  /** Depth-first enumeration of maximal jump chains from (r,c). */
  private jumpChains(
    grid: Cell[][],
    r: number,
    c: number,
    piece: Cell,
    taken: Array<[number, number]>,
    path: Array<[number, number]>,
    out: Move[],
  ): void {
    let extended = false;
    for (const [dr, dc] of this.directions(piece)) {
      const mr = r + dr;
      const mc = c + dc;
      const lr = r + dr * 2;
      const lc = c + dc * 2;
      if (!this.inside(lr, lc)) continue;
      const mid = grid[mr][mc];
      if (mid === '' || this.owner(mid) === this.owner(piece)) continue;
      if (taken.some(([tr, tc]) => tr === mr && tc === mc)) continue;
      if (grid[lr][lc] !== '' && !(lr === path[0][0] && lc === path[0][1])) continue;
      extended = true;
      // Temporarily lift the piece so a chain may pass through its origin.
      const origin = grid[path[0][0]][path[0][1]];
      grid[path[0][0]][path[0][1]] = '';
      this.jumpChains(grid, lr, lc, piece, [...taken, [mr, mc]], [...path, [lr, lc]], out);
      grid[path[0][0]][path[0][1]] = origin;
    }
    if (!extended && taken.length > 0) {
      out.push({ from: path[0], to: path[path.length - 1], captures: taken, path: path.slice(1) });
    }
  }

  private findMove(board: CheckersBoard, action: GameAction): Move | null {
    const p = action.payload as { from?: unknown; to?: unknown };
    const from = this.coord(p.from);
    const to = this.coord(p.to);
    if (!from || !to) return null;
    const legal = board.legal.length ? board.legal : this.legalMoves(board, action.seat);
    // Several chains may share from/to; prefer the one capturing the most.
    const matches = legal.filter((m) => m.from[0] === from[0] && m.from[1] === from[1] && m.to[0] === to[0] && m.to[1] === to[1]);
    if (matches.length === 0) return null;
    matches.sort((a, b) => b.captures.length - a.captures.length);
    return matches[0];
  }

  private coord(v: unknown): [number, number] | null {
    if (!Array.isArray(v) || v.length !== 2) return null;
    const r = Number(v[0]);
    const c = Number(v[1]);
    if (!Number.isInteger(r) || !Number.isInteger(c) || !this.inside(r, c)) return null;
    return [r, c];
  }

  private play(board: CheckersBoard, move: Move, seat: number): void {
    const grid = board.grid;
    let piece = grid[move.from[0]][move.from[1]];
    grid[move.from[0]][move.from[1]] = '';
    for (const [cr, cc] of move.captures) grid[cr][cc] = '';
    // Crown on the far rank.
    const crownRow = seat === 0 ? 0 : SIZE - 1;
    if (move.to[0] === crownRow && !this.isKing(piece)) piece = seat === 0 ? 'R' : 'B';
    grid[move.to[0]][move.to[1]] = piece;
    board.captured[seat] += move.captures.length;
    board.lastMove = { seat, path: [move.from, ...move.path], captures: move.captures };
    board.quietPlies = move.captures.length > 0 || !this.isKing(piece) ? 0 : board.quietPlies + 1;
  }

  // ── AI ────────────────────────────────────────────────────────────────────

  private evaluate(grid: Cell[][], seat: number): number {
    let score = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = grid[r][c];
        if (cell === '') continue;
        const o = this.owner(cell);
        let v = this.isKing(cell) ? 160 : 100;
        // Advancement for men, centre control, back-rank guard.
        if (!this.isKing(cell)) v += o === 0 ? (SIZE - 1 - r) * 3 : r * 3;
        if (c >= 2 && c <= 5 && r >= 2 && r <= 5) v += 4;
        if ((o === 0 && r === SIZE - 1) || (o === 1 && r === 0)) v += 6;
        score += o === seat ? v : -v;
      }
    }
    return score;
  }

  private search(board: CheckersBoard, seat: number, legal: Move[], depth: number): Move {
    let best = legal[0];
    let bestScore = -Infinity;
    const ordered = [...legal].sort((a, b) => b.captures.length - a.captures.length);
    for (const move of ordered) {
      const sim = this.simulate(board, move, seat);
      const score = -this.negamax(sim, (seat + 1) % 2, depth - 1, -Infinity, Infinity, seat);
      const jitter = Math.random() * 2;
      if (score + jitter > bestScore) {
        bestScore = score + jitter;
        best = move;
      }
    }
    return best;
  }

  private negamax(board: CheckersBoard, seat: number, depth: number, alpha: number, beta: number, root: number): number {
    const moves = this.legalMoves(board, seat);
    if (moves.length === 0) return -10000;
    if (depth <= 0) {
      // Quiescence: extend while captures are available (cheap and avoids horizon blunders).
      if (moves[0].captures.length === 0 || depth < -3) {
        const e = this.evaluate(board.grid, seat);
        return e;
      }
    }
    let best = -Infinity;
    const ordered = moves.sort((a, b) => b.captures.length - a.captures.length);
    for (const move of ordered) {
      const sim = this.simulate(board, move, seat);
      const score = -this.negamax(sim, (seat + 1) % 2, depth - 1, -beta, -alpha, root);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  private simulate(board: CheckersBoard, move: Move, seat: number): CheckersBoard {
    const copy: CheckersBoard = {
      grid: board.grid.map((row) => [...row]),
      lastMove: null,
      captured: [board.captured[0], board.captured[1]],
      quietPlies: board.quietPlies,
      legal: [],
    };
    this.play(copy, move, seat);
    return copy;
  }

  // ── Views / lifecycle ─────────────────────────────────────────────────────

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as CheckersBoard;
    const safe: Record<string, unknown> = {
      grid: board.grid,
      lastMove: board.lastMove,
      captured: board.captured,
      // Only the side to move needs its legal targets; spectators/opponents
      // get an empty list (no hidden information exists, this is bandwidth).
      legal: seat === state.currentSeat ? board.legal.map((m) => ({ from: m.from, to: m.to, captures: m.captures.length })) : [],
    };
    return { ...state, board: safe };
  }

  private finish(state: GameState, winnerSeat: number): void {
    const board = state.board as unknown as CheckersBoard;
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = state.scores.map((_, i) => board.captured[i] * 10 + (i === winnerSeat ? 100 : 0));
  }

  private finishDraw(state: GameState): void {
    const board = state.board as unknown as CheckersBoard;
    state.phase = 'completed';
    state.winnerSeat = null;
    state.currentSeat = -1;
    state.scores = state.scores.map((_, i) => board.captured[i] * 10);
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1500 : difficulty === 'medium' ? 1200 : difficulty === 'hard' ? 900 : 700;
    return base + Math.floor(Math.random() * 1100);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as CheckersBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        grid: board.grid.map((row) => [...row]),
        captured: [board.captured[0], board.captured[1]],
        legal: board.legal,
      } as unknown as Record<string, unknown>,
    };
  }
}
