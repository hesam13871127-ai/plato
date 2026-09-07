import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/**
 * Board of `size × size` boxes ⇒ (size+1)² dots. Edges are indexed:
 *  - horizontal edge (r, c): between dot (r,c) and (r,c+1); r ∈ [0,size], c ∈ [0,size-1]
 *  - vertical   edge (r, c): between dot (r,c) and (r+1,c); r ∈ [0,size-1], c ∈ [0,size]
 * Values: -1 not drawn, else the seat that drew it. Boxes: -1 unclaimed or the owner seat.
 */
interface DotsBoard extends Record<string, unknown> {
  size: number;
  h: number[][];
  v: number[][];
  boxes: number[][];
  claimed: number[];
  lastEdge: { kind: 'h' | 'v'; r: number; c: number; seat: number } | null;
  remainingEdges: number;
}

interface Edge {
  kind: 'h' | 'v';
  r: number;
  c: number;
}

/**
 * Dots & Boxes for 2–4 players. Draw a line between two adjacent dots; closing
 * the fourth side of a box claims it and grants another turn. When every line
 * is drawn, most boxes wins. The board grows with the table: 2 players → 5×5
 * boxes, 3 → 6×6, 4 → 7×7. Bots avoid giving away boxes and, on higher
 * difficulties, count chains before opening them.
 */
@Injectable()
export class DotsBoxesEngine extends BaseGameEngine {
  readonly slug = 'dots_boxes';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const players = config.seats.length;
    const size = players <= 2 ? 5 : players === 3 ? 6 : 7;
    const board: DotsBoard = {
      size,
      h: Array.from({ length: size + 1 }, () => Array<number>(size).fill(-1)),
      v: Array.from({ length: size }, () => Array<number>(size + 1).fill(-1)),
      boxes: Array.from({ length: size }, () => Array<number>(size).fill(-1)),
      claimed: config.seats.map(() => 0),
      lastEdge: null,
      remainingEdges: 2 * size * (size + 1),
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
    if (action.type !== 'draw') return { ok: false, error: 'Unknown action.' };
    const board = state.board as unknown as DotsBoard;
    const edge = this.parseEdge(board, action.payload);
    if (!edge) return { ok: false, error: 'Pick a line between two dots.' };
    if (this.edgeValue(board, edge) !== -1) return { ok: false, error: 'That line is already drawn.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as DotsBoard;
    const edge = this.parseEdge(board, action.payload)!;
    const closed = this.draw(board, edge, action.seat);
    next.version += 1;

    if (board.remainingEdges === 0) {
      this.finish(next);
      return next;
    }
    if (closed === 0) {
      next.currentSeat = (action.seat + 1) % next.seats.length;
      next.turn += 1;
    }
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as DotsBoard;
    const free = this.freeEdges(board);
    const mistake = difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.12 : 0.0;
    let pick: Edge;
    if (Math.random() < mistake) {
      pick = free[Math.floor(Math.random() * free.length)];
    } else {
      pick = this.bestEdge(board, free, difficulty);
    }
    return {
      action: { seat, type: 'draw', payload: { kind: pick.kind, r: pick.r, c: pick.c } },
      delayMs: this.think(difficulty),
    };
  }

  // ── Rules ─────────────────────────────────────────────────────────────────

  private parseEdge(board: DotsBoard, payload: Record<string, unknown>): Edge | null {
    const kind = payload.kind;
    const r = Number(payload.r);
    const c = Number(payload.c);
    if ((kind !== 'h' && kind !== 'v') || !Number.isInteger(r) || !Number.isInteger(c)) return null;
    if (kind === 'h' && (r < 0 || r > board.size || c < 0 || c >= board.size)) return null;
    if (kind === 'v' && (r < 0 || r >= board.size || c < 0 || c > board.size)) return null;
    return { kind, r, c };
  }

  private edgeValue(board: DotsBoard, e: Edge): number {
    return e.kind === 'h' ? board.h[e.r][e.c] : board.v[e.r][e.c];
  }

  private setEdge(board: DotsBoard, e: Edge, value: number): void {
    if (e.kind === 'h') board.h[e.r][e.c] = value;
    else board.v[e.r][e.c] = value;
  }

  /** Boxes touching an edge: up to two (r,c) box coordinates. */
  private adjacentBoxes(board: DotsBoard, e: Edge): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    if (e.kind === 'h') {
      if (e.r > 0) out.push([e.r - 1, e.c]);
      if (e.r < board.size) out.push([e.r, e.c]);
    } else {
      if (e.c > 0) out.push([e.r, e.c - 1]);
      if (e.c < board.size) out.push([e.r, e.c]);
    }
    return out;
  }

  private sidesDrawn(board: DotsBoard, r: number, c: number): number {
    let n = 0;
    if (board.h[r][c] !== -1) n++;
    if (board.h[r + 1][c] !== -1) n++;
    if (board.v[r][c] !== -1) n++;
    if (board.v[r][c + 1] !== -1) n++;
    return n;
  }

  /** Draws the edge; returns how many boxes were closed (0, 1 or 2). */
  private draw(board: DotsBoard, e: Edge, seat: number): number {
    this.setEdge(board, e, seat);
    board.remainingEdges -= 1;
    board.lastEdge = { ...e, seat };
    let closed = 0;
    for (const [br, bc] of this.adjacentBoxes(board, e)) {
      if (board.boxes[br][bc] === -1 && this.sidesDrawn(board, br, bc) === 4) {
        board.boxes[br][bc] = seat;
        board.claimed[seat] += 1;
        closed++;
      }
    }
    return closed;
  }

  private freeEdges(board: DotsBoard): Edge[] {
    const out: Edge[] = [];
    for (let r = 0; r <= board.size; r++) for (let c = 0; c < board.size; c++) if (board.h[r][c] === -1) out.push({ kind: 'h', r, c });
    for (let r = 0; r < board.size; r++) for (let c = 0; c <= board.size; c++) if (board.v[r][c] === -1) out.push({ kind: 'v', r, c });
    return out;
  }

  // ── AI ────────────────────────────────────────────────────────────────────

  private bestEdge(board: DotsBoard, free: Edge[], difficulty: SeatInfo['botDifficulty']): Edge {
    // 1. Any edge that closes a box is taken immediately.
    const closers = free.filter((e) => this.adjacentBoxes(board, e).some(([r, c]) => this.sidesDrawn(board, r, c) === 3));
    if (closers.length > 0) {
      if (difficulty === 'expert') {
        // Endgame control: prefer the closer that finishes the longest chain last
        // — approximated by taking closers in scanning order (good enough here).
        return closers[0];
      }
      return closers[Math.floor(Math.random() * closers.length)];
    }
    // 2. Safe edges: ones that don't give the opponent a 3-sided box.
    const safe = free.filter((e) => this.adjacentBoxes(board, e).every(([r, c]) => this.sidesDrawn(board, r, c) < 2));
    if (safe.length > 0) return safe[Math.floor(Math.random() * safe.length)];
    // 3. Forced sacrifice: give away the shortest chain (hard/expert count it).
    if (difficulty === 'hard' || difficulty === 'expert') {
      let best = free[0];
      let bestCost = Infinity;
      for (const e of free) {
        const cost = this.chainCost(board, e);
        if (cost < bestCost) {
          bestCost = cost;
          best = e;
        }
      }
      return best;
    }
    return free[Math.floor(Math.random() * free.length)];
  }

  /** How many boxes the opponent could collect after this edge is drawn. */
  private chainCost(board: DotsBoard, e: Edge): number {
    const sim: DotsBoard = {
      ...board,
      h: board.h.map((row) => [...row]),
      v: board.v.map((row) => [...row]),
      boxes: board.boxes.map((row) => [...row]),
      claimed: [...board.claimed],
    };
    this.setEdge(sim, e, 99);
    let gained = 0;
    let progress = true;
    while (progress) {
      progress = false;
      for (const f of this.freeEdges(sim)) {
        const closes = this.adjacentBoxes(sim, f).some(([r, c]) => sim.boxes[r][c] === -1 && this.sidesDrawn(sim, r, c) === 3);
        if (closes) {
          this.setEdge(sim, f, 99);
          for (const [r, c] of this.adjacentBoxes(sim, f)) {
            if (sim.boxes[r][c] === -1 && this.sidesDrawn(sim, r, c) === 4) {
              sim.boxes[r][c] = 99;
              gained++;
            }
          }
          progress = true;
          break;
        }
      }
    }
    return gained;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  private finish(state: GameState): void {
    const board = state.board as unknown as DotsBoard;
    state.phase = 'completed';
    state.currentSeat = -1;
    state.scores = [...board.claimed];
    const max = Math.max(...board.claimed);
    const leaders = board.claimed.map((n, i) => (n === max ? i : -1)).filter((i) => i >= 0);
    state.winnerSeat = leaders.length === 1 ? leaders[0] : null;
    state.winnerSeats = leaders.length === 1 ? leaders : leaders.length > 1 ? leaders : null;
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1300 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 800 : 600;
    return base + Math.floor(Math.random() * 900);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as DotsBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        h: board.h.map((row) => [...row]),
        v: board.v.map((row) => [...row]),
        boxes: board.boxes.map((row) => [...row]),
        claimed: [...board.claimed],
      } as unknown as Record<string, unknown>,
    };
  }
}
