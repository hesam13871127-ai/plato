import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface DnbBoard extends Record<string, unknown> {
  /** Boxes per side (5 → 6×6 dots, 25 boxes — no ties). */
  size: number;
  /** h[r][c]: horizontal edge between dots (r,c)-(r,c+1); rows 0..size, cols 0..size-1. -1 free. */
  h: number[][];
  /** v[r][c]: vertical edge between dots (r,c)-(r+1,c); rows 0..size-1, cols 0..size. -1 free. */
  v: number[][];
  /** boxes[r][c]: owning seat or -1. */
  boxes: number[][];
  lastEdge: { kind: 'h' | 'v'; r: number; c: number; seat: number } | null;
  /** Boxes claimed so far. */
  claimed: number;
}

const SIZE = 5;

/**
 * Dots & Boxes for two players, wave-2 rebuild.
 *
 * Take turns drawing one edge on the 5×5 box grid; whoever draws the fourth
 * side of a box claims it and immediately draws again (chains!). When every
 * edge is drawn the player with more of the 25 boxes wins — the odd count
 * guarantees no ties. No hidden information.
 *
 * Bots play the classic ladder: take every completable box, otherwise draw a
 * safe edge that leaves no three-sided box, and when forced to open a box
 * give away as little as possible. Difficulty scales the blunder rate.
 */
@Injectable()
export class DotsAndBoxesEngine extends BaseGameEngine {
  readonly slug = 'dots_and_boxes';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: DnbBoard = {
      size: SIZE,
      h: Array.from({ length: SIZE + 1 }, () => Array<number>(SIZE).fill(-1)),
      v: Array.from({ length: SIZE }, () => Array<number>(SIZE + 1).fill(-1)),
      boxes: Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(-1)),
      lastEdge: null,
      claimed: 0,
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
    if (action.type !== 'edge') return { ok: false, error: 'Unknown action.' };
    const board = state.board as unknown as DnbBoard;
    const kind = action.payload.kind;
    const r = Number(action.payload.r);
    const c = Number(action.payload.c);
    if (kind !== 'h' && kind !== 'v') return { ok: false, error: 'Choose a horizontal or vertical edge.' };
    if (!Number.isInteger(r) || !Number.isInteger(c)) return { ok: false, error: 'Choose a valid edge.' };
    if (kind === 'h' && (r < 0 || r > board.size || c < 0 || c >= board.size)) {
      return { ok: false, error: 'That edge is off the grid.' };
    }
    if (kind === 'v' && (r < 0 || r >= board.size || c < 0 || c > board.size)) {
      return { ok: false, error: 'That edge is off the grid.' };
    }
    if (this.owner(board, kind, r, c) !== -1) return { ok: false, error: 'That edge is already drawn.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as DnbBoard;
    const kind = action.payload.kind as 'h' | 'v';
    const r = Number(action.payload.r);
    const c = Number(action.payload.c);

    if (kind === 'h') board.h[r][c] = action.seat;
    else board.v[r][c] = action.seat;
    board.lastEdge = { kind, r, c, seat: action.seat };
    next.version += 1;

    // Claim every box the new edge completed.
    const completed = this.completedBoxes(board, kind, r, c);
    for (const [br, bc] of completed) {
      if (board.boxes[br][bc] === -1) {
        board.boxes[br][bc] = action.seat;
        board.claimed += 1;
      }
    }

    // Finished? Tally the boxes.
    const total = board.size * board.size;
    if (board.claimed >= total) {
      const counts = this.boxCounts(board);
      const winner = counts[0] === counts[1] ? null : counts[0] > counts[1] ? 0 : 1;
      this.finish(next, winner, counts);
      return next;
    }

    // Completing at least one box earns another line immediately.
    if (completed.length === 0) {
      next.currentSeat = (action.seat + 1) % next.seats.length;
      next.turn += 1;
      next.turnStartedAt = new Date().toISOString();
    }
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as DnbBoard;
    const free = this.freeEdges(board);
    if (free.length === 0) {
      return { action: { seat, type: 'edge', payload: { kind: 'h', r: 0, c: 0 } }, delayMs: 500 };
    }
    const mistakeChance =
      difficulty === 'easy' ? 0.45 : difficulty === 'medium' ? 0.18 : difficulty === 'hard' ? 0.06 : 0.0;

    let pick: { kind: 'h' | 'v'; r: number; c: number };
    if (Math.random() < mistakeChance) {
      pick = free[Math.floor(Math.random() * free.length)];
    } else {
      pick = this.bestEdge(board, free);
    }
    return {
      action: { seat, type: 'edge', payload: { kind: pick.kind, r: pick.r, c: pick.c } },
      delayMs: this.think(difficulty),
    };
  }

  // ── rules helpers ─────────────────────────────────────────────────────────

  private owner(board: DnbBoard, kind: 'h' | 'v', r: number, c: number): number {
    return kind === 'h' ? board.h[r][c] : board.v[r][c];
  }

  /** Sides of box (r,c) already drawn. */
  private boxSides(board: DnbBoard, r: number, c: number): number {
    let n = 0;
    if (board.h[r][c] !== -1) n++;
    if (board.h[r + 1][c] !== -1) n++;
    if (board.v[r][c] !== -1) n++;
    if (board.v[r][c + 1] !== -1) n++;
    return n;
  }

  /** Boxes the edge (kind,r,c) completes (0–2), assuming it gets drawn. */
  private completedBoxes(board: DnbBoard, kind: 'h' | 'v', r: number, c: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    const full = (br: number, bc: number) => this.boxSides(board, br, bc) === 4;
    if (kind === 'h') {
      if (r > 0 && full(r - 1, c)) out.push([r - 1, c]);
      if (r < board.size && full(r, c)) out.push([r, c]);
    } else {
      if (c > 0 && full(r, c - 1)) out.push([r, c - 1]);
      if (c < board.size && full(r, c)) out.push([r, c]);
    }
    return out;
  }

  freeEdges(board: DnbBoard): Array<{ kind: 'h' | 'v'; r: number; c: number }> {
    const out: Array<{ kind: 'h' | 'v'; r: number; c: number }> = [];
    for (let r = 0; r <= board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        if (board.h[r][c] === -1) out.push({ kind: 'h', r, c });
      }
    }
    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c <= board.size; c++) {
        if (board.v[r][c] === -1) out.push({ kind: 'v', r, c });
      }
    }
    return out;
  }

  boxCounts(board: DnbBoard): number[] {
    const counts = [0, 0];
    for (const row of board.boxes) {
      for (const owner of row) {
        if (owner === 0 || owner === 1) counts[owner] += 1;
      }
    }
    return counts;
  }

  /**
   * Bot ladder: complete boxes first; otherwise play a safe edge (one that
   * leaves no three-sided box); when forced, open the fewest boxes.
   */
  private bestEdge(
    board: DnbBoard,
    free: Array<{ kind: 'h' | 'v'; r: number; c: number }>,
  ): { kind: 'h' | 'v'; r: number; c: number } {
    // 1. Completing edges.
    let bestComplete: { kind: 'h' | 'v'; r: number; c: number } | null = null;
    let bestYield = -1;
    for (const e of free) {
      const yieldN = this.completedBoxes(board, e.kind, e.r, e.c).length;
      if (yieldN > bestYield) {
        bestYield = yieldN;
        bestComplete = e;
      }
    }
    if (bestComplete && bestYield > 0) return bestComplete;

    // 2. Safe edges — leave no box at three sides.
    const givesAway = (e: { kind: 'h' | 'v'; r: number; c: number }): number => {
      let n = 0;
      const adj = this.adjacentBoxes(board, e.kind, e.r, e.c);
      for (const [br, bc] of adj) {
        if (this.boxSides(board, br, bc) === 2) n++;
      }
      return n;
    };
    const safe = free.filter((e) => givesAway(e) === 0);
    if (safe.length > 0) {
      // Prefer central edges for flexibility.
      const mid = board.size / 2;
      return safe.reduce((a, b) => {
        const da = Math.abs(a.r - mid) + Math.abs(a.c - mid);
        const db = Math.abs(b.r - mid) + Math.abs(b.c - mid);
        return da <= db ? a : b;
      });
    }

    // 3. Forced: give away as little as possible.
    return free.reduce((a, b) => (givesAway(a) <= givesAway(b) ? a : b));
  }

  private adjacentBoxes(
    board: DnbBoard,
    kind: 'h' | 'v',
    r: number,
    c: number,
  ): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    if (kind === 'h') {
      if (r > 0) out.push([r - 1, c]);
      if (r < board.size) out.push([r, c]);
    } else {
      if (c > 0) out.push([r, c - 1]);
      if (c < board.size) out.push([r, c]);
    }
    return out;
  }

  private finish(state: GameState, winnerSeat: number | null, counts: number[]): void {
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = [...counts];
    state.seats = state.seats.map((s, i) => ({ ...s, score: counts[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1500 : difficulty === 'medium' ? 1100 : difficulty === 'hard' ? 800 : 550;
    return base + Math.floor(Math.random() * 900);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as DnbBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        size: board.size,
        h: board.h.map((row) => [...row]),
        v: board.v.map((row) => [...row]),
        boxes: board.boxes.map((row) => [...row]),
        lastEdge: board.lastEdge ? { ...board.lastEdge } : null,
        claimed: board.claimed,
      } as unknown as Record<string, unknown>,
    };
  }
}
