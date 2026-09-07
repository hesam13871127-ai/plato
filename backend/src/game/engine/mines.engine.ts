import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface MinesBoard extends Record<string, unknown> {
  size: number;
  mineCount: number;
  /** Server-only truth: true where a mine is buried. */
  mines: boolean[][];
  /** Public: -1 hidden, 0–8 revealed number, 9 = mine found (see owners). */
  cells: number[][];
  /** Public: seat that found the mine at [r][c], else -1. */
  owners: number[][];
  flags: number[];
  remaining: number;
  lastMove: { seat: number; r: number; c: number; mine: boolean; revealed: number } | null;
}

const SIZES: Record<number, { size: number; mines: number }> = {
  2: { size: 12, mines: 31 },
  3: { size: 14, mines: 43 },
  4: { size: 16, mines: 51 },
};

/**
 * Mines — competitive Minesweeper ("Minesweeper Flags") for 2–4 players on
 * one shared board. Tap a hidden cell: finding a mine plants your flag,
 * scores a point and lets you go again; a safe cell reveals its number (zeros
 * cascade) and passes the turn. The mine count is odd so two players never
 * tie; the game ends as soon as nobody can catch the leader. Bots deduce
 * certain mines from the numbers and otherwise gamble on the densest frontier.
 */
@Injectable()
export class MinesEngine extends BaseGameEngine {
  readonly slug = 'mines';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    const spec = SIZES[Math.min(4, Math.max(2, n))];
    const size = spec.size;
    const mines = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
    let placed = 0;
    while (placed < spec.mines) {
      const r = Math.floor(Math.random() * size);
      const c = Math.floor(Math.random() * size);
      if (!mines[r][c]) {
        mines[r][c] = true;
        placed++;
      }
    }
    const board: MinesBoard = {
      size,
      mineCount: spec.mines,
      mines,
      cells: Array.from({ length: size }, () => Array<number>(size).fill(-1)),
      owners: Array.from({ length: size }, () => Array<number>(size).fill(-1)),
      flags: config.seats.map(() => 0),
      remaining: spec.mines,
      lastMove: null,
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
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    if (action.type !== 'reveal') return { ok: false, error: 'Unknown action.' };
    const board = state.board as unknown as MinesBoard;
    const r = Number(action.payload.r);
    const c = Number(action.payload.c);
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= board.size || c >= board.size) {
      return { ok: false, error: 'Choose a cell.' };
    }
    if (board.cells[r][c] !== -1) return { ok: false, error: 'That cell is already open.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as MinesBoard;
    const r = Number(action.payload.r);
    const c = Number(action.payload.c);
    next.version += 1;

    if (board.mines[r][c]) {
      board.cells[r][c] = 9;
      board.owners[r][c] = action.seat;
      board.flags[action.seat] += 1;
      board.remaining -= 1;
      board.lastMove = { seat: action.seat, r, c, mine: true, revealed: 1 };
      next.scores[action.seat] = board.flags[action.seat];
      next.seats[action.seat].score = board.flags[action.seat];
      if (this.decided(board)) {
        this.finish(next);
        return next;
      }
      // Finding a mine keeps the turn.
      next.turnStartedAt = new Date().toISOString();
      return next;
    }

    const revealed = this.reveal(board, r, c);
    board.lastMove = { seat: action.seat, r, c, mine: false, revealed };
    next.currentSeat = (action.seat + 1) % next.seats.length;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as MinesBoard;
    const pick = this.pickCell(board, difficulty);
    const base = difficulty === 'easy' ? 1100 : difficulty === 'medium' ? 900 : difficulty === 'hard' ? 750 : 600;
    return { action: { seat, type: 'reveal', payload: { r: pick[0], c: pick[1] } }, delayMs: base + Math.floor(Math.random() * 700) };
  }

  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as MinesBoard;
    return {
      ...state,
      board: {
        size: board.size,
        mineCount: board.mineCount,
        cells: board.cells,
        owners: board.owners,
        flags: board.flags,
        remaining: board.remaining,
        lastMove: board.lastMove,
      },
    };
  }

  // ── Rules ─────────────────────────────────────────────────────────────────

  private neighbors(size: number, r: number, c: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < size && nc < size) out.push([nr, nc]);
      }
    }
    return out;
  }

  private countAround(board: MinesBoard, r: number, c: number): number {
    return this.neighbors(board.size, r, c).filter(([nr, nc]) => board.mines[nr][nc]).length;
  }

  /** Reveals a safe cell, cascading through zeros. Returns how many cells opened. */
  private reveal(board: MinesBoard, r0: number, c0: number): number {
    const stack: Array<[number, number]> = [[r0, c0]];
    let opened = 0;
    while (stack.length) {
      const [r, c] = stack.pop()!;
      if (board.cells[r][c] !== -1 || board.mines[r][c]) continue;
      const n = this.countAround(board, r, c);
      board.cells[r][c] = n;
      opened++;
      if (n === 0) for (const nb of this.neighbors(board.size, r, c)) stack.push(nb);
    }
    return opened;
  }

  /** True when the leader can no longer be caught (or every mine is found). */
  private decided(board: MinesBoard): boolean {
    if (board.remaining === 0) return true;
    const sorted = [...board.flags].sort((a, b) => b - a);
    const leader = sorted[0];
    const runnerUp = sorted[1] ?? 0;
    return leader > runnerUp + board.remaining;
  }

  private finish(state: GameState): void {
    const board = state.board as unknown as MinesBoard;
    state.phase = 'completed';
    state.currentSeat = -1;
    state.scores = [...board.flags];
    const max = Math.max(...board.flags);
    const leaders = board.flags.map((f, i) => (f === max ? i : -1)).filter((i) => i >= 0);
    state.winnerSeat = leaders.length === 1 ? leaders[0] : null;
    state.winnerSeats = leaders;
    // Reveal everything for the post-game view.
    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        if (board.cells[r][c] === -1) board.cells[r][c] = board.mines[r][c] ? 9 : this.countAround(board, r, c);
      }
    }
  }

  // ── Bot ───────────────────────────────────────────────────────────────────

  private pickCell(board: MinesBoard, difficulty: SeatInfo['botDifficulty']): [number, number] {
    const hidden: Array<[number, number]> = [];
    for (let r = 0; r < board.size; r++) for (let c = 0; c < board.size; c++) if (board.cells[r][c] === -1) hidden.push([r, c]);
    const random = hidden[Math.floor(Math.random() * hidden.length)];
    const blunder = difficulty === 'easy' ? 0.5 : difficulty === 'medium' ? 0.2 : difficulty === 'hard' ? 0.05 : 0;
    if (Math.random() < blunder) return random;

    // Probability estimate per hidden cell from adjacent numbers.
    const prob = new Map<string, number>();
    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        const n = board.cells[r][c];
        if (n < 0 || n > 8) continue;
        const nbs = this.neighbors(board.size, r, c);
        const unknown = nbs.filter(([nr, nc]) => board.cells[nr][nc] === -1);
        const found = nbs.filter(([nr, nc]) => board.cells[nr][nc] === 9).length;
        const left = n - found;
        if (unknown.length === 0) continue;
        const p = left <= 0 ? 0 : left / unknown.length;
        for (const [ur, uc] of unknown) {
          const key = `${ur},${uc}`;
          const prev = prob.get(key);
          // Certainties dominate; otherwise take the max estimate.
          prob.set(key, prev === undefined ? p : p === 0 || prev === 0 ? 0 : Math.max(prev, p));
        }
      }
    }
    let best: [number, number] | null = null;
    let bestP = -1;
    for (const [key, p] of prob) {
      if (p > bestP) {
        bestP = p;
        const [r, c] = key.split(',').map(Number);
        best = [r, c];
      }
    }
    // Certain mine, or a frontier cell at least as likely as the base rate.
    const baseRate = board.remaining / Math.max(1, hidden.length);
    if (best && bestP >= 0.999) return best;
    if (best && bestP >= baseRate) return best;

    // Otherwise a hidden cell with no information — prefer unconstrained ones.
    const free = hidden.filter(([r, c]) => !prob.has(`${r},${c}`));
    if (free.length) return free[Math.floor(Math.random() * free.length)];
    return best ?? random;
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as MinesBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        cells: board.cells.map((row) => [...row]),
        owners: board.owners.map((row) => [...row]),
        flags: [...board.flags],
      } as unknown as Record<string, unknown>,
    };
  }
}
