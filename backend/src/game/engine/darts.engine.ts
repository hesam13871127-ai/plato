import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface DartThrow {
  seat: number;
  aim: [number, number];
  landing: [number, number];
  points: number;
  label: string;
}

interface DartsBoard extends Record<string, unknown> {
  /** 1-based round; ROUNDS rounds of three darts each. */
  round: number;
  /** Darts remaining in the current turn. */
  dartsLeft: number;
  /** Seat currently throwing. */
  thrower: number;
  /** Flat per-seat throw log. */
  throws: DartThrow[];
  /** The previous dart, for the landing marker. */
  lastThrow: DartThrow | null;
}

const ROUNDS = 5;
const DARTS_PER_TURN = 3;

/** Standard dartboard segment order, clockwise from the top. */
const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

/** Radii (board units, bull = 0, board edge = 1). */
const R_BULL = 0.06;
const R_OUTER_BULL = 0.12;
const R_TREBLE_IN = 0.52;
const R_TREBLE_OUT = 0.62;
const R_DOUBLE_IN = 0.88;
const R_DOUBLE_OUT = 1.0;

/** Deterministic wobble: a per-throw pseudo-random pull. */
function wobble(seed: number): [number, number] {
  let x = (seed * 2654435761) % 4294967296;
  const next = () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
  const a = next() * Math.PI * 2;
  const r = next();
  return [Math.cos(a) * r, Math.sin(a) * r];
}

/** Scores a landing point on the standard board. */
export function scoreDart(x: number, y: number): { points: number; label: string } {
  const r = Math.hypot(x, y);
  if (r <= R_BULL) return { points: 50, label: 'BULLSEYE' };
  if (r <= R_OUTER_BULL) return { points: 25, label: 'OUTER BULL' };
  if (r > R_DOUBLE_OUT) return { points: 0, label: 'MISS' };
  // Segment: angle from 12 o'clock, each slice is 18°.
  let deg = (Math.atan2(x, y) * 180) / Math.PI; // clockwise from top
  if (deg < 0) deg += 360;
  const seg = SEGMENTS[Math.floor((((deg + 9) % 360) / 18)) % 20];
  if (r >= R_TREBLE_IN && r <= R_TREBLE_OUT) return { points: seg * 3, label: `T${seg}` };
  if (r >= R_DOUBLE_IN) return { points: seg * 2, label: `D${seg}` };
  return { points: seg, label: `${seg}` };
}

/**
 * Arcade Darts for two to four players, wave-5 rebuild.
 *
 * Five rounds of three darts each at the classic clock board. A throw is an
 * aim point on the board plus a power — the dart drifts off the aim by a
 * small deterministic wobble and drops with weak arms, then lands and scores
 * by segment and ring: singles, doubles, trebles, outer bull 25 and the
 * bullseye 50. Miss the board and score nothing. After fifteen darts the
 * highest total takes the oche. No hidden information.
 *
 * Bots aim for treble twenty or the bull with per-difficulty noise — easy
 * bots spray across the whole board.
 */
@Injectable()
export class DartsEngine extends BaseGameEngine {
  readonly slug = 'darts';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: DartsBoard = {
      round: 1,
      dartsLeft: DARTS_PER_TURN,
      thrower: 0,
      throws: [],
      lastThrow: null,
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
    if (action.type !== 'throw') return { ok: false, error: 'Unknown action.' };
    const x = Number(action.payload.aimX);
    const y = Number(action.payload.aimY);
    const power = Number(action.payload.power ?? 0.8);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1 || Math.abs(y) > 1) {
      return { ok: false, error: 'Aim inside the board.' };
    }
    if (!Number.isFinite(power) || power < 0.2 || power > 1) {
      return { ok: false, error: 'Power must be between 20% and 100%.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid throw.');
    const next = this.clone(state);
    const board = next.board as unknown as DartsBoard;
    const seat = action.seat;
    const aimX = Number(action.payload.aimX);
    const aimY = Number(action.payload.aimY);
    const power = Number(action.payload.power ?? 0.8);

    // Flight: wobble by a deterministic seed, drop when the arm is soft.
    const seed = board.throws.length + 1;
    const [wx, wy] = wobble(seed * 7919 + seat * 104729);
    const spread = 0.09 + (1 - power) * 0.12;
    const drop = (1 - power) * 0.35;
    const landX = Math.max(-1.4, Math.min(1.4, aimX + wx * spread));
    const landY = Math.max(-1.4, Math.min(1.4, aimY + wy * spread - drop));

    const { points, label } = scoreDart(landX, landY);
    const entry: DartThrow = { seat, aim: [aimX, aimY], landing: [landX, landY], points, label };
    board.throws.push(entry);
    board.lastThrow = entry;
    next.scores[seat] += points;
    board.dartsLeft -= 1;
    next.version += 1;

    if (board.dartsLeft > 0) {
      next.turnStartedAt = new Date().toISOString();
      return next; // same thrower
    }

    // Turn over.
    board.dartsLeft = DARTS_PER_TURN;
    if (seat === next.seats.length - 1) {
      if (board.round >= ROUNDS) {
        this.finish(next);
        return next;
      }
      board.round += 1;
    }
    board.thrower = (seat + 1) % next.seats.length;
    next.currentSeat = board.thrower;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const noise =
      difficulty === 'easy' ? 0.5 : difficulty === 'medium' ? 0.22 : difficulty === 'hard' ? 0.09 : 0.04;
    // Half the darts chase treble 20 (just above the bull), half the bull.
    const target: [number, number] = Math.random() < 0.5 ? [0, 0.57] : [0, 0];
    const aimX = Math.max(-1, Math.min(1, target[0] + (Math.random() - 0.5) * 2 * noise));
    const aimY = Math.max(-1, Math.min(1, target[1] + (Math.random() - 0.5) * 2 * noise));
    return {
      action: { seat, type: 'throw', payload: { aimX: +aimX.toFixed(3), aimY: +aimY.toFixed(3), power: 0.85 } },
      delayMs: this.think(difficulty),
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private finish(state: GameState): void {
    const scores = state.scores;
    const max = Math.max(...scores);
    const leaders = scores.map((s, i) => ({ s, i })).filter((x) => x.s === max).map((x) => x.i);
    const winner = leaders.length === 1 ? leaders[0] : null;
    state.phase = 'completed';
    state.winnerSeat = winner;
    state.currentSeat = -1;
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1300 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 800 : 650;
    return base + extra + Math.floor(Math.random() * 700);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as DartsBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        throws: board.throws.map((t) => ({ ...t, aim: [...t.aim] as [number, number], landing: [...t.landing] as [number, number] })),
        lastThrow: board.lastThrow
          ? { ...board.lastThrow, aim: [...board.lastThrow.aim] as [number, number], landing: [...board.lastThrow.landing] as [number, number] }
          : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
