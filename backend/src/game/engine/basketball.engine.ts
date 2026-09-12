import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface HoopThrow {
  seat: number;
  aimX: number;
  aimY: number;
  power: number;
  made: boolean;
  points: number;
  dist: number;
}

interface BasketballBoard extends Record<string, unknown> {
  round: number;
  shotsLeft: number;
  shooter: number;
  throws: HoopThrow[];
  lastThrow: HoopThrow | null;
}

const ROUNDS = 5;
const SHOTS_PER_TURN = 2; // each turn you take 2 shots, 5 rounds = 10 shots per player

function dist(x: number, y: number): number {
  return Math.hypot(x, y);
}

/**
 * Basketball (Hoops) — Plato sports arcade for 2–4 players, wave-8 rebuild.
 *
 * Five rounds of two shots each at the hoop. Aim on a 2-D plane centred on
 * the rim plus a power slider: the ball's actual landing is the aim plus a
 * deterministic wobble whose spread shrinks with power, plus a vertical drop
 * for weak arms. Land within the rim radius (plus a small backboard bank)
 * and the shot rattles in for two points. Miss and it clangs out. After ten
 * shots the highest total wins; ties split.
 *
 * Bots aim for the sweet spot with per-difficulty noise — easy bots clank
 * the rim and the backboard.
 */
@Injectable()
export class BasketballEngine extends BaseGameEngine {
  readonly slug = 'basketball';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: BasketballBoard = {
      round: 1,
      shotsLeft: SHOTS_PER_TURN,
      shooter: 0,
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
    if (action.type !== 'shoot') return { ok: false, error: 'Unknown action.' };
    const x = Number(action.payload.aimX);
    const y = Number(action.payload.aimY);
    const power = Number(action.payload.power ?? 0.8);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1 || Math.abs(y) > 1) {
      return { ok: false, error: 'Aim inside the court.' };
    }
    if (!Number.isFinite(power) || power < 0.25 || power > 1) {
      return { ok: false, error: 'Power must be between 25% and 100%.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid shot.');
    const next = this.clone(state);
    const board = next.board as unknown as BasketballBoard;
    const seat = action.seat;
    const aimX = Number(action.payload.aimX);
    const aimY = Number(action.payload.aimY);
    const power = Number(action.payload.power ?? 0.8);

    // Deterministic wobble + drop
    const seed = board.throws.length * 7919 + seat * 104729 + 12345;
    let x = seed;
    const nextRand = () => {
      x = (x * 1664525 + 1013904223) % 4294967296;
      return x / 4294967296;
    };
    const angle = nextRand() * Math.PI * 2;
    const r = nextRand();
    const spread = 0.09 + (1 - power) * 0.18;
    const drop = (1 - power) * 0.28;
    const landX = Math.max(-1.5, Math.min(1.5, aimX + Math.cos(angle) * r * spread));
    const landY = Math.max(-1.5, Math.min(1.5, aimY + Math.sin(angle) * r * spread - drop));

    const d = dist(landX, landY);
    // Rim radius ~0.22 ; backboard sweet bank zone behind rim
    const rim = 0.22;
    const backboardBank = landX > -0.05 && landX < 0.18 && landY > 0.12 && landY < 0.34 && d < 0.38;
    const made = d <= rim || backboardBank;
    const points = made ? 2 : 0;
    const entry: HoopThrow = { seat, aimX, aimY, power, made, points, dist: d };
    board.throws.push(entry);
    board.lastThrow = entry;
    next.scores[seat] += points;
    board.shotsLeft -= 1;
    next.version += 1;

    if (board.shotsLeft > 0) {
      next.turnStartedAt = new Date().toISOString();
      return next;
    }
    board.shotsLeft = SHOTS_PER_TURN;
    if (seat === next.seats.length - 1) {
      if (board.round >= ROUNDS) {
        this.finish(next);
        return next;
      }
      board.round += 1;
    }
    board.shooter = (seat + 1) % next.seats.length;
    next.currentSeat = board.shooter;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const noise = difficulty === 'easy' ? 0.45 : difficulty === 'medium' ? 0.22 : difficulty === 'hard' ? 0.09 : 0.04;
    const aimX = Math.max(-1, Math.min(1, (Math.random() - 0.5) * 2 * noise));
    const aimY = Math.max(-1, Math.min(1, (Math.random() - 0.5) * 2 * noise));
    const power = difficulty === 'easy' ? 0.65 + Math.random() * 0.25 : 0.82 + Math.random() * 0.12;
    return {
      action: { seat, type: 'shoot', payload: { aimX: +aimX.toFixed(3), aimY: +aimY.toFixed(3), power: +power.toFixed(2) } },
      delayMs: this.think(difficulty),
    };
  }

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
    const base = difficulty === 'easy' ? 1200 : difficulty === 'medium' ? 950 : difficulty === 'hard' ? 750 : 600;
    return base + extra + Math.floor(Math.random() * 700);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as BasketballBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        throws: board.throws.map((t) => ({ ...t })),
        lastThrow: board.lastThrow ? { ...board.lastThrow } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
