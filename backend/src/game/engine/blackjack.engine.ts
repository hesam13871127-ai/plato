import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Card {
  /** 1 = ace … 13 = king. */
  r: number;
  /** 0..3 — spades, hearts, diamonds, clubs. */
  s: number;
}

interface BlackjackBoard extends Record<string, unknown> {
  /** 1-based betting round; ROUNDS rounds a game. */
  round: number;
  /** 'bet' (post stakes) or 'play' (hit or stand). */
  phase: 'bet' | 'play';
  /** Chips each seat still holds. */
  bankrolls: number[];
  /** Stakes posted this round. */
  bets: number[];
  /** Seats that folded or cannot post the minimum. */
  foldedRound: boolean[];
  /** Seats still in the hand, in draw order. */
  bettors: number[];
  /** Per-seat hands (dealt when the round opens). */
  hands: Card[][];
  /** The dealer's cards — the hole card is hidden mid-hand. */
  dealer: Card[];
  /** Previous round's settle summary (public history). */
  lastRound: { dealer: Card[]; results: string[] } | null;
  log: string[];
}

const ROUNDS = 3;
const START_BANKROLL = 1000;
const MIN_BET = 5;

/** Best hand value — aces flex between 11 and 1. */
export function handValue(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.r === 1) {
      aces++;
      total += 11;
    } else {
      total += Math.min(c.r, 10);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards) === 21;
}

function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 1; r <= 13; r++) deck.push({ r, s });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Blackjack for two to four players, wave-6 build.
 *
 * Hot-seat twenty-one around one dealer. Three rounds: post a stake (five
 * chips minimum), then hit or stand in seat order — twenty-one on the deal
 * is a blackjack, busting over twenty-one ends your hand. When the table
 * stands, the house draws to seventeen and pays: blackjacks at three to
 * two, wins at even money, pushes return the stake. The dealer's hole card
 * stays sealed until the settle. After three rounds the richest stack wins.
 *
 * Bots play by the count — easy players chase cards, experts stand on
 * seventeen and bet like grinders.
 */
@Injectable()
export class BlackjackEngine extends BaseGameEngine {
  readonly slug = 'blackjack';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: BlackjackBoard = {
      round: 1,
      phase: 'bet',
      bankrolls: config.seats.map(() => START_BANKROLL),
      bets: config.seats.map(() => 0),
      foldedRound: config.seats.map(() => false),
      bettors: [],
      hands: config.seats.map(() => []),
      dealer: [],
      lastRound: null,
      log: ['Round 1 of 3 — post your stakes.'],
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
    const board = state.board as unknown as BlackjackBoard;
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
    if (action.type !== 'hit' && action.type !== 'stand') {
      return { ok: false, error: 'Hit or stand.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const next = this.clone(state);
    const board = next.board as unknown as BlackjackBoard;
    const seat = action.seat;
    next.version += 1;

    if (board.phase === 'bet') {
      if (action.type === 'fold') {
        board.foldedRound[seat] = true;
        board.log.push(`Seat ${seat + 1} sits the round out.`);
      } else {
        const amount = Number(action.payload.amount);
        board.bankrolls[seat] -= amount;
        board.bets[seat] = amount;
        board.bettors.push(seat);
        board.log.push(`Seat ${seat + 1} posts ${amount}.`);
      }
      if (seat < next.seats.length - 1) {
        next.currentSeat = seat + 1;
        next.turnStartedAt = new Date().toISOString();
        return next;
      }
      if (board.bettors.length === 0) {
        board.log.push('Nobody posts — on to the next round.');
        return this.advanceRound(next, board);
      }
      return this.deal(next, board);
    }

    // Play phase.
    if (action.type === 'hit') {
      board.hands[seat].push(this.draw());
      const value = handValue(board.hands[seat]);
      if (value > 21) {
        board.log.push(`Seat ${seat + 1} busts with ${value}.`);
        return this.nextBettor(next, board);
      }
      if (value === 21) {
        board.log.push(`Seat ${seat + 1} reaches twenty-one.`);
        return this.nextBettor(next, board);
      }
      next.turnStartedAt = new Date().toISOString();
      return next; // their call again
    }
    board.log.push(`Seat ${seat + 1} stands on ${handValue(board.hands[seat])}.`);
    return this.nextBettor(next, board);
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as BlackjackBoard;
    if (board.phase === 'bet') {
      const bankroll = board.bankrolls[seat];
      if (bankroll < MIN_BET) {
        return { action: { seat, type: 'fold', payload: {} }, delayMs: this.think(difficulty) };
      }
      const cap = difficulty === 'easy' ? 200 : difficulty === 'medium' ? 90 : difficulty === 'hard' ? 45 : 30;
      const ceiling = Math.min(bankroll, cap);
      const amount = MIN_BET + Math.floor(Math.random() * Math.max(1, ceiling - MIN_BET + 1));
      return {
        action: { seat, type: 'bet', payload: { amount: Math.min(bankroll, amount) } },
        delayMs: this.think(difficulty),
      };
    }
    const value = handValue(board.hands[seat]);
    const standAt = difficulty === 'easy' ? 15 : difficulty === 'medium' ? 17 : 17;
    const hit = value < standAt;
    return {
      action: { seat, type: hit ? 'hit' : 'stand', payload: {} },
      delayMs: this.think(difficulty, 150),
    };
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const view = this.clone(state);
    const board = view.board as unknown as BlackjackBoard;
    // The dealer's hole card stays sealed until the settle.
    if (state.phase === 'in_progress' && board.phase === 'play') {
      board.dealer = board.dealer.slice(0, 1);
    }
    return view;
  }

  // ── round flow ────────────────────────────────────────────────────────────

  private deck: Card[] = [];

  private draw(): Card {
    if (this.deck.length < 15) this.deck = freshDeck();
    return this.deck.pop() as Card;
  }

  private deal(next: GameState, board: BlackjackBoard): GameState {
    for (const seat of board.bettors) {
      board.hands[seat] = [this.draw(), this.draw()];
    }
    board.dealer = [this.draw(), this.draw()];
    board.phase = 'play';
    next.currentSeat = board.bettors[0];
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    board.log.push('Cards are out — hit or stand.');
    return next;
  }

  private nextBettor(next: GameState, board: BlackjackBoard): GameState {
    const idx = board.bettors.indexOf(next.currentSeat);
    if (idx >= 0 && idx < board.bettors.length - 1) {
      next.currentSeat = board.bettors[idx + 1];
      next.turnStartedAt = new Date().toISOString();
      return next;
    }
    return this.settle(next, board);
  }

  private settle(next: GameState, board: BlackjackBoard): GameState {
    // The house draws to seventeen.
    while (handValue(board.dealer) < 17) {
      board.dealer.push(this.draw());
    }
    const dealerValue = handValue(board.dealer);
    const dealerBlackjack = isBlackjack(board.dealer);
    const results: string[] = next.seats.map(() => '');

    for (const seat of board.bettors) {
      const bet = board.bets[seat];
      const value = handValue(board.hands[seat]);
      if (value > 21) {
        results[seat] = `bust (${value}) — loses ${bet}`;
        continue; // stake already gone
      }
      const playerBJ = isBlackjack(board.hands[seat]);
      if (playerBJ && !dealerBlackjack) {
        const payout = bet + Math.floor(bet * 1.5);
        board.bankrolls[seat] += payout;
        results[seat] = `blackjack! +${payout - bet}`;
      } else if (dealerValue > 21 || value > dealerValue) {
        board.bankrolls[seat] += bet * 2;
        results[seat] = dealerValue > 21 ? `dealer busts (${dealerValue}) — wins ${bet}` : `${value} beats ${dealerValue} — wins ${bet}`;
      } else if (value === dealerValue) {
        board.bankrolls[seat] += bet;
        results[seat] = `push (${value}) — stake returned`;
      } else {
        results[seat] = `${value} loses to ${dealerValue} — loses ${bet}`;
      }
    }
    board.lastRound = { dealer: board.dealer.map((c) => ({ ...c })), results };
    board.log.push(
      `Dealer shows ${dealerValue}${dealerValue > 21 ? ' — bust!' : dealerBlackjack ? ' — blackjack.' : '.'}`,
    );
    next.scores = [...board.bankrolls];
    return this.advanceRound(next, board);
  }

  private advanceRound(next: GameState, board: BlackjackBoard): GameState {
    if (board.round >= ROUNDS) {
      this.finish(next, board);
      return next;
    }
    const solvent = board.bankrolls.filter((b) => b >= MIN_BET).length;
    if (solvent === 0) {
      this.finish(next, board);
      return next;
    }
    board.round += 1;
    board.phase = 'bet';
    board.bets = board.bets.map(() => 0);
    board.foldedRound = board.foldedRound.map(() => false);
    board.bettors = [];
    board.hands = board.hands.map(() => []);
    board.dealer = [];
    board.log.push(`Round ${board.round} of ${ROUNDS} — post your stakes.`);
    next.currentSeat = 0;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  private finish(state: GameState, board: BlackjackBoard): void {
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

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1300 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 850 : 700;
    return base + extra + Math.floor(Math.random() * 500);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as BlackjackBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        bankrolls: [...board.bankrolls],
        bets: [...board.bets],
        foldedRound: [...board.foldedRound],
        bettors: [...board.bettors],
        hands: board.hands.map((h) => h.map((c) => ({ ...c }))),
        dealer: board.dealer.map((c) => ({ ...c })),
        lastRound: board.lastRound
          ? { dealer: board.lastRound.dealer.map((c) => ({ ...c })), results: [...board.lastRound.results] }
          : null,
        log: [...board.log],
      } as unknown as Record<string, unknown>,
    };
  }
}
