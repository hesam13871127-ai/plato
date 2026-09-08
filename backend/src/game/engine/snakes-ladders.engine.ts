import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig } from './types';

interface SnakesBoard extends Record<string, unknown> {
  positions: number[]; // per seat, 1..100 (0 = off board before first move)
  die: number | null;
  hasRolled: boolean;
  snakes: Record<number, number>; // head -> tail
  ladders: Record<number, number>; // bottom -> top
  consecutiveSixes: number;
}

const SNAKES: Record<number, number> = { 99: 41, 76: 58, 89: 53, 66: 45, 54: 31, 43: 18, 50: 5, 27: 5 };
const LADDERS: Record<number, number> = { 3: 22, 5: 8, 11: 26, 20: 29, 27: 56, 21: 42, 36: 44, 51: 67, 71: 92, 80: 99 };

@Injectable()
export class SnakesLaddersEngine extends BaseGameEngine {
  readonly slug = 'snakes_ladders';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    const board: SnakesBoard = {
      positions: Array.from({ length: n }, () => 0),
      die: null,
      hasRolled: false,
      snakes: { ...SNAKES },
      ladders: { ...LADDERS },
      consecutiveSixes: 0,
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
      scores: Array.from({ length: n }, () => 0),
      version: 1,
    };
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is over.' };
    if (state.currentSeat !== action.seat) return { ok: false, error: 'Not your turn.' };
    if (action.type !== 'roll') return { ok: false, error: 'Unknown action.' };
    const b = state.board as unknown as SnakesBoard;
    if (b.hasRolled) return { ok: false, error: 'You already rolled — waiting for next turn.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const b = state.board as unknown as SnakesBoard;
    const seat = action.seat;
    const die = Math.floor(Math.random() * 6) + 1;
    b.die = die;
    b.hasRolled = true;

    // Move token
    let pos = b.positions[seat];
    // First move needs 6 or 1 to enter? Classic needs 6, but for speed allow any roll from 0 -> die
    let next = pos === 0 ? die : pos + die;
    if (next > 100) {
      // bounce: need exact, so stay
      next = pos;
    } else {
      // snakes / ladders
      if (b.snakes[next] != null) next = b.snakes[next];
      else if (b.ladders[next] != null) next = b.ladders[next];
    }
    b.positions[seat] = next;
    state.scores = [...b.positions];
    state.version += 1;

    if (next === 100) {
      state.phase = 'completed';
      state.winnerSeat = seat;
      state.winnerSeats = [seat];
      state.currentSeat = -1;
      return state;
    }

    // Six grants extra roll, but 3 sixes in a row = lose turn
    if (die === 6) {
      b.consecutiveSixes += 1;
      if (b.consecutiveSixes >= 3) {
        b.consecutiveSixes = 0;
        b.hasRolled = false;
        b.die = null;
        state.currentSeat = (seat + 1) % state.seats.length;
        state.turn += 1;
        state.turnStartedAt = new Date().toISOString();
      } else {
        // same player rolls again
        b.hasRolled = false;
        b.die = die; // keep showing last die but allow reroll
      }
    } else {
      b.consecutiveSixes = 0;
      b.hasRolled = false;
      b.die = die;
      // brief pause before next turn — reset die on next player's turn start is handled by hasRolled false
      state.currentSeat = (seat + 1) % state.seats.length;
      state.turn += 1;
      state.turnStartedAt = new Date().toISOString();
      // clear die for next player after a tick? keep visible for now, next roll overwrites
    }
    state.version += 1;
    return state;
  }

  chooseBotMove(state: GameState, seat: number): BotMove {
    if (state.phase !== 'in_progress' || state.currentSeat !== seat) {
      return { action: { seat, type: '__noop__', payload: {} }, delayMs: 0 };
    }
    const delay = 900 + Math.floor(Math.random() * 800);
    return { action: { seat, type: 'roll', payload: {} }, delayMs: delay };
  }
}
