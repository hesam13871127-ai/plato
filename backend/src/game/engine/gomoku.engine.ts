import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

type Cell = 0 | 1 | 2; // 0 empty, 1 black, 2 white

interface GomokuBoard extends Record<string, unknown> {
  /** 15×15 board, row-major: grid[y * 15 + x]. */
  grid: Cell[];
  lastMove: { seat: number; x: number; y: number } | null;
  /** The five (or more) winning cells, for the victory ribbon. */
  winningLine: number[] | null;
  log: string[];
}

const N = 15;
const AXES: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < N && y >= 0 && y < N;
}

/** The consecutive run through (x, y) on an axis, both ways. */
function runCells(grid: Cell[], x: number, y: number, axis: [number, number]): number[] {
  const disc = grid[y * N + x];
  if (disc === 0) return [];
  const cells = [y * N + x];
  for (const sign of [1, -1] as const) {
    let cx = x + axis[0] * sign;
    let cy = y + axis[1] * sign;
    while (inBounds(cx, cy) && grid[cy * N + cx] === disc) {
      cells.push(cy * N + cx);
      cx += axis[0] * sign;
      cy += axis[1] * sign;
    }
  }
  return cells;
}

/** All cells of the first five-in-a-row through the stone at (x, y), if any. */
export function winningLineAt(grid: Cell[], x: number, y: number): number[] | null {
  for (const axis of AXES) {
    const cells = runCells(grid, x, y, axis);
    if (cells.length >= 5) return cells.sort((a, b) => a - b);
  }
  return null;
}

/**
 * Gomoku (five in a row) for two players, wave-6 build.
 *
 * The oldest connection game there is: black and white alternate placing
 * stones on a fifteen-by-fifteen grid, and the first to line up five of
 * their own — across, down or diagonally — wins on the spot. A full board
 * with no line is a draw. Perfect information, no redaction.
 *
 * Bots scan the stones' neighbourhood: they take an immediate win, block an
 * immediate loss, then grow their own open lines and choke the opponent's —
 * with per-difficulty noise, from careless to cut-throat.
 */
@Injectable()
export class GomokuEngine extends BaseGameEngine {
  readonly slug = 'gomoku';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: GomokuBoard = {
      grid: new Array<Cell>(N * N).fill(0),
      lastMove: null,
      winningLine: null,
      log: ['Black opens — first to line up five wins.'],
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
    if (action.type !== 'place') return { ok: false, error: 'Place a stone.' };
    const x = Number(action.payload.x);
    const y = Number(action.payload.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(x, y)) {
      return { ok: false, error: 'Aim inside the board.' };
    }
    const board = state.board as unknown as GomokuBoard;
    if (board.grid[y * N + x] !== 0) {
      return { ok: false, error: 'That point is taken.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as GomokuBoard;
    const seat = action.seat;
    const x = Number(action.payload.x);
    const y = Number(action.payload.y);
    const disc = (seat + 1) as Cell;

    board.grid[y * N + x] = disc;
    board.lastMove = { seat, x, y };
    next.version += 1;

    const line = winningLineAt(board.grid, x, y);
    if (line) {
      board.winningLine = line;
      next.phase = 'completed';
      next.winnerSeat = seat;
      next.currentSeat = -1;
      next.scores = seat === 0 ? [1, 0] : [0, 1];
      next.seats = next.seats.map((s, i) => ({ ...s, score: next.scores[i] }));
      board.log.push(`Seat ${seat + 1} lines up five — game!`);
      return next;
    }

    if (board.grid.every((c) => c !== 0)) {
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
    const board = state.board as unknown as GomokuBoard;
    const disc = (seat + 1) as Cell;
    const foe = (2 - seat) as Cell;
    const grid = board.grid;

    // Opening: the star point.
    if (grid.every((c) => c === 0)) {
      return { action: { seat, type: 'place', payload: { x: 7, y: 7 } }, delayMs: this.think(difficulty) };
    }

    // Candidate cells: empty points within two of any stone (or the centre).
    const candidates = new Set<number>();
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (grid[y * N + x] === 0) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (inBounds(x + dx, y + dy) && grid[(y + dy) * N + x + dx] === 0) {
              candidates.add((y + dy) * N + x + dx);
            }
          }
        }
      }
    }
    if (candidates.size === 0) candidates.add(Math.floor(N * N / 2));

    const noise = difficulty === 'easy' ? 40 : difficulty === 'medium' ? 6 : difficulty === 'hard' ? 1.5 : 0.3;
    let best = -1;
    let bestScore = -Infinity;
    for (const idx of candidates) {
      const x = idx % N;
      const y = Math.floor(idx / N);
      let score = Math.random() * noise;

      // Take a win, block a loss.
      grid[idx] = disc;
      const mineWins = winningLineAt(grid, x, y) !== null;
      grid[idx] = foe;
      const foeWins = winningLineAt(grid, x, y) !== null;
      grid[idx] = 0;
      if (mineWins) score += 100000;
      else if (foeWins) score += 90000;

      // Grow my lines, choke theirs.
      grid[idx] = disc;
      score += this.lineStrength(grid, x, y, disc) * 1.1;
      grid[idx] = foe;
      score += this.lineStrength(grid, x, y, foe);
      grid[idx] = 0;

      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
    }
    return {
      action: { seat, type: 'place', payload: { x: best % N, y: Math.floor(best / N) } },
      delayMs: this.think(difficulty, 200),
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Open-ended run lengths through (x, y) for `disc`, weighted. */
  private lineStrength(grid: Cell[], x: number, y: number, disc: Cell): number {
    let total = 0;
    for (const axis of AXES) {
      let count = 1;
      let openEnds = 0;
      for (const sign of [1, -1] as const) {
        let cx = x + axis[0] * sign;
        let cy = y + axis[1] * sign;
        while (inBounds(cx, cy) && grid[cy * N + cx] === disc) {
          count++;
          cx += axis[0] * sign;
          cy += axis[1] * sign;
        }
        if (inBounds(cx, cy) && grid[cy * N + cx] === 0) openEnds++;
      }
      if (count >= 4) total += count * count * (openEnds + 1);
      else total += count * (openEnds + 0.5);
    }
    return total;
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1200 : difficulty === 'medium' ? 950 : difficulty === 'hard' ? 750 : 600;
    return base + extra + Math.floor(Math.random() * 600);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as GomokuBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        grid: [...board.grid] as Cell[],
        winningLine: board.winningLine ? [...board.winningLine] : null,
        log: [...board.log],
        lastMove: board.lastMove ? { ...board.lastMove } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
