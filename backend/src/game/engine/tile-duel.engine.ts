import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

export type Dir = 'left' | 'right' | 'up' | 'down';
const DIRS: Dir[] = ['left', 'right', 'up', 'down'];
const N = 4;
const TARGET = 2048;

/** One 4×4 grid, row-major: grid[y * 4 + x], 0 = empty. */
type Grid = number[];

interface TileDuelBoard extends Record<string, unknown> {
  /** One grid per seat (index = seat). */
  grids: Grid[];
  /** Last move per seat, for the board's "last merge" glow. */
  lastMoves: Array<{ dir: Dir; gained: number } | null>;
  /** Consecutive passes (both grids stuck) — two in a row ends the game. */
  passStreak: number;
  log: string[];
}

/** Slide+merge one row to the left. Returns the new row and points gained. */
export function slideRowLeft(row: number[]): { row: number[]; gained: number } {
  const vals = row.filter((v) => v !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < vals.length; i++) {
    if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
      out.push(vals[i] * 2);
      gained += vals[i] * 2;
      i++;
    } else {
      out.push(vals[i]);
    }
  }
  while (out.length < N) out.push(0);
  return { row: out, gained };
}

/** Apply a direction to a grid; null when nothing would move. */
export function applyDir(grid: Grid, dir: Dir): { grid: Grid; gained: number } | null {
  const lines: number[][] = [];
  for (let i = 0; i < N; i++) {
    if (dir === 'left') lines.push(grid.slice(i * N, i * N + N));
    else if (dir === 'right') lines.push(grid.slice(i * N, i * N + N).reverse());
    else if (dir === 'up') lines.push([grid[i], grid[N + i], grid[2 * N + i], grid[3 * N + i]]);
    else lines.push([grid[3 * N + i], grid[2 * N + i], grid[N + i], grid[i]]);
  }
  const moved: number[][] = lines.map((l) => slideRowLeft(l).row);
  const changed = moved.some((m, i) => m.some((v, j) => v !== lines[i][j]));
  if (!changed) return null;

  const next = new Array<number>(N * N).fill(0);
  moved.forEach((m, i) => {
    for (let j = 0; j < N; j++) {
      if (dir === 'left') next[i * N + j] = m[j];
      else if (dir === 'right') next[i * N + (N - 1 - j)] = m[j];
      else if (dir === 'up') next[j * N + i] = m[j];
      else next[(N - 1 - j) * N + i] = m[j];
    }
  });
  const before = grid.reduce((a, b) => a + b, 0);
  return { grid: next, gained: next.reduce((a, b) => a + b, 0) - before };
}

/** Directions that would actually move the grid. */
export function legalDirs(grid: Grid): Dir[] {
  return DIRS.filter((d) => applyDir(grid, d) !== null);
}

function gridScore(grid: Grid): number {
  return grid.reduce((a, b) => a + b, 0);
}

function spawn(grid: Grid, rng: () => number): void {
  const empty = grid.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  if (empty.length === 0) return;
  const idx = empty[Math.floor(rng() * empty.length)];
  grid[idx] = rng() < 0.9 ? 2 : 4;
}

/**
 * 2048 Duel, wave-7 build.
 *
 * Two players alternate on their own four-by-four boards: each turn you slide
 * one row or column, tiles of equal value merge, and a new tile drops in.
 * The first to forge the 2048 tile wins on the spot; a player who can no
 * longer move passes, and when both are stuck the higher tile total wins.
 * Each grid is fully visible — no redaction.
 *
 * Bots play greedy line-evaluation: easy slides at random, medium and up
 * take the slide that leaves the highest total and largest tile, expert
 * also keeps corners clear of small tiles.
 */
@Injectable()
export class TileDuelEngine extends BaseGameEngine {
  readonly slug = 'tile_duel';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const grids: Grid[] = config.seats.map(() => {
      const g = new Array<number>(N * N).fill(0);
      spawn(g, Math.random);
      spawn(g, Math.random);
      return g;
    });
    const board: TileDuelBoard = {
      grids,
      lastMoves: config.seats.map(() => null),
      passStreak: 0,
      log: ['Each player owns a board — first to forge the 2048 tile wins.'],
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
      scores: grids.map(gridScore),
      version: 1,
    };
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'The game is already over.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as TileDuelBoard;
    const grid = board.grids[action.seat];

    if (action.type === 'pass') {
      if (legalDirs(grid).length > 0) return { ok: false, error: 'You still have moves — slide a line.' };
      return { ok: true };
    }
    if (action.type !== 'move') return { ok: false, error: 'Slide a row or column.' };
    const dir = action.payload.dir as Dir;
    if (!DIRS.includes(dir)) return { ok: false, error: 'Pick up, down, left or right.' };
    if (applyDir(grid, dir) === null) return { ok: false, error: 'That way is blocked.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as TileDuelBoard;
    const seat = action.seat;
    const other = 1 - seat;

    next.version += 1;

    if (action.type === 'pass') {
      board.passStreak += 1;
      board.log.push(`Seat ${seat + 1} is stuck and passes.`);
      if (board.passStreak >= 2) {
        this.finishByScore(next, board);
        return next;
      }
    } else {
      const dir = action.payload.dir as Dir;
      const grid = board.grids[seat];
      const result = applyDir(grid, dir);
      if (!result) throw new BadRequestException('That way is blocked.');
      board.grids[seat] = result.grid;
      spawn(result.grid, Math.random);
      board.lastMoves[seat] = { dir, gained: result.gained };
      board.passStreak = 0;

      if (result.grid.some((v) => v >= TARGET)) {
        next.phase = 'completed';
        next.winnerSeat = seat;
        next.currentSeat = -1;
        board.log.push(`Seat ${seat + 1} forges the 2048 tile — victory!`);
        this.syncScores(next, board);
        return next;
      }
    }

    next.scores = board.grids.map(gridScore);
    next.seats = next.seats.map((s, i) => ({ ...s, score: next.scores[i] }));
    next.currentSeat = other;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as TileDuelBoard;
    const grid = board.grids[seat];
    const legal = legalDirs(grid);
    if (legal.length === 0) {
      return { action: { seat, type: 'pass', payload: {} }, delayMs: this.think(difficulty) };
    }
    if (difficulty === 'easy') {
      return {
        action: { seat, type: 'move', payload: { dir: legal[Math.floor(Math.random() * legal.length)] } },
        delayMs: this.think(difficulty),
      };
    }

    // Greedy evaluation over the four slides.
    let bestDir = legal[0];
    let bestScore = -Infinity;
    for (const dir of legal) {
      const result = applyDir(grid, dir);
      if (!result) continue;
      const g = result.grid;
      let score = gridScore(g);
      const max = Math.max(...g);
      score += Math.log2(Math.max(max, 2)) * 12; // value big tiles
      score += g.filter((v) => v === 0).length * 4; // keep air
      if (difficulty === 'expert') {
        // Penalise small tiles wedged on top of the big corner cluster.
        const corners = [g[0], g[3], g[12], g[15]];
        const maxCorner = Math.max(...corners);
        score += maxCorner >= 64 ? corners.filter((c) => c >= maxCorner / 2).length * 6 : 0;
      }
      score += Math.random() * 0.01;
      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }
    return {
      action: { seat, type: 'move', payload: { dir: bestDir } },
      delayMs: this.think(difficulty, 120),
    };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private syncScores(state: GameState, board: TileDuelBoard): void {
    state.scores = board.grids.map(gridScore);
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  private finishByScore(state: GameState, board: TileDuelBoard): void {
    this.syncScores(state, board);
    state.phase = 'completed';
    state.currentSeat = -1;
    const [a, b] = state.scores;
    state.winnerSeat = a === b ? null : a > b ? 0 : 1;
    board.log.push(a === b ? 'Both boards are stuck — a dead even split.' : `Both boards are stuck — the higher total wins.`);
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1100 : difficulty === 'medium' ? 900 : difficulty === 'hard' ? 750 : 600;
    return base + extra + Math.floor(Math.random() * 500);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as TileDuelBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        grids: board.grids.map((g) => [...g]) as Grid[],
        lastMoves: board.lastMoves.map((m) => (m ? { ...m } : null)),
        log: [...board.log],
      } as unknown as Record<string, unknown>,
    };
  }
}
