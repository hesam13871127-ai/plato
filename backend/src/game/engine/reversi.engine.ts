import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

type Cell = 0 | 1 | 2; // 0 empty, 1 black, 2 white

interface ReversiBoard extends Record<string, unknown> {
  /** 8×8 board, row-major: board[y * 8 + x]. */
  grid: Cell[];
  /** Consecutive seats that passed — two in a row ends the game. */
  passes: number;
  lastMove: { seat: number; x: number; y: number; flipped: number } | null;
  log: string[];
}

const N = 8;
const DIRS: Array<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < N && y >= 0 && y < N;
}

/** The discs flipped by placing `disc` at (x, y) — empty when illegal. */
export function flipsFor(grid: Cell[], x: number, y: number, disc: Cell): Array<[number, number]> {
  if (!inBounds(x, y) || grid[y * N + x] !== 0) return [];
  const out: Array<[number, number]> = [];
  for (const [dx, dy] of DIRS) {
    const line: Array<[number, number]> = [];
    let cx = x + dx;
    let cy = y + dy;
    while (inBounds(cx, cy) && grid[cy * N + cx] === (3 - disc) as Cell) {
      line.push([cx, cy]);
      cx += dx;
      cy += dy;
    }
    if (line.length > 0 && inBounds(cx, cy) && grid[cy * N + cx] === disc) {
      out.push(...line);
    }
  }
  return out;
}

/** Every legal placement for `disc`. */
export function legalMoves(grid: Cell[], disc: Cell): Array<[number, number]> {
  const moves: Array<[number, number]> = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (grid[y * N + x] === 0 && flipsFor(grid, x, y, disc).length > 0) {
        moves.push([x, y]);
      }
    }
  }
  return moves;
}

function countDiscs(grid: Cell[]): [number, number] {
  let black = 0;
  let white = 0;
  for (const c of grid) {
    if (c === 1) black++;
    else if (c === 2) white++;
  }
  return [black, white];
}

/**
 * Reversi (Othello) for two players, wave-6 build.
 *
 * The classic sandwich: place a disc so a straight line of enemy discs is
 * caught between yours, and the whole line flips. No legal placement and
 * your turn passes automatically; two consecutive passes (or a full board)
 * end the game and the majority colour wins. Perfect information, no
 * redaction.
 *
 * Bots weigh every legal move by flips plus corner and edge bonuses with
 * per-difficulty noise — easy bots gift away corners.
 */
@Injectable()
export class ReversiEngine extends BaseGameEngine {
  readonly slug = 'reversi';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const grid: Cell[] = new Array(N * N).fill(0);
    grid[3 * N + 3] = 2;
    grid[3 * N + 4] = 1;
    grid[4 * N + 3] = 1;
    grid[4 * N + 4] = 2;
    const board: ReversiBoard = {
      grid,
      passes: 0,
      lastMove: null,
      log: ['Black to move — sandwich white discs to flip them.'],
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
        score: 2,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: [2, 2],
      version: 1,
    };
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'The game is already over.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    if (action.type !== 'place') return { ok: false, error: 'Place a disc.' };
    const x = Number(action.payload.x);
    const y = Number(action.payload.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(x, y)) {
      return { ok: false, error: 'Aim inside the board.' };
    }
    const board = state.board as unknown as ReversiBoard;
    const disc = (state.currentSeat + 1) as Cell;
    if (flipsFor(board.grid, x, y, disc).length === 0) {
      return { ok: false, error: 'That placement flips nothing.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as ReversiBoard;
    const seat = action.seat;
    const x = Number(action.payload.x);
    const y = Number(action.payload.y);
    const disc = (seat + 1) as Cell;

    const flips = flipsFor(board.grid, x, y, disc);
    board.grid[y * N + x] = disc;
    for (const [fx, fy] of flips) {
      board.grid[fy * N + fx] = disc;
    }
    board.passes = 0;
    board.lastMove = { seat, x, y, flipped: flips.length };
    next.version += 1;
    board.log.push(`Seat ${seat + 1} flips ${flips.length} disc${flips.length === 1 ? '' : 's'} at ${String.fromCharCode(65 + x)}${y + 1}.`);

    return this.advanceTurn(next, board);
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as ReversiBoard;
    const disc = (seat + 1) as Cell;
    const moves = legalMoves(board.grid, disc);
    if (moves.length === 0) return { action: { seat, type: 'place', payload: {} }, delayMs: this.think(difficulty) };

    const noise = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 2.5 : difficulty === 'hard' ? 0.8 : 0.2;
    let best = moves[0];
    let bestScore = -Infinity;
    for (const [x, y] of moves) {
      let score = flipsFor(board.grid, x, y, disc).length + Math.random() * noise;
      if ((x === 0 || x === N - 1) && (y === 0 || y === N - 1)) score += 14; // corners
      else if (x === 0 || x === N - 1 || y === 0 || y === N - 1) score += 4; // edges
      // Squares that hand the enemy a corner are poison.
      const nextGrid = [...board.grid];
      nextGrid[y * N + x] = disc;
      const enemyReply = legalMoves(nextGrid, (3 - disc) as Cell);
      if (enemyReply.some(([ex, ey]) => (ex === 0 || ex === N - 1) && (ey === 0 || ey === N - 1))) {
        score -= 10;
      }
      if (score > bestScore) {
        bestScore = score;
        best = [x, y];
      }
    }
    return {
      action: { seat, type: 'place', payload: { x: best[0], y: best[1] } },
      delayMs: this.think(difficulty, 150),
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private advanceTurn(next: GameState, board: ReversiBoard): GameState {
    const [black, white] = countDiscs(board.grid);
    next.scores = [black, white];
    next.seats = next.seats.map((s, i) => ({ ...s, score: next.scores[i] }));

    const boardFull = board.grid.every((c) => c !== 0);
    if (boardFull || board.passes >= 2) {
      this.finish(next, board);
      return next;
    }

    // Hand over to the opponent; skip them if they have no legal move.
    const opponent = 1 - next.currentSeat;
    const opponentCanMove = legalMoves(board.grid, (opponent + 1) as Cell).length > 0;
    if (opponentCanMove) {
      next.currentSeat = opponent;
      next.turn += 1;
    } else {
      board.passes += 1;
      board.log.push(`Seat ${opponent + 1} has no legal move — passes.`);
      const iCanMove = legalMoves(board.grid, (next.currentSeat + 1) as Cell).length > 0;
      if (!iCanMove) {
        board.passes += 1;
        this.finish(next, board);
        return next;
      }
      next.turn += 1;
    }
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  private finish(state: GameState, board: ReversiBoard): void {
    const [black, white] = countDiscs(board.grid);
    state.phase = 'completed';
    state.currentSeat = -1;
    if (black > white) state.winnerSeat = 0;
    else if (white > black) state.winnerSeat = 1;
    else state.winnerSeat = null; // draw
    board.log.push(`Final count — black ${black}, white ${white}.`);
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1300 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 800 : 650;
    return base + extra + Math.floor(Math.random() * 600);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as ReversiBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        grid: [...board.grid] as Cell[],
        log: [...board.log],
        lastMove: board.lastMove ? { ...board.lastMove } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
