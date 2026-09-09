import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface SnakesBoard extends Record<string, unknown> {
  /** Cell per seat: 0 = start (off-board), 1..100 on the board. */
  positions: number[];
  dice: number | null;
  sixStreak: number;
  lastMove: {
    seat: number;
    roll: number;
    from: number;
    to: number;
    bounced: boolean;
    snake: [number, number] | null; // [head, tail]
    ladder: [number, number] | null; // [bottom, top]
    won: boolean;
  } | null;
  moveCount: number;
}

/** Classic board: ladders climb, snakes bite. Destinations never chain. */
const LADDERS: Readonly<Record<number, number>> = {
  1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100,
};
const SNAKES: Readonly<Record<number, number>> = {
  16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78,
};
const GOAL = 100;
const MAX_SIX_STREAK = 3;

/**
 * Snakes & Ladders for 2–4 players, wave-2 rebuild.
 *
 * Roll the die and climb the classic 1–100 track: ladders lift you, snakes
 * bite you down, rolls that overshoot 100 bounce back, and a 6 earns another
 * roll (capped at three in a row so nobody hog-rolls forever). First seat to
 * land exactly on 100 wins; final scores are the board positions. Pure luck
 * with dramatic swings — the bot just rolls, like everyone else.
 */
@Injectable()
export class SnakesLaddersEngine extends BaseGameEngine {
  readonly slug = 'snakes_ladders';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: SnakesBoard = {
      positions: config.seats.map(() => 0),
      dice: null,
      sixStreak: 0,
      lastMove: null,
      moveCount: 0,
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
    if (action.type !== 'roll') return { ok: false, error: 'Unknown action.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as SnakesBoard;

    const roll = 1 + Math.floor(Math.random() * 6);
    board.dice = roll;
    board.moveCount += 1;

    const from = board.positions[action.seat];
    let to = from + roll;
    let bounced = false;
    if (to > GOAL) {
      to = 2 * GOAL - to; // overshoot bounces back off 100
      bounced = true;
    }

    let snake: [number, number] | null = null;
    let ladder: [number, number] | null = null;
    if (to !== GOAL) {
      const snakeTo = SNAKES[to];
      const ladderTo = LADDERS[to];
      if (snakeTo !== undefined) {
        snake = [to, snakeTo];
        to = snakeTo;
      } else if (ladderTo !== undefined) {
        ladder = [to, ladderTo];
        to = ladderTo;
      }
    }

    board.positions[action.seat] = to;
    board.lastMove = { seat: action.seat, roll, from, to, bounced, snake, ladder, won: to === GOAL };
    next.version += 1;

    if (to === GOAL) {
      this.finish(next, action.seat);
      return next;
    }

    // A 6 rolls again — but three in a row passes the turn.
    if (roll === 6 && board.sixStreak < MAX_SIX_STREAK - 1) {
      board.sixStreak += 1;
      next.turnStartedAt = new Date().toISOString();
      return next; // same seat rolls again
    }
    board.sixStreak = 0;
    next.currentSeat = (action.seat + 1) % next.seats.length;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    return { action: { seat, type: 'roll', payload: {} }, delayMs: this.think(difficulty) };
  }

  private finish(state: GameState, winnerSeat: number): void {
    const board = state.board as unknown as SnakesBoard;
    const scores = [...board.positions];
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = scores;
    state.seats = state.seats.map((s, i) => ({ ...s, score: scores[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1500 : difficulty === 'medium' ? 1100 : difficulty === 'hard' ? 800 : 550;
    return base + Math.floor(Math.random() * 900);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as SnakesBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        positions: [...board.positions],
        dice: board.dice,
        sixStreak: board.sixStreak,
        lastMove: board.lastMove
          ? {
              ...board.lastMove,
              snake: board.lastMove.snake ? ([...board.lastMove.snake] as [number, number]) : null,
              ladder: board.lastMove.ladder ? ([...board.lastMove.ladder] as [number, number]) : null,
            }
          : null,
        moveCount: board.moveCount,
      } as unknown as Record<string, unknown>,
    };
  }
}
