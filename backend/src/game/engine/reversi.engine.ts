import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface ReversiBoard extends Record<string, unknown> {
  /** 8×8 grid: -1 empty, else the owning seat. */
  grid: number[][];
  counts: [number, number];
  lastMove: { seat: number; r: number; c: number; flipped: Array<[number, number]> } | null;
  /** Legal cells for the seat to move (empty ⇒ that seat must pass). */
  legal: Array<[number, number]>;
  /** Consecutive passes; two in a row end the game. */
  passes: number;
}

const SIZE = 8;
const DIRS: Array<[number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

/** Classic positional weights (corners strong, X-squares weak). */
const WEIGHTS = [
  [120, -20, 20, 5, 5, 20, -20, 120],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [120, -20, 20, 5, 5, 20, -20, 120],
];

/**
 * Reversi (Othello) for two players. Place a disc so it brackets one or more
 * enemy discs in a straight line; everything bracketed flips. A player with no
 * legal move passes; when neither can move (or the board is full) most discs
 * wins. Bots combine positional weights, mobility and corner priority with a
 * shallow alpha-beta search whose depth scales with difficulty.
 */
@Injectable()
export class ReversiEngine extends BaseGameEngine {
  readonly slug = 'reversi';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const grid = Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(-1));
    grid[3][3] = 1;
    grid[4][4] = 1;
    grid[3][4] = 0;
    grid[4][3] = 0;
    const board: ReversiBoard = { grid, counts: [2, 2], lastMove: null, legal: [], passes: 0 };
    board.legal = this.legalCells(grid, 0);
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
        score: 2,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: [2, 2],
      version: 1,
    };
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as ReversiBoard;
    if (action.type === 'pass') {
      if (board.legal.length > 0) return { ok: false, error: 'You have a legal move — you cannot pass.' };
      return { ok: true };
    }
    if (action.type !== 'place') return { ok: false, error: 'Unknown action.' };
    const r = Number(action.payload.r);
    const c = Number(action.payload.c);
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= SIZE || c < 0 || c >= SIZE) {
      return { ok: false, error: 'Choose a square.' };
    }
    if (!board.legal.some(([lr, lc]) => lr === r && lc === c)) {
      return { ok: false, error: 'That square does not flip any discs.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as ReversiBoard;
    const opponent = (action.seat + 1) % 2;

    if (action.type === 'pass') {
      board.passes += 1;
      board.lastMove = null;
    } else {
      const r = Number(action.payload.r);
      const c = Number(action.payload.c);
      const flipped = this.flips(board.grid, r, c, action.seat);
      board.grid[r][c] = action.seat;
      for (const [fr, fc] of flipped) board.grid[fr][fc] = action.seat;
      board.lastMove = { seat: action.seat, r, c, flipped };
      board.passes = 0;
    }
    board.counts = this.count(board.grid);
    next.scores = [board.counts[0], board.counts[1]];
    next.seats[0].score = board.counts[0];
    next.seats[1].score = board.counts[1];
    next.version += 1;

    const oppLegal = this.legalCells(board.grid, opponent);
    const myLegal = this.legalCells(board.grid, action.seat);
    const full = board.counts[0] + board.counts[1] === SIZE * SIZE;
    if (full || (oppLegal.length === 0 && myLegal.length === 0) || board.passes >= 2) {
      board.legal = [];
      this.finish(next);
      return next;
    }
    board.legal = oppLegal;
    next.currentSeat = opponent;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as ReversiBoard;
    const legal = board.legal.length ? board.legal : this.legalCells(board.grid, seat);
    if (legal.length === 0) {
      return { action: { seat, type: 'pass', payload: {} }, delayMs: 600 };
    }
    const mistake = difficulty === 'easy' ? 0.4 : difficulty === 'medium' ? 0.15 : difficulty === 'hard' ? 0.04 : 0;
    let pick: [number, number];
    if (Math.random() < mistake) {
      pick = legal[Math.floor(Math.random() * legal.length)];
    } else {
      const depth = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : difficulty === 'hard' ? 3 : 4;
      pick = this.search(board.grid, seat, legal, depth);
    }
    return { action: { seat, type: 'place', payload: { r: pick[0], c: pick[1] } }, delayMs: this.think(difficulty) };
  }

  // ── Rules ─────────────────────────────────────────────────────────────────

  private flips(grid: number[][], r: number, c: number, seat: number): Array<[number, number]> {
    if (grid[r][c] !== -1) return [];
    const out: Array<[number, number]> = [];
    for (const [dr, dc] of DIRS) {
      const line: Array<[number, number]> = [];
      let nr = r + dr;
      let nc = c + dc;
      while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && grid[nr][nc] === 1 - seat) {
        line.push([nr, nc]);
        nr += dr;
        nc += dc;
      }
      if (line.length > 0 && nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && grid[nr][nc] === seat) {
        out.push(...line);
      }
    }
    return out;
  }

  private legalCells(grid: number[][], seat: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] === -1 && this.flips(grid, r, c, seat).length > 0) out.push([r, c]);
      }
    }
    return out;
  }

  private count(grid: number[][]): [number, number] {
    let a = 0;
    let b = 0;
    for (const row of grid) for (const cell of row) {
      if (cell === 0) a++;
      else if (cell === 1) b++;
    }
    return [a, b];
  }

  // ── AI ────────────────────────────────────────────────────────────────────

  private evaluate(grid: number[][], seat: number): number {
    let score = 0;
    let empties = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c];
        if (v === -1) empties++;
        else score += (v === seat ? 1 : -1) * WEIGHTS[r][c];
      }
    }
    // Late game: disc count matters more than position.
    if (empties <= 12) {
      const [a, b] = this.count(grid);
      score += (seat === 0 ? a - b : b - a) * 12;
    }
    // Mobility.
    score += (this.legalCells(grid, seat).length - this.legalCells(grid, 1 - seat).length) * 6;
    return score;
  }

  private search(grid: number[][], seat: number, legal: Array<[number, number]>, depth: number): [number, number] {
    let best = legal[0];
    let bestScore = -Infinity;
    for (const [r, c] of legal) {
      const sim = this.apply(grid, r, c, seat);
      const score = -this.negamax(sim, 1 - seat, depth - 1, -Infinity, Infinity) + Math.random() * 3;
      if (score > bestScore) {
        bestScore = score;
        best = [r, c];
      }
    }
    return best;
  }

  private negamax(grid: number[][], seat: number, depth: number, alpha: number, beta: number): number {
    const legal = this.legalCells(grid, seat);
    if (depth <= 0) return this.evaluate(grid, seat);
    if (legal.length === 0) {
      if (this.legalCells(grid, 1 - seat).length === 0) {
        const [a, b] = this.count(grid);
        const diff = seat === 0 ? a - b : b - a;
        return diff * 1000;
      }
      return -this.negamax(grid, 1 - seat, depth - 1, -beta, -alpha);
    }
    let best = -Infinity;
    for (const [r, c] of legal) {
      const sim = this.apply(grid, r, c, seat);
      const score = -this.negamax(sim, 1 - seat, depth - 1, -beta, -alpha);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  private apply(grid: number[][], r: number, c: number, seat: number): number[][] {
    const copy = grid.map((row) => [...row]);
    for (const [fr, fc] of this.flips(copy, r, c, seat)) copy[fr][fc] = seat;
    copy[r][c] = seat;
    return copy;
  }

  // ── Views / lifecycle ─────────────────────────────────────────────────────

  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as ReversiBoard;
    const safe: Record<string, unknown> = {
      grid: board.grid,
      counts: board.counts,
      lastMove: board.lastMove,
      legal: board.legal,
    };
    return { ...state, board: safe };
  }

  private finish(state: GameState): void {
    const board = state.board as unknown as ReversiBoard;
    state.phase = 'completed';
    state.currentSeat = -1;
    state.scores = [board.counts[0], board.counts[1]];
    state.winnerSeat = board.counts[0] === board.counts[1] ? null : board.counts[0] > board.counts[1] ? 0 : 1;
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1300 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 800 : 600;
    return base + Math.floor(Math.random() * 900);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as ReversiBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        grid: board.grid.map((row) => [...row]),
        counts: [board.counts[0], board.counts[1]],
      } as unknown as Record<string, unknown>,
    };
  }
}
