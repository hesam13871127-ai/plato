import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface RollResult {
  seat: number;
  dice: [number, number];
  sum: number;
  bust: boolean;
}

interface BankrollBoard extends Record<string, unknown> {
  /** 1-based betting round; ROUNDS rounds a game. */
  round: number;
  /** 'bet' (hot-seat stakes) or 'roll' (the dice decide). */
  phase: 'bet' | 'roll';
  /** Chips each seat still holds. */
  bankrolls: number[];
  /** Chips on the table. */
  pot: number;
  /** Highest stake this round. */
  roundStake: number;
  /** Seats that bet — they roll, in this order. */
  bettors: number[];
  /** Dice results this round. */
  results: RollResult[];
  /** Who folded this round (keeps their chips, cannot win). */
  foldedRound: boolean[];
  log: string[];
}

const ROUNDS = 5;
const START_BANKROLL = 1000;
const MIN_BET = 5;

function rollDie(): number {
  return 1 + Math.floor(Math.random() * 6);
}

/**
 * Bankroll — hot-seat dice poker, wave-5 rebuild of the quick-challenges
 * family.
 *
 * Five betting rounds around one table. Each round every player either
 * pushes chips into the pot ('bet', at least five, up to their whole
 * bankroll) or folds and sits the round out. When the table is set, everyone
 * who bet rolls two dice in seat order: a seven or eleven is safe, craps —
 * two, three or twelve — busts you out of the running, and any other total
 * is your score. The highest total rakes the pot (ties split it); if every
 * bettor craps out, the pot carries over and swells the next round. After
 * five rounds the richest stack wins — so a fat lead in the last round is
 * worth protecting with a well-timed fold. No hidden information.
 *
 * Bots size their bets by difficulty — easy whales splash big, expert
 * grinders keep it small — and never fold while they can afford the minimum.
 */
@Injectable()
export class BankrollEngine extends BaseGameEngine {
  readonly slug = 'bankroll';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: BankrollBoard = {
      round: 1,
      phase: 'bet',
      bankrolls: config.seats.map(() => START_BANKROLL),
      pot: 0,
      roundStake: 0,
      bettors: [],
      results: [],
      foldedRound: config.seats.map(() => false),
      log: ['Round 1 of 5 — place your stakes.'],
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
        score: START_BANKROLL,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: config.seats.map(() => START_BANKROLL),
      version: 1,
    };
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'The game is already over.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as BankrollBoard;
    if (board.phase === 'bet') {
      if (action.type === 'fold') return { ok: true };
      if (action.type !== 'bet') return { ok: false, error: 'Bet or fold.' };
      const amount = Number(action.payload.amount);
      if (!Number.isInteger(amount) || amount < MIN_BET) {
        return { ok: false, error: `Minimum bet is ${MIN_BET}.` };
      }
      if (amount > board.bankrolls[action.seat]) {
        return { ok: false, error: 'You cannot bet more than your bankroll.' };
      }
      return { ok: true };
    }
    if (board.phase === 'roll') {
      if (action.type !== 'roll') return { ok: false, error: 'Roll the dice.' };
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const next = this.clone(state);
    const board = next.board as unknown as BankrollBoard;
    const seat = action.seat;
    next.version += 1;

    if (board.phase === 'bet') {
      if (action.type === 'fold') {
        board.foldedRound[seat] = true;
        board.log.push(`Seat ${seat + 1} folds and keeps their stack.`);
      } else {
        const amount = Number(action.payload.amount);
        board.bankrolls[seat] -= amount;
        board.pot += amount;
        board.roundStake = Math.max(board.roundStake, amount);
        board.bettors.push(seat);
        board.log.push(`Seat ${seat + 1} bets ${amount}.`);
      }
      if (seat < next.seats.length - 1) {
        next.currentSeat = seat + 1;
      } else {
        // Table is set — hand the dice to the first bettor.
        if (board.bettors.length === 0) {
          board.log.push('Nobody bet — the pot carries over.');
          return this.advanceRound(next, board);
        }
        board.phase = 'roll';
        board.results = [];
        next.currentSeat = board.bettors[0];
        board.log.push('The dice are out — sevens and elevens are safe, craps bust.');
      }
      next.turnStartedAt = new Date().toISOString();
      return next;
    }

    // Roll phase.
    const d1 = rollDie();
    const d2 = rollDie();
    const sum = d1 + d2;
    const bust = sum === 2 || sum === 3 || sum === 12;
    board.results.push({ seat, dice: [d1, d2], sum, bust });
    board.log.push(`Seat ${seat + 1} rolls ${d1}+${d2}=${sum}${bust ? ' — craps, busted!' : sum === 7 || sum === 11 ? ' — safe!' : '.'}`);

    const idx = board.bettors.indexOf(seat);
    if (idx < board.bettors.length - 1) {
      next.currentSeat = board.bettors[idx + 1];
      next.turnStartedAt = new Date().toISOString();
      return next;
    }
    return this.resolveRound(next, board);
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as BankrollBoard;
    if (board.phase === 'roll') {
      return { action: { seat, type: 'roll', payload: {} }, delayMs: this.think(difficulty) };
    }
    const bankroll = board.bankrolls[seat];
    if (bankroll < MIN_BET) {
      return { action: { seat, type: 'fold', payload: {} }, delayMs: this.think(difficulty) };
    }
    // Bet sizing: whales vs grinders.
    const cap =
      difficulty === 'easy' ? 250 : difficulty === 'medium' ? 120 : difficulty === 'hard' ? 70 : 50;
    const ceiling = Math.min(bankroll, cap);
    const amount = MIN_BET + Math.floor(Math.random() * Math.max(1, ceiling - MIN_BET + 1));
    return {
      action: { seat, type: 'bet', payload: { amount: Math.min(bankroll, amount) } },
      delayMs: this.think(difficulty),
    };
  }

  // ── round flow ────────────────────────────────────────────────────────────

  private resolveRound(next: GameState, board: BankrollBoard): GameState {
    const safe = board.results.filter((r) => !r.bust);
    if (safe.length > 0) {
      const best = Math.max(...safe.map((r) => r.sum));
      const winners = safe.filter((r) => r.sum === best).map((r) => r.seat);
      const share = Math.floor(board.pot / winners.length);
      let remainder = board.pot - share * winners.length;
      for (const w of winners.sort((a, b) => a - b)) {
        board.bankrolls[w] += share;
        if (remainder > 0) {
          board.bankrolls[w] += 1;
          remainder -= 1;
        }
      }
      board.log.push(
        winners.length === 1
          ? `Seat ${winners[0] + 1} rakes the pot of ${board.pot} with a ${best}!`
          : `A tie at ${best} — the pot of ${board.pot} splits between ${winners.map((w) => w + 1).join(' & ')}.`,
      );
      board.pot = 0;
    } else {
      board.log.push(`Everybody craps out — the pot of ${board.pot} carries over!`);
    }
    next.scores = [...board.bankrolls];
    return this.advanceRound(next, board);
  }

  private advanceRound(next: GameState, board: BankrollBoard): GameState {
    if (board.round >= ROUNDS) {
      this.finish(next, board);
      return next;
    }
    // A table where nobody can post the minimum is dead — call it.
    const solvent = board.bankrolls.filter((b) => b >= MIN_BET).length;
    if (solvent <= 1) {
      board.log.push('The table cannot post the minimum — game called.');
      this.finish(next, board);
      return next;
    }
    board.round += 1;
    board.phase = 'bet';
    board.roundStake = 0;
    board.bettors = [];
    board.results = [];
    board.foldedRound = board.foldedRound.map(() => false);
    board.log.push(`Round ${board.round} of ${ROUNDS} — place your stakes.`);
    next.currentSeat = 0;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  private finish(state: GameState, board: BankrollBoard): void {
    const totals = [...board.bankrolls];
    const max = Math.max(...totals);
    const leaders = totals.map((s, i) => ({ s, i })).filter((x) => x.s === max).map((x) => x.i);
    state.scores = totals;
    state.phase = 'completed';
    state.currentSeat = -1;
    if (leaders.length === 1) {
      state.winnerSeat = leaders[0];
      (state as unknown as { winnerSeats?: number[] }).winnerSeats = undefined;
    } else {
      state.winnerSeat = null;
      (state as unknown as { winnerSeats?: number[] }).winnerSeats = leaders;
    }
    state.seats = state.seats.map((s, i) => ({ ...s, score: totals[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1400 : difficulty === 'medium' ? 1100 : difficulty === 'hard' ? 900 : 750;
    return base + Math.floor(Math.random() * 600);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as BankrollBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        bankrolls: [...board.bankrolls],
        bettors: [...board.bettors],
        results: board.results.map((r) => ({ ...r, dice: [...r.dice] as [number, number] })),
        foldedRound: [...board.foldedRound],
        log: [...board.log],
      } as unknown as Record<string, unknown>,
    };
  }
}
