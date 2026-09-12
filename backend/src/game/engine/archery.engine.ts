import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Arrow {
  seat: number;
  aimX: number;
  aimY: number;
  power: number;
  landingX: number;
  landingY: number;
  points: number;
  ring: string;
}

interface ArcheryBoard extends Record<string, unknown> {
  round: number;
  arrowsLeft: number;
  shooter: number;
  wind: { x: number; y: number };
  throws: Arrow[];
  lastThrow: Arrow | null;
}

const ROUNDS = 5;
const ARROWS_PER_TURN = 3;

/** Score by distance from centre (0 board edge). */
function scoreArchery(x: number, y: number): { points: number; ring: string } {
  const d = Math.hypot(x, y);
  if (d <= 0.08) return { points: 10, ring: 'X10' };
  if (d <= 0.18) return { points: 9, ring: '9' };
  if (d <= 0.30) return { points: 8, ring: '8' };
  if (d <= 0.42) return { points: 7, ring: '7' };
  if (d <= 0.55) return { points: 6, ring: '6' };
  if (d <= 0.68) return { points: 5, ring: '5' };
  if (d <= 0.82) return { points: 3, ring: '3' };
  if (d <= 1.0) return { points: 1, ring: '1' };
  return { points: 0, ring: 'MISS' };
}

function genWind(seed: number): { x: number; y: number } {
  let x = seed;
  const nr = () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
  const ang = nr() * Math.PI * 2;
  const str = 0.08 + nr() * 0.18; // wind strength
  return { x: Math.cos(ang) * str, y: Math.sin(ang) * str };
}

/**
 * Archery — Plato sports arcade for 2–4 players, wave-8 rebuild.
 *
 * Five rounds of three arrows at the ten-ring target. Each round has a
 * steady cross-wind that drifts the arrow off the aim; power tightens the
 * spread but never erases the wind. Inner gold is ten, outer rings fade to
 * one, off the target is a miss. After fifteen arrows the highest total
 * wins. The wind arrow and the last landing marker drive the board.
 *
 * Bots aim for the gold with per-difficulty noise and adjust for the wind
 * more as difficulty rises.
 */
@Injectable()
export class ArcheryEngine extends BaseGameEngine {
  readonly slug = 'archery';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: ArcheryBoard = {
      round: 1,
      arrowsLeft: ARROWS_PER_TURN,
      shooter: 0,
      wind: genWind(Math.floor(Math.random() * 1e9)),
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
      return { ok: false, error: 'Aim inside the target.' };
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
    const board = next.board as unknown as ArcheryBoard;
    const seat = action.seat;
    const aimX = Number(action.payload.aimX);
    const aimY = Number(action.payload.aimY);
    const power = Number(action.payload.power ?? 0.8);

    // Deterministic wobble + wind + drop
    const seed = board.throws.length * 7919 + seat * 104729 + 55555;
    let x = seed;
    const nr = () => {
      x = (x * 1664525 + 1013904223) % 4294967296;
      return x / 4294967296;
    };
    const angle = nr() * Math.PI * 2;
    const r = nr();
    const spread = 0.08 + (1 - power) * 0.16;
    const drop = (1 - power) * 0.22;
    const windPull = 0.55; // wind scales with (1-power*0.5)
    const windScale = windPull * (0.5 + (1 - power) * 0.5);
    const landX = Math.max(-1.4, Math.min(1.4, aimX + Math.cos(angle) * r * spread + board.wind.x * windScale));
    const landY = Math.max(-1.4, Math.min(1.4, aimY + Math.sin(angle) * r * spread + board.wind.y * windScale - drop));

    const { points, ring } = scoreArchery(landX, landY);
    const entry: Arrow = { seat, aimX, aimY, power, landingX: landX, landingY: landY, points, ring };
    board.throws.push(entry);
    board.lastThrow = entry;
    next.scores[seat] += points;
    board.arrowsLeft -= 1;
    next.version += 1;

    if (board.arrowsLeft > 0) {
      next.turnStartedAt = new Date().toISOString();
      return next;
    }

    board.arrowsLeft = ARROWS_PER_TURN;
    if (seat === next.seats.length - 1) {
      if (board.round >= ROUNDS) {
        this.finish(next);
        return next;
      }
      board.round += 1;
      board.wind = genWind(Math.floor(Math.random() * 1e9) + board.round * 1000);
    }
    board.shooter = (seat + 1) % next.seats.length;
    next.currentSeat = board.shooter;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as ArcheryBoard;
    const noise = difficulty === 'easy' ? 0.42 : difficulty === 'medium' ? 0.2 : difficulty === 'hard' ? 0.08 : 0.035;
    // Compensate wind partially: harder bots subtract more wind
    const comp = difficulty === 'easy' ? 0.15 : difficulty === 'medium' ? 0.35 : difficulty === 'hard' ? 0.6 : 0.75;
    const aimX = Math.max(-1, Math.min(1, -board.wind.x * comp + (Math.random() - 0.5) * 2 * noise));
    const aimY = Math.max(-1, Math.min(1, -board.wind.y * comp + (Math.random() - 0.5) * 2 * noise));
    const power = difficulty === 'easy' ? 0.6 + Math.random() * 0.3 : 0.82 + Math.random() * 0.13;
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
    const base = difficulty === 'easy' ? 1250 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 800 : 650;
    return base + extra + Math.floor(Math.random() * 700);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as ArcheryBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        wind: { ...board.wind },
        throws: board.throws.map((t) => ({ ...t })),
        lastThrow: board.lastThrow ? { ...board.lastThrow } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
