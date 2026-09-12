import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

type Cell = 0 | 1 | 2; // 0 empty, 1 = seat 0 (X), 2 = seat 1 (O)

interface TicTacToeBoard extends Record<string, unknown> {
  /** 3×3 board, row-major: cells[y * 3 + x], 9 cells. */
  cells: Cell[];
  lastMove: { seat: number; idx: number } | null;
  /** The three winning cells when someone wins (row-major indices). */
  winLine: number[] | null;
  log: string[];
}

const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

/** Returns the winning line for the disc that just played, or null. */
export function winLineAt(cells: Cell[], lastIdx: number): number[] | null {
  for (const line of LINES) {
    if (line.includes(lastIdx) && cells[line[0]] !== 0 && cells[line[0]] === cells[line[1]] && cells[line[1]] === cells[line[2]]) {
      return [...line];
    }
  }
  return null;
}

function cloneCells(cells: Cell[]): Cell[] {
  return [...cells];
}

/** Minimax score from `disc`'s perspective on an unmarked board copy. */
function minimax(cells: Cell[], disc: Cell, toMove: Cell, depth: number): number {
  // Terminal check.
  for (const [a, b, c] of LINES) {
    if (cells[a] !== 0 && cells[a] === cells[b] && cells[b] === cells[c]) {
      const winner = cells[a];
      if (winner === disc) return 10 - depth;
      return depth - 10;
    }
  }
  if (cells.every((c) => c !== 0)) return 0;

  const foe = (3 - toMove) as Cell;
  let best = toMove === disc ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (cells[i] !== 0) continue;
    cells[i] = toMove;
    const score = minimax(cells, disc, foe, depth + 1);
    cells[i] = 0;
    if (toMove === disc ? score > best : score < best) best = score;
  }
  return best;
}

/**
 * Tic-Tac-Toe (Noughts & Crosses) for two players, wave-7 build.
 *
 * The smallest classic: X and O alternate claiming one of nine squares and
 * the first to claim a full row, column or diagonal wins; a full board with
 * no line is a draw. Perfect information, no redaction.
 *
 * Bots scale with difficulty: easy picks random open squares, medium takes
 * wins and blocks losses, hard/expert play perfect minimax and never lose.
 */
@Injectable()
export class TicTacToeEngine extends BaseGameEngine {
  readonly slug = 'tic_tac_toe';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: TicTacToeBoard = {
      cells: new Array<Cell>(9).fill(0),
      lastMove: null,
      winLine: null,
      log: ['X opens — first to claim a line of three wins.'],
    };
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
    if (action.type !== 'place') return { ok: false, error: 'Claim a square.' };
    const idx = Number(action.payload.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx > 8) {
      return { ok: false, error: 'Pick one of the nine squares.' };
    }
    const board = state.board as unknown as TicTacToeBoard;
    if (board.cells[idx] !== 0) {
      return { ok: false, error: 'That square is taken.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as TicTacToeBoard;
    const seat = action.seat;
    const idx = Number(action.payload.idx);
    const disc = (seat + 1) as Cell;

    board.cells[idx] = disc;
    board.lastMove = { seat, idx };
    next.version += 1;

    const line = winLineAt(board.cells, idx);
    if (line) {
      board.winLine = line;
      next.phase = 'completed';
      next.winnerSeat = seat;
      next.currentSeat = -1;
      next.scores = seat === 0 ? [1, 0] : [0, 1];
      next.seats = next.seats.map((s, i) => ({ ...s, score: next.scores[i] }));
      board.log.push(`Seat ${seat + 1} claims a line of three — game!`);
      return next;
    }

    if (board.cells.every((c) => c !== 0)) {
      next.phase = 'completed';
      next.winnerSeat = null;
      next.currentSeat = -1;
      board.log.push('The board is full — a draw.');
      return next;
    }

    next.currentSeat = 1 - seat;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as TicTacToeBoard;
    const disc = (seat + 1) as Cell;
    const foe = (3 - disc) as Cell;
    const open = board.cells.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0);

    // Opening: centre if free, else a corner, else anywhere.
    if (open.length === 9) {
      const idx = [4, 0, 2, 6, 8][Math.floor(Math.random() * 5)];
      return { action: { seat, type: 'place', payload: { idx } }, delayMs: this.think(difficulty) };
    }

    // Take an immediate win, block an immediate loss (medium and up).
    if (difficulty !== 'easy') {
      for (const i of open) {
        const probe = cloneCells(board.cells);
        probe[i] = disc;
        if (winLineAt(probe, i)) {
          return { action: { seat, type: 'place', payload: { idx: i } }, delayMs: this.think(difficulty) };
        }
      }
      for (const i of open) {
        const probe = cloneCells(board.cells);
        probe[i] = foe;
        if (winLineAt(probe, i)) {
          return { action: { seat, type: 'place', payload: { idx: i } }, delayMs: this.think(difficulty) };
        }
      }
    }

    // Perfect play (hard/expert): maximise the minimax outcome.
    if (difficulty === 'hard' || difficulty === 'expert') {
      let bestIdx = open[0];
      let bestScore = -Infinity;
      for (const i of open) {
        const probe = cloneCells(board.cells);
        probe[i] = disc;
        const score = minimax(probe, disc, foe, 0) + Math.random() * 0.01; // tie-break randomly
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      return { action: { seat, type: 'place', payload: { idx: bestIdx } }, delayMs: this.think(difficulty, 150) };
    }

    // Medium: centre, then corners, then edges. Easy: random.
    if (difficulty === 'medium') {
      const preferred = [4, 0, 2, 6, 8, 1, 3, 5, 7].filter((i) => open.includes(i));
      const idx = preferred[0];
      return { action: { seat, type: 'place', payload: { idx } }, delayMs: this.think(difficulty) };
    }
    const idx = open[Math.floor(Math.random() * open.length)];
    return { action: { seat, type: 'place', payload: { idx } }, delayMs: this.think(difficulty) };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1000 : difficulty === 'medium' ? 850 : difficulty === 'hard' ? 700 : 600;
    return base + extra + Math.floor(Math.random() * 500);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as TicTacToeBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        cells: [...board.cells] as Cell[],
        winLine: board.winLine ? [...board.winLine] : null,
        lastMove: board.lastMove ? { ...board.lastMove } : null,
        log: [...board.log],
      } as unknown as Record<string, unknown>,
    };
  }
}
