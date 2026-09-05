import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

type Cell = number; // -1 empty, else seat index
type Board = Cell[][]; // board[row][col], row 0 = bottom

interface C4Board extends Record<string, unknown> {
  grid: Board; // rows bottom→top
  cols: number;
  rows: number;
  lastMove?: { seat: number; col: number; row: number } | null;
}

const ROWS = 6;
const COLS = 7;

/**
 * Classic Connect Four (4 in a Row) for two players. Turn-based. A move drops a
 * piece into a column; four connected pieces (horizontal/vertical/diagonal) win.
 * Bots use a depth-limited heuristic (centre control, immediate wins/blocks) so
 * their skill scales with difficulty and they make occasional natural mistakes.
 */
@Injectable()
export class Connect4Engine extends BaseGameEngine {
  readonly slug = 'connect4';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const grid: Board = Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(-1));
    const board: C4Board = { grid, cols: COLS, rows: ROWS, lastMove: null };
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
    if (action.type !== 'drop') return { ok: false, error: 'Unknown action.' };
    const board = state.board as unknown as C4Board;
    const col = Number((action.payload as { col?: unknown }).col);
    if (!Number.isInteger(col) || col < 0 || col >= board.cols) {
      return { ok: false, error: 'Choose a valid column.' };
    }
    if (board.grid[board.rows - 1][col] !== -1) {
      return { ok: false, error: 'That column is full.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as C4Board;
    const col = Number((action.payload as { col: number }).col);
    const row = this.dropRow(board, col);
    board.grid[row][col] = action.seat;
    board.lastMove = { seat: action.seat, col, row };
    next.version += 1;

    if (this.hasWin(board, action.seat)) {
      this.finish(next, action.seat);
      return next;
    }
    if (this.isFull(board)) {
      this.finishDraw(next);
      return next;
    }
    next.currentSeat = (action.seat + 1) % next.seats.length;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as C4Board;
    const opponent = (seat + 1) % 2;
    const mistakeChance = difficulty === 'easy' ? 0.4 : difficulty === 'medium' ? 0.2 : difficulty === 'hard' ? 0.08 : 0.02;

    let col: number;
    if (Math.random() < mistakeChance) {
      col = this.randomLegal(board);
    } else {
      col = this.bestColumn(board, seat, opponent, difficulty);
    }
    return { action: { seat, type: 'drop', payload: { col } }, delayMs: this.think(difficulty) };
  }

  // ── rules ────────────────────────────────────────────────────────────────

  private dropRow(board: C4Board, col: number): number {
    for (let r = 0; r < board.rows; r++) {
      if (board.grid[r][col] === -1) return r;
    }
    return -1;
  }

  private legalColumns(board: C4Board): number[] {
    const cols: number[] = [];
    for (let c = 0; c < board.cols; c++) if (board.grid[board.rows - 1][c] === -1) cols.push(c);
    return cols;
  }

  private randomLegal(board: C4Board): number {
    const legal = this.legalColumns(board);
    return legal[Math.floor(Math.random() * legal.length)];
  }

  private isFull(board: C4Board): boolean {
    return this.legalColumns(board).length === 0;
  }

  private hasWin(board: C4Board, seat: number): boolean {
    const { grid, rows, cols } = board;
    const dirs = [
      [0, 1], // horizontal
      [1, 0], // vertical
      [1, 1], // diagonal up
      [1, -1], // diagonal down
    ];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== seat) continue;
        for (const [dr, dc] of dirs) {
          let count = 1;
          for (let k = 1; k < 4; k++) {
            const nr = r + dr * k;
            const nc = c + dc * k;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || grid[nr][nc] !== seat) break;
            count++;
          }
          if (count >= 4) return true;
        }
      }
    }
    return false;
  }

  /** Scores a column for the bot: win > block > centre/tactical heuristic. */
  private bestColumn(board: C4Board, me: number, opp: number, difficulty: SeatInfo['botDifficulty']): number {
    const legal = this.legalColumns(board);
    // 1. Immediate winning move.
    for (const c of legal) {
      const r = this.dropRow(board, c);
      board.grid[r][c] = me;
      const win = this.hasWin(board, me);
      board.grid[r][c] = -1;
      if (win) return c;
    }
    // 2. Block opponent's immediate win.
    for (const c of legal) {
      const r = this.dropRow(board, c);
      board.grid[r][c] = opp;
      const loss = this.hasWin(board, opp);
      board.grid[r][c] = -1;
      if (loss) return c;
    }
    if (difficulty === 'easy') {
      // Prefer centre-ish but with little lookahead.
      return this.heuristicPick(board, legal, me, 1);
    }
    if (difficulty === 'medium') {
      return this.heuristicPick(board, legal, me, 2);
    }
    // hard/expert: one-ply lookahead + heuristic, avoid setting up opponent.
    let best = legal[0];
    let bestScore = -Infinity;
    for (const c of legal) {
      const r = this.dropRow(board, c);
      board.grid[r][c] = me;
      let score = this.positionScore(board, me);
      // Penalise moves that let the opponent win next.
      for (const oc of this.legalColumns(board)) {
        const or2 = this.dropRow(board, oc);
        board.grid[or2][oc] = opp;
        if (this.hasWin(board, opp)) score -= 10000;
        board.grid[or2][oc] = -1;
      }
      board.grid[r][c] = -1;
      score += (board.cols - Math.abs(c - (board.cols - 1) / 2)) * 2;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  private heuristicPick(board: C4Board, legal: number[], me: number, _plies: number): number {
    let best = legal[0];
    let bestScore = -Infinity;
    for (const c of legal) {
      const r = this.dropRow(board, c);
      board.grid[r][c] = me;
      const score = this.positionScore(board, me) + (board.cols - Math.abs(c - 3)) * 2;
      board.grid[r][c] = -1;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  /** Counts connected threats (2s and 3s) for a seat as a positional score. */
  private positionScore(board: C4Board, seat: number): number {
    const { grid, rows, cols } = board;
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    let score = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== seat) continue;
        for (const [dr, dc] of dirs) {
          let count = 1;
          for (let k = 1; k < 4; k++) {
            const nr = r + dr * k;
            const nc = c + dc * k;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break;
            if (grid[nr][nc] === seat) count++;
            else break;
          }
          if (count >= 3) score += 50;
          else if (count === 2) score += 5;
        }
      }
    }
    return score;
  }

  private finish(state: GameState, winnerSeat: number): void {
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = state.scores.map((_, i) => (i === winnerSeat ? 1 : 0));
  }

  private finishDraw(state: GameState): void {
    state.phase = 'completed';
    state.winnerSeat = null;
    state.currentSeat = -1;
    state.scores = state.scores.map(() => 0);
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1800 : difficulty === 'medium' ? 1300 : difficulty === 'hard' ? 900 : 600;
    return base + Math.floor(Math.random() * 1200);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as C4Board;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        grid: board.grid.map((row) => [...row]),
        lastMove: board.lastMove ? { ...board.lastMove } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
