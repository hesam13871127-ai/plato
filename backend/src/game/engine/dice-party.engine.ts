import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface DicePlayer {
  total: number;
  hasRolled: boolean;
  lastRoll: number[];
}

interface DiceBoard extends Record<string, unknown> {
  diceCount: number;
  target: number; // rounds to play
  round: number;
  players: DicePlayer[];
  roundEndsAt: string | null;
  roundStartedAt: string;
  roundMs: number;
  botSeats: boolean[];
  // Per-seat scheduled roll offset within the round window (ms), server-only.
  botRollAt: number[];
  botDifficulty: Array<SeatInfo['botDifficulty']>;
}

/**
 * Dice Party — a fast live party game for 2–6 players. Every round everyone
 * rolls a handful of dice simultaneously; after a short window the round scores
 * and the highest roll banks points. After N rounds the top total wins. Bots
 * roll automatically during the round window with a human-like reaction delay;
 * live (no waiting on turns).
 */
@Injectable()
export class DicePartyEngine extends BaseGameEngine {
  readonly slug = 'dice_party';
  readonly minPlayers = 2;
  readonly maxPlayers = 6;
  readonly isLive = true;

  private static readonly ROUNDS = 5;
  private static readonly DICE = 3;

  createInitialState(config: MatchConfig): GameState {
    const players: DicePlayer[] = config.seats.map(() => ({ total: 0, hasRolled: false, lastRoll: [] }));
    const roundMs = 6000;
    const startedAt = Date.now();
    const board: DiceBoard = {
      diceCount: DicePartyEngine.DICE,
      target: DicePartyEngine.ROUNDS,
      round: 1,
      players,
      roundStartedAt: new Date(startedAt).toISOString(),
      roundEndsAt: new Date(startedAt + roundMs).toISOString(),
      roundMs,
      botSeats: config.seats.map((s) => s.isBot),
      // Bots roll at a human-like reaction time within the round window.
      botRollAt: config.seats.map((s, i) =>
        s.isBot ? startedAt + 600 + ((i * 733) % Math.round(roundMs * 0.7)) : Number.POSITIVE_INFINITY,
      ),
      botDifficulty: config.seats.map((s) => s.botDifficulty ?? 'medium'),
    };
    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: -1,
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
    const board = state.board as unknown as DiceBoard;
    if (action.type === 'roll') {
      if (action.seat < 0 || action.seat >= board.players.length) return { ok: false, error: 'Not a seat.' };
      if (board.players[action.seat].hasRolled) return { ok: false, error: 'You already rolled this round.' };
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid roll.');
    if (action.type === 'roll') this.rollFor(state as MutableState, action.seat);
    return state;
  }

  private rollFor(state: MutableState, seat: number): void {
    const board = state.board as unknown as DiceBoard;
    const player = board.players[seat];
    player.lastRoll = Array.from({ length: board.diceCount }, () => 1 + Math.floor(Math.random() * 6));
    player.hasRolled = true;
    state.version += 1;
    this.maybeScoreRound(state);
  }

  tick(state: GameState, now: Date): GameState {
    if (state.phase !== 'in_progress') return state;
    const board = state.board as unknown as DiceBoard;
    const t = now.getTime();

    // Bots roll at their scheduled reaction time within the round window.
    board.players.forEach((p, seat) => {
      if (board.botSeats[seat] && !p.hasRolled && t >= board.botRollAt[seat]) {
        this.rollFor(state as MutableState, seat);
      }
    });

    // End the round when the window expires or everyone has rolled.
    const windowEnded = board.roundEndsAt != null && t >= new Date(board.roundEndsAt).getTime();
    const allRolled = board.players.every((p) => p.hasRolled);
    if (windowEnded || allRolled) {
      this.scoreRound(state as MutableState);
    }
    return state;
  }

  private maybeScoreRound(state: MutableState): void {
    const board = state.board as unknown as DiceBoard;
    if (board.players.every((p) => p.hasRolled)) this.scoreRound(state);
  }

  private scoreRound(state: MutableState): void {
    const board = state.board as unknown as DiceBoard;
    // Every player matching the top sum banks the point (ties share the round).
    const sums = board.players.map((p) => p.lastRoll.reduce((a, b) => a + b, 0));
    const best = Math.max(...sums);
    sums.forEach((sum, seat) => {
      if (sum === best) board.players[seat].total += 1;
    });
    if (board.round >= board.target) {
      // Game over — highest total wins; tied leaders share the win.
      const maxTotal = Math.max(...board.players.map((p) => p.total));
      const leaders = board.players.map((p, i) => (p.total === maxTotal ? i : -1)).filter((i) => i >= 0);
      state.scores = board.players.map((p) => p.total);
      state.phase = 'completed';
      state.currentSeat = -1;
      state.winnerSeat = leaders[0] ?? null;
      state.winnerSeats = leaders;
      state.version += 1;
      return;
    }
    // Next round.
    board.round += 1;
    const start = Date.now();
    board.roundStartedAt = new Date(start).toISOString();
    board.players.forEach((p) => {
      p.hasRolled = false;
      p.lastRoll = [];
    });
    board.botRollAt = board.botSeats.map((isBot, i) =>
      isBot ? start + 600 + ((i * 733 + board.round * 199) % Math.round(board.roundMs * 0.7)) : Number.POSITIVE_INFINITY,
    );
    board.roundEndsAt = new Date(start + board.roundMs).toISOString();
    state.turn += 1;
    state.version += 1;
  }

  /** Live party game: every seated player rolls once per round (validate gates re-rolls). */
  canSeatAct(state: GameState, action: GameAction): boolean {
    if (state.phase !== 'in_progress') return false;
    return action.type === 'roll' && action.seat >= 0;
  }

  chooseBotMove(): BotMove {
    return { action: { seat: -1, type: '__noop__', payload: {} }, delayMs: 0 };
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as DiceBoard;
    void seat;
    // Dice are public once rolled; everyone sees rolls (party game), but we
    // strip the internal botSeats marker.
    const safe: Record<string, unknown> = {
      diceCount: board.diceCount,
      target: board.target,
      round: board.round,
      roundEndsAt: board.roundEndsAt,
      players: board.players.map((p) => ({ total: p.total, hasRolled: p.hasRolled, lastRoll: p.lastRoll })),
    };
    return { ...state, board: safe };
  }

  private after(ms: number): string {
    return new Date(Date.now() + ms).toISOString();
  }
}

interface MutableState extends GameState {
  version: number;
}
