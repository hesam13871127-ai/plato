import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/** One dart landing: polar position on a unit board + the resolved score. */
interface DartHit {
  /** Distance from bull's-eye, 0..1 (1 = outer edge of the double ring). */
  r: number;
  /** Angle in radians (0 = straight up, clockwise positive). */
  theta: number;
  segment: number; // 1..20, 25 for bull, 0 for a miss
  multiplier: number; // 0 miss, 1 single, 2 double, 3 treble
  score: number;
}

interface DartsPlayer {
  remaining: number;
  /** Total score before this visit (restored on bust). */
  visitStart: number;
  darts: DartHit[]; // darts thrown in the current visit (max 3)
  visits: number;
  best: number; // best single visit total
  hundredPlus: number;
}

interface DartsBoard extends Record<string, unknown> {
  target: number; // 301
  players: DartsPlayer[];
  dartsLeft: number; // for the current visit
  lastVisit: { seat: number; darts: DartHit[]; total: number; bust: boolean; checkout: boolean } | null;
  /** Segment order clockwise from the top (standard board). */
  segments: number[];
  /** Ring radii (fractions of board radius). */
  rings: { bull: number; outerBull: number; trebleIn: number; trebleOut: number; doubleIn: number; doubleOut: number };
  /** Per-seat suggested checkout hints (shown only to the thrower). */
  hint: string | null;
}

const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const RINGS = { bull: 0.037, outerBull: 0.094, trebleIn: 0.582, trebleOut: 0.629, doubleIn: 0.953, doubleOut: 1 };
const START = 301;

/**
 * Darts — 301, double-out, for 2–4 players. Everyone starts on 301; a visit
 * is three darts, and the visit total is subtracted from your score. You
 * must reach exactly zero and the final dart has to be a double (or the
 * bull's-eye). Going below zero, landing on 1, or reaching zero without a
 * double is a bust: the visit is voided and your score is restored.
 *
 * Clients aim with a drifting reticle and send the point they released at,
 * as a unit vector on the board (x,y in -1..1, bull at 0,0). The server owns
 * scoring; the client only draws the throw. Bots aim at the best segment for
 * their remaining score with difficulty-scaled scatter.
 */
@Injectable()
export class DartsEngine extends BaseGameEngine {
  readonly slug = 'darts';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: DartsBoard = {
      target: START,
      players: config.seats.map(() => ({ remaining: START, visitStart: START, darts: [], visits: 0, best: 0, hundredPlus: 0 })),
      dartsLeft: 3,
      lastVisit: null,
      segments: SEGMENTS,
      rings: RINGS,
      hint: this.hintFor(START, 3),
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
    if (action.type !== 'throw') return { ok: false, error: 'Unknown action.' };
    const x = Number(action.payload.x);
    const y = Number(action.payload.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: 'Aim point required.' };
    if (Math.abs(x) > 1.6 || Math.abs(y) > 1.6) return { ok: false, error: 'Aim point is off the wall.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid throw.');
    const next = this.clone(state);
    const board = next.board as unknown as DartsBoard;
    const seat = action.seat;
    const player = board.players[seat];
    const hit = this.resolve(Number(action.payload.x), Number(action.payload.y));
    player.darts.push(hit);
    board.dartsLeft -= 1;
    next.version += 1;

    const after = player.remaining - hit.score;
    const finishedOnDouble = after === 0 && (hit.multiplier === 2 || hit.segment === 25 && hit.multiplier === 2);
    const bust = after < 0 || after === 1 || (after === 0 && !finishedOnDouble);

    if (bust) {
      // Visit voided.
      player.remaining = player.visitStart;
      this.endVisit(next, seat, true, false);
      return next;
    }

    player.remaining = after;
    if (after === 0) {
      this.endVisit(next, seat, false, true);
      next.phase = 'completed';
      next.currentSeat = -1;
      next.winnerSeat = seat;
      next.winnerSeats = [seat];
      // Score = points scored (higher is better) so leaderboards stay sane.
      next.scores = board.players.map((p) => board.target - p.remaining);
      next.seats.forEach((s, i) => (s.score = next.scores[i]));
      return next;
    }

    if (board.dartsLeft <= 0) {
      this.endVisit(next, seat, false, false);
    } else {
      board.hint = this.hintFor(player.remaining, board.dartsLeft);
    }
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as DartsBoard;
    const player = board.players[seat];
    const target = this.bestTarget(player.remaining, board.dartsLeft);
    const [tx, ty] = this.pointFor(target.segment, target.multiplier);
    const sigma = difficulty === 'easy' ? 0.16 : difficulty === 'medium' ? 0.1 : difficulty === 'hard' ? 0.065 : 0.045;
    const x = tx + this.gauss() * sigma;
    const y = ty + this.gauss() * sigma;
    const delay = difficulty === 'easy' ? 1500 : difficulty === 'medium' ? 1200 : 1000;
    return { action: { seat, type: 'throw', payload: { x: +x.toFixed(4), y: +y.toFixed(4) } }, delayMs: delay + Math.floor(Math.random() * 600) };
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as DartsBoard;
    return {
      ...state,
      board: {
        target: board.target,
        players: board.players.map((p) => ({
          remaining: p.remaining,
          darts: p.darts,
          visits: p.visits,
          best: p.best,
          hundredPlus: p.hundredPlus,
        })),
        dartsLeft: board.dartsLeft,
        lastVisit: board.lastVisit,
        segments: board.segments,
        rings: board.rings,
        hint:
          state.phase === 'in_progress' && seat === state.currentSeat
            ? this.hintFor(board.players[seat].remaining, board.dartsLeft)
            : null,
      },
    };
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  /** Maps a board point (bull at 0,0; +y up; radius 1 = outer double edge) to a hit. */
  private resolve(x: number, y: number): DartHit {
    const r = Math.sqrt(x * x + y * y);
    // Angle measured clockwise from straight up.
    let theta = Math.atan2(x, y);
    if (theta < 0) theta += Math.PI * 2;
    const rr = +r.toFixed(4);
    const tt = +theta.toFixed(4);
    if (r <= RINGS.bull) return { r: rr, theta: tt, segment: 25, multiplier: 2, score: 50 };
    if (r <= RINGS.outerBull) return { r: rr, theta: tt, segment: 25, multiplier: 1, score: 25 };
    if (r > RINGS.doubleOut) return { r: rr, theta: tt, segment: 0, multiplier: 0, score: 0 };
    const slice = Math.PI * 2 / 20;
    const index = Math.floor(((theta + slice / 2) % (Math.PI * 2)) / slice);
    const segment = SEGMENTS[index];
    let multiplier = 1;
    if (r >= RINGS.trebleIn && r <= RINGS.trebleOut) multiplier = 3;
    else if (r >= RINGS.doubleIn) multiplier = 2;
    return { r: rr, theta: tt, segment, multiplier, score: segment * multiplier };
  }

  /** Board point at the centre of a scoring bed. */
  private pointFor(segment: number, multiplier: number): [number, number] {
    if (segment === 25) return [0, 0];
    const index = SEGMENTS.indexOf(segment);
    const theta = index * (Math.PI * 2 / 20);
    const radius = multiplier === 3 ? (RINGS.trebleIn + RINGS.trebleOut) / 2 : multiplier === 2 ? (RINGS.doubleIn + RINGS.doubleOut) / 2 : 0.4;
    return [Math.sin(theta) * radius, Math.cos(theta) * radius];
  }

  private endVisit(state: GameState, seat: number, bust: boolean, checkout: boolean): void {
    const board = state.board as unknown as DartsBoard;
    const player = board.players[seat];
    const total = bust ? 0 : player.visitStart - player.remaining;
    board.lastVisit = { seat, darts: [...player.darts], total, bust, checkout };
    player.visits += 1;
    if (total > player.best) player.best = total;
    if (total >= 100) player.hundredPlus += 1;
    player.darts = [];
    player.visitStart = player.remaining;
    board.dartsLeft = 3;
    if (checkout) return;
    const nextSeat = (seat + 1) % state.seats.length;
    state.currentSeat = nextSeat;
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
    board.players[nextSeat].visitStart = board.players[nextSeat].remaining;
    board.hint = this.hintFor(board.players[nextSeat].remaining, 3);
    // Keep running "points scored" as the live score.
    state.scores = board.players.map((p) => board.target - p.remaining);
    state.seats.forEach((s, i) => (s.score = state.scores[i]));
  }

  // ── Strategy (shared by hints and bots) ───────────────────────────────────

  /** Best bed to aim at for the remaining score with `darts` left this visit. */
  private bestTarget(remaining: number, darts: number): { segment: number; multiplier: number } {
    // Direct finish on a double.
    if (remaining === 50) return { segment: 25, multiplier: 2 };
    if (remaining <= 40 && remaining % 2 === 0) return { segment: remaining / 2, multiplier: 2 };
    // Set up a double with one dart when we still have darts to spare.
    if (remaining <= 60 && darts >= 2) {
      for (const leave of [32, 40, 36, 24, 16, 20, 8, 4, 2]) {
        const need = remaining - leave;
        if (need >= 1 && need <= 20) return { segment: need, multiplier: 1 };
        if (need > 20 && need <= 60 && need % 3 === 0) return { segment: need / 3, multiplier: 3 };
      }
    }
    if (remaining <= 110 && remaining > 60 && darts >= 2) {
      // Treble setups: T20→leaves remaining-60, etc.
      for (const t of [20, 19, 18, 17, 16]) {
        const leave = remaining - t * 3;
        if (leave >= 2 && leave <= 40 && leave % 2 === 0) return { segment: t, multiplier: 3 };
      }
    }
    // Avoid busting: when few points remain, aim singles.
    if (remaining <= 60) {
      const single = Math.min(20, Math.max(1, remaining - 32));
      return { segment: single, multiplier: 1 };
    }
    return { segment: 20, multiplier: 3 };
  }

  private hintFor(remaining: number, darts: number): string | null {
    if (remaining > 170) return null;
    const t = this.bestTarget(remaining, darts);
    if (t.segment === 25) return 'Bull';
    const prefix = t.multiplier === 3 ? 'T' : t.multiplier === 2 ? 'D' : 'S';
    return `${prefix}${t.segment}`;
  }

  private gauss(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as DartsBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        players: board.players.map((p) => ({ ...p, darts: [...p.darts] })),
      } as unknown as Record<string, unknown>,
    };
  }
}
