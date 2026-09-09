import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/** Cell: -1 empty, otherwise the seat index that owns the disc. */
type Cell = number;
/** grid[row][col] with row 0 at the bottom (gravity floor). */
type Grid = Cell[][];

interface Connect4Board extends Record<string, unknown> {
  grid: Grid;
  rows: number;
  cols: number;
  lastMove: { seat: number; col: number; row: number } | null;
  /** The four winning cells (row/col pairs) when the game is won. */
  winLine: Array<[number, number]> | null;
}

const ROWS = 6;
const COLS = 7;
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/**
 * Connect Four (4 in a Row) for two players, wave-1 rebuild.
 *
 * Drop a disc into a column; it falls to the lowest open slot. Four connected
 * discs — horizontal, vertical or diagonal — win; a full board with no line is
 * a draw. The engine exposes `winLine` so the 3D board can light the winning
 * run. No hidden information.
 *
 * Bots scale with difficulty: easy plays semi-random, medium takes immediate
 * wins and blocks, hard/expert additionally avoid handing over a winning drop
 * and prefer central columns.
 */
@Injectable()
export class Connect4Engine extends BaseGameEngine {
  readonly slug = 'connect4';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const grid: Grid = Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(-1));
    const board: Connect4Board = { grid, rows: ROWS, cols: COLS, lastMove: null, winLine: null };
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
    if (action.type !== 'drop') return { ok: false, error: 'Unknown action.' };
    const board = state.board as unknown as Connect4Board;
    const col = Number(action.payload.col);
    if (!Number.isInteger(col) || col < 0 || col >= board.cols) {
      return { ok: false, error: 'Choose a valid column.' };
    }
    if (this.dropRow(board, col) < 0) return { ok: false, error: 'That column is full.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as Connect4Board;
    const col = Number(action.payload.col);
    const row = this.dropRow(board, col);

    board.grid[row][col] = action.seat;
    board.lastMove = { seat: action.seat, col, row };
    next.version += 1;

    const line = this.findWinLine(board, action.seat);
    if (line) {
      board.winLine = line;
      this.finish(next, action.seat, true);
      return next;
    }
    if (this.openColumns(board).length === 0) {
      this.finish(next, null, false);
      return next;
    }
    next.currentSeat = (action.seat + 1) % next.seats.length;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as Connect4Board;
    const opponent = (seat + 1) % 2;
    const open = this.openColumns(board);
    const mistakeChance =
      difficulty === 'easy' ? 0.45 : difficulty === 'medium' ? 0.18 : difficulty === 'hard' ? 0.06 : 0.0;

    if (open.length === 0) {
      // Defensive: the session service never asks a finished engine, but be safe.
      return { action: { seat, type: 'drop', payload: { col: 0 } }, delayMs: 500 };
    }

    let col: number;
    if (Math.random() < mistakeChance) {
      col = open[Math.floor(Math.random() * open.length)];
    } else {
      col = this.bestColumn(board, seat, opponent, difficulty);
    }
    return { action: { seat, type: 'drop', payload: { col } }, delayMs: this.think(difficulty) };
  }

  // ── rules helpers ────────────────────────────────────────────────────────

  private dropRow(board: Connect4Board, col: number): number {
    for (let r = 0; r < board.rows; r++) {
      if (board.grid[r][col] === -1) return r;
    }
    return -1;
  }

  private openColumns(board: Connect4Board): number[] {
    const open: number[] = [];
    for (let c = 0; c < board.cols; c++) {
      if (board.grid[board.rows - 1][c] === -1) open.push(c);
    }
    return open;
  }

  /** The exact four winning cells for `seat`, or null. */
  private findWinLine(board: Connect4Board, seat: number): Array<[number, number]> | null {
    const { grid, rows, cols } = board;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== seat) continue;
        for (const [dr, dc] of DIRS) {
          const line: Array<[number, number]> = [[r, c]];
          for (let k = 1; k < 4; k++) {
            const nr = r + dr * k;
            const nc = c + dc * k;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || grid[nr][nc] !== seat) break;
            line.push([nr, nc]);
          }
          if (line.length === 4) return line;
        }
      }
    }
    return null;
  }

  /** Bot evaluation: immediate win → block → avoid gifts → centre control. */
  private bestColumn(
    board: Connect4Board,
    me: number,
    opp: number,
    difficulty: SeatInfo['botDifficulty'],
  ): number {
    const open = this.openColumns(board);

    // 1. Win now.
    for (const c of open) {
      const r = this.dropRow(board, c);
      board.grid[r][c] = me;
      const win = this.findWinLine(board, me);
      board.grid[r][c] = -1;
      if (win) return c;
    }

    // 2. Block the opponent's immediate win.
    for (const c of open) {
      const r = this.dropRow(board, c);
      board.grid[r][c] = opp;
      const loss = this.findWinLine(board, opp);
      board.grid[r][c] = -1;
      if (loss) return c;
    }

    if (difficulty === 'easy') {
      // Barely-lookahead: random with a soft centre bias.
      return this.weightedCentre(open);
    }

    // 3+ Score each drop: never hand the opponent a winning reply, prefer
    // building lines and playing central columns.
    let best = open[0];
    let bestScore = -Infinity;
    for (const c of open) {
      const r = this.dropRow(board, c);
      board.grid[r][c] = me;
      let score = this.linePotential(board, me) * 10 - this.linePotential(board, opp) * 6;
      const stillOpen = this.openColumns(board);
      for (const oc of stillOpen) {
        const or2 = this.dropRow(board, oc);
        board.grid[or2][oc] = opp;
        if (this.findWinLine(board, opp)) score -= 5000;
        board.grid[or2][oc] = -1;
      }
      board.grid[r][c] = -1;
      score += (board.cols - Math.abs(c - (board.cols - 1) / 2)) * 3;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  private weightedCentre(open: number[]): number {
    const centre = open.map((c) => ({ c, w: 7 - Math.abs(c - 3) + 1 }));
    const total = centre.reduce((sum, x) => sum + x.w, 0);
    let roll = Math.random() * total;
    for (const x of centre) {
      roll -= x.w;
      if (roll <= 0) return x.c;
    }
    return open[0];
  }

  /** Counts open 2/3-in-a-row building blocks for a seat. */
  private linePotential(board: Connect4Board, seat: number): number {
    const { grid, rows, cols } = board;
    let score = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (const [dr, dc] of DIRS) {
          let mine = 0;
          let free = 0;
          let ok = true;
          for (let k = 0; k < 4; k++) {
            const nr = r + dr * k;
            const nc = c + dc * k;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
              ok = false;
              break;
            }
            const cell = grid[nr][nc];
            if (cell === seat) mine++;
            else if (cell === -1) free++;
            else {
              ok = false;
              break;
            }
          }
          if (ok && mine > 0 && free + mine === 4) {
            score += mine === 3 ? 6 : mine === 2 ? 2 : 1;
          }
        }
      }
    }
    return score;
  }

  private finish(state: GameState, winnerSeat: number | null, won: boolean): void {
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = state.scores.map((_, i) => (won && i === winnerSeat ? 1 : 0));
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1600 : difficulty === 'medium' ? 1200 : difficulty === 'hard' ? 850 : 600;
    return base + Math.floor(Math.random() * 1000);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as Connect4Board;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        grid: board.grid.map((row) => [...row]),
        rows: board.rows,
        cols: board.cols,
        lastMove: board.lastMove ? { ...board.lastMove } : null,
        winLine: board.winLine ? board.winLine.map(([r, c]) => [r, c] as [number, number]) : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
