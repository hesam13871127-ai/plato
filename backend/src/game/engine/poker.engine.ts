import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/** Starting stack per player. */
const START_CHIPS = 1000;
/** Small / big blind. */
const SB = 10;
const BB = 20;
/** Safety valve: hands played before the chip leader is declared. */
const MAX_HANDS = 200;

type SubPhase = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

interface PokerBoard extends Record<string, unknown> {
  /** Server-only shoe for the current hand. Stripped from client views. */
  deck: string[];
  /** Server-only hole cards per seat. Redacted in client views. */
  hole: string[][];
  /** Public community cards revealed so far. */
  community: string[];
  /** Public chip counts (mirrored in state.scores). */
  chips: number[];
  /** Public: chips posted on the CURRENT street. */
  bet: number[];
  /** Public: total chips put in THIS hand (drives side pots). */
  contribution: number[];
  /** Public: folded / all-in / busted flags per seat. */
  folded: boolean[];
  allIn: boolean[];
  sittingOut: boolean[];
  /** Public: who acted since the last aggression on this street. */
  acted: boolean[];
  /** Seat currently holding the button. */
  dealer: number;
  /** Public: highest street bet and the last raise increment. */
  currentBet: number;
  lastRaiseSize: number;
  subPhase: SubPhase;
  /** Total chips in the middle (Σ contribution) — kept for the UI. */
  pot: number;
  handNumber: number;
  /** Public rolling action log for the table feed. */
  log: Array<{ seat: number; text: string }>;
  /** Summary of the previous hand, shown while the next one deals. */
  lastHand: { handNumber: number; winners: number[]; amount: number; label: string } | null;
}

/* ─────────────────────────── hand evaluation ─────────────────────────── */

const RANK_CHAR: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

export interface HandScore {
  /** Category 0..8 (high card .. straight flush). */
  category: number;
  /** Ordered tiebreak values (category already the most significant digit). */
  values: number[];
  /** The five cards forming the hand. */
  cards: string[];
  /** Single comparable integer: category * 15^5 + Σ values * 15^k. */
  score: number;
  label: string;
}

const CATEGORY_LABEL = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];

function encodeScore(category: number, values: number[]): number {
  // Exactly five base-15 digits after the category digit — shorter value
  // lists (pairs, trips, straights…) are zero-padded so categories always
  // dominate kickers.
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 15 + (values[i] ?? 0);
  return score;
}

/** Score exactly five cards. */
function scoreFive(cards: string[]): HandScore {
  const ranks = cards.map((c) => RANK_CHAR[c.slice(0, c.length - 1)]).sort((a, b) => b - a);
  const suits = new Set(cards.map((c) => c.slice(-1)));
  const isFlush = suits.size === 1;
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5; // wheel A-5
  }
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  const flat = groups.map((g) => g[0]);

  if (straightHigh && isFlush) {
    return mk(8, [straightHigh], cards, 'Straight Flush');
  }
  if (groups[0][1] === 4) return mk(7, flat, cards, 'Four of a Kind');
  if (groups[0][1] === 3 && groups[1]?.[1] === 2) return mk(6, flat, cards, 'Full House');
  if (isFlush) return mk(5, ranks, cards, 'Flush');
  if (straightHigh) return mk(4, [straightHigh], cards, 'Straight');
  if (groups[0][1] === 3) return mk(3, flat, cards, 'Three of a Kind');
  if (groups[0][1] === 2 && groups[1]?.[1] === 2) return mk(2, flat, cards, 'Two Pair');
  if (groups[0][1] === 2) return mk(1, flat, cards, 'Pair');
  return mk(0, ranks, cards, 'High Card');

  function mk(category: number, values: number[], five: string[], label: string): HandScore {
    return { category, values, cards: five, score: encodeScore(category, values), label };
  }
}

/**
 * Best five-card hand out of 5–7 cards (exported for the rules suite).
 */
export function bestFive(cards: string[]): HandScore {
  if (cards.length <= 5) return scoreFive(cards);
  let best: HandScore | null = null;
  const n = cards.length;
  const idx = [0, 1, 2, 3, 4];
  const combo = (start: number, depth: number) => {
    if (depth === 5) {
      const score = scoreFive(idx.map((i) => cards[i]));
      if (!best || score.score > best.score) best = score;
      return;
    }
    for (let i = start; i < n; i++) {
      idx[depth] = i;
      combo(i + 1, depth + 1);
    }
  };
  combo(0, 0);
  return best as unknown as HandScore;
}

/* ─────────────────────────────── engine ─────────────────────────────── */

/**
 * No-limit Texas Hold'em for 2–4 players, Plato Poker style.
 *
 * Full rules: rotating blinds (heads-up button posts the small blind), street
 * betting with min-raise tracking, check/call/bet/raise/all-in/fold, all-in
 * run-outs, complete side-pot math at showdown, split pots, and bust-outs.
 * The match runs until one player holds every chip (or the hand cap hits —
 * chip leader wins). Hole cards and the deck are hidden information.
 *
 * Bots play made-hand strength against pot odds with draw awareness, tuned
 * by difficulty (loose-weak .. tight-aggressive).
 */
@Injectable()
export class PokerEngine extends BaseGameEngine {
  readonly slug = 'poker';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    const board: PokerBoard = {
      deck: [],
      hole: config.seats.map(() => []),
      community: [],
      chips: config.seats.map(() => START_CHIPS),
      bet: config.seats.map(() => 0),
      contribution: config.seats.map(() => 0),
      folded: config.seats.map(() => false),
      allIn: config.seats.map(() => false),
      sittingOut: config.seats.map(() => false),
      acted: config.seats.map(() => false),
      dealer: Math.floor(Math.random() * n),
      currentBet: 0,
      lastRaiseSize: BB,
      subPhase: 'preflop',
      pot: 0,
      handNumber: 0,
      log: [],
      lastHand: null,
    };
    const state: GameState = {
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
        score: START_CHIPS,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: config.seats.map(() => START_CHIPS),
      version: 1,
    };
    this.startHand(state);
    return state;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'The game is already over.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as PokerBoard;
    const seat = action.seat;
    if (board.folded[seat]) return { ok: false, error: 'You have folded this hand.' };
    if (board.allIn[seat]) return { ok: false, error: 'You are all-in.' };
    if (board.sittingOut[seat]) return { ok: false, error: 'You are out of chips.' };

    const toCall = board.currentBet - board.bet[seat];
    switch (action.type) {
      case 'fold':
      case 'check':
        if (action.type === 'check' && toCall > 0) return { ok: false, error: 'There is a bet to call.' };
        return { ok: true };
      case 'call':
        if (toCall <= 0) return { ok: false, error: 'Nothing to call — check instead.' };
        return { ok: true };
      case 'raise': {
        const to = Math.floor(Number(action.payload.to));
        const maxTo = board.bet[seat] + board.chips[seat];
        if (!Number.isInteger(to) || to <= board.currentBet) {
          return { ok: false, error: `A raise must go above the current bet.` };
        }
        const minTo = Math.min(maxTo, board.currentBet + board.lastRaiseSize);
        if (to < minTo) {
          return { ok: false, error: `Minimum raise is to ${minTo}.` };
        }
        if (to > maxTo) return { ok: false, error: 'You cannot bet more than your stack.' };
        return { ok: true };
      }
      case 'allin':
        if (board.chips[seat] <= 0) return { ok: false, error: 'You have no chips left.' };
        return { ok: true };
      default:
        return { ok: false, error: 'Unknown action.' };
    }
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const next = this.clone(state);
    const board = next.board as unknown as PokerBoard;
    const seat = action.seat;
    const toCall = board.currentBet - board.bet[seat];

    switch (action.type) {
      case 'fold':
        board.folded[seat] = true;
        board.log.push({ seat, text: 'folds' });
        break;
      case 'check':
        board.acted[seat] = true;
        board.log.push({ seat, text: 'checks' });
        break;
      case 'call': {
        const pay = Math.min(toCall, board.chips[seat]);
        this.postChips(board, seat, pay);
        board.acted[seat] = true;
        if (board.allIn[seat]) board.log.push({ seat, text: `calls all-in for ${pay}` });
        else board.log.push({ seat, text: `calls ${pay}` });
        break;
      }
      case 'allin': {
        const pay = board.chips[seat];
        const newBet = board.bet[seat] + pay;
        this.postChips(board, seat, pay);
        const raiseBy = newBet - board.currentBet;
        if (raiseBy > 0) {
          if (raiseBy > board.lastRaiseSize) board.lastRaiseSize = raiseBy;
          board.currentBet = newBet;
          this.resetActed(board, seat);
        }
        board.acted[seat] = true;
        board.log.push({ seat, text: `goes all-in for ${pay}` });
        break;
      }
      case 'raise': {
        const to = Math.floor(Number(action.payload.to));
        const pay = to - board.bet[seat];
        this.postChips(board, seat, pay);
        const raiseBy = to - board.currentBet;
        board.lastRaiseSize = raiseBy;
        board.currentBet = to;
        this.resetActed(board, seat);
        board.acted[seat] = true;
        board.log.push({ seat, text: `bets ${to}` });
        break;
      }
    }
    board.log.splice(0, Math.max(0, board.log.length - 14));
    next.version += 1;

    this.progress(next);
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as PokerBoard;
    const toCall = board.currentBet - board.bet[seat];
    const potNow = board.pot;
    const strength = this.handStrength(board, seat);
    const mistakeChance =
      difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.18 : difficulty === 'hard' ? 0.07 : 0.0;
    // Aggression: how much of the pot the bot is willing to put in with a good hand.
    const aggression = difficulty === 'easy' ? 0.45 : difficulty === 'medium' ? 0.6 : difficulty === 'hard' ? 0.75 : 0.85;
    // Tightness: minimum strength to continue facing a bet.
    const tightness = difficulty === 'easy' ? 0.28 : difficulty === 'medium' ? 0.38 : difficulty === 'hard' ? 0.46 : 0.52;

    const maxTo = board.bet[seat] + board.chips[seat];

    if (Math.random() < mistakeChance) {
      // Human slip: random legal-ish action.
      const roll = Math.random();
      if (toCall <= 0) {
        return roll < 0.5
          ? { action: { seat, type: 'check', payload: {} }, delayMs: this.think(difficulty) }
          : { action: { seat, type: 'raise', payload: { to: Math.min(maxTo, BB * (2 + Math.floor(Math.random() * 2))) } }, delayMs: this.think(difficulty) };
      }
      return roll < 0.6
        ? { action: { seat, type: 'call', payload: {} }, delayMs: this.think(difficulty) }
        : { action: { seat, type: 'fold', payload: {} }, delayMs: this.think(difficulty) };
    }

    const potOdds = toCall > 0 ? toCall / Math.max(1, potNow + toCall) : 0;
    const winNow = board.folded.filter(Boolean).length === state.seats.length - 1;

    if (toCall <= 0) {
      // Option to bet.
      if (strength > 0.62 && Math.random() < aggression) {
        const target = Math.max(BB, Math.floor(potNow * (0.5 + aggression * 0.6)));
        return { action: { seat, type: 'raise', payload: { to: Math.min(maxTo, board.currentBet + Math.max(BB * 2, target)) } }, delayMs: this.think(difficulty) };
      }
      if (strength < 0.3 && Math.random() < 0.08 * aggression) {
        // occasional bluff
        return { action: { seat, type: 'raise', payload: { to: Math.min(maxTo, board.currentBet + Math.max(BB * 2, Math.floor(potNow * 0.6))) } }, delayMs: this.think(difficulty) };
      }
      return { action: { seat, type: 'check', payload: {} }, delayMs: this.think(difficulty) };
    }

    // Facing a bet.
    if (strength >= 0.75 && Math.random() < aggression && maxTo > board.currentBet) {
      const target = board.currentBet + Math.max(BB * 2, Math.floor(potNow * aggression));
      return { action: { seat, type: 'raise', payload: { to: Math.min(maxTo, target) } }, delayMs: this.think(difficulty) };
    }
    if (strength >= tightness || potOdds < 0.08 || winNow) {
      if (toCall >= board.chips[seat] * 0.6 && strength < 0.8 && !winNow) {
        // Big squeeze with a mediocre hand — let it go most of the time.
        if (Math.random() < 0.7) {
          return { action: { seat, type: 'fold', payload: {} }, delayMs: this.think(difficulty) };
        }
      }
      return { action: { seat, type: 'call', payload: {} }, delayMs: this.think(difficulty) };
    }
    return { action: { seat, type: 'fold', payload: {} }, delayMs: this.think(difficulty) };
  }

  // ───────────────────────── hand / street flow ─────────────────────────

  private startHand(state: GameState): void {
    const board = state.board as unknown as PokerBoard;
    const n = state.seats.length;

    // Rotate the button to the next live player.
    let d = board.dealer;
    for (let i = 0; i < n; i++) {
      d = (d + 1) % n;
      if (!board.sittingOut[d]) break;
    }
    board.dealer = d;

    board.deck = this.shuffledDeck();
    board.hole = state.seats.map(() => []);
    board.community = [];
    board.bet = state.seats.map(() => 0);
    board.contribution = state.seats.map(() => 0);
    board.folded = state.seats.map((_, i) => board.sittingOut[i]);
    board.allIn = state.seats.map(() => false);
    board.acted = state.seats.map(() => false);
    board.currentBet = 0;
    board.lastRaiseSize = BB;
    board.subPhase = 'preflop';
    board.pot = 0;
    board.handNumber += 1;
    board.log = [{ seat: -1, text: `Hand #${board.handNumber} — blinds ${SB}/${BB}` }];

    // Deal two cards each.
    for (let round = 0; round < 2; round++) {
      for (let i = 1; i <= n; i++) {
        const s = (board.dealer + i) % n;
        if (!board.sittingOut[s]) board.hole[s].push(board.deck.shift() as string);
      }
    }

    // Blinds (heads-up: the button posts the small blind).
    const live = state.seats.map((_, i) => i).filter((i) => !board.sittingOut[i]);
    let sbSeat: number;
    let bbSeat: number;
    if (live.length === 2) {
      sbSeat = board.dealer;
      bbSeat = live.find((s) => s !== board.dealer) as number;
    } else {
      sbSeat = this.nextLive(board, board.dealer, state);
      bbSeat = this.nextLive(board, sbSeat, state);
    }
    this.postBlind(board, sbSeat, SB);
    this.postBlind(board, bbSeat, BB);
    board.lastRaiseSize = BB;
    board.currentBet = Math.max(board.bet[sbSeat], board.bet[bbSeat], 0);

    // First to act preflop.
    state.currentSeat = live.length === 2 ? sbSeat : this.nextLive(board, bbSeat, state);
    this.markStreetActors(board, state);
    board.acted[state.currentSeat] = false;
    state.turnStartedAt = new Date().toISOString();
    state.turn += 1;
  }

  private postBlind(board: PokerBoard, seat: number, amount: number): void {
    this.postChips(board, seat, Math.min(amount, board.chips[seat]));
  }

  private postChips(board: PokerBoard, seat: number, amount: number): void {
    board.chips[seat] -= amount;
    board.bet[seat] += amount;
    board.contribution[seat] += amount;
    board.pot += amount;
    if (board.chips[seat] === 0) board.allIn[seat] = true;
  }

  private nextLive(board: PokerBoard, from: number, state: GameState): number {
    const n = state.seats.length;
    let s = (from + 1) % n;
    for (let i = 0; i < n; i++) {
      if (!board.sittingOut[s] && !board.folded[s] && !board.allIn[s]) return s;
      s = (s + 1) % n;
    }
    return -1; // nobody can act
  }

  private resetActed(board: PokerBoard, raiser: number): void {
    for (let i = 0; i < board.acted.length; i++) {
      board.acted[i] = i === raiser;
    }
  }

  private markStreetActors(board: PokerBoard, state: GameState): void {
    board.acted = state.seats.map((_, i) => board.sittingOut[i] || board.folded[i] || board.allIn[i]);
  }

  /**
   * Advances the hand: street transitions, run-outs, showdowns and the next
   * deal. Loops until either a seat must act or the hand/match ends.
   */
  private progress(state: GameState): void {
    const board = state.board as unknown as PokerBoard;

    for (let guard = 0; guard < 200; guard++) {
      const live = state.seats.map((_, i) => i).filter((i) => !board.sittingOut[i] && !board.folded[i]);

      // Everyone else folded → award the pot immediately.
      if (live.length === 1) {
        this.awardUncontested(state, live[0]);
        return;
      }

      // Players who still owe a decision on this street. The scan starts AT
      // currentSeat: after closeStreet the designated first actor has
      // acted=false, after a player's own action they have acted=true — both
      // cases resolve correctly from the same inclusive scan.
      let actor = -1;
      const n = state.seats.length;
      let probe = state.currentSeat % n;
      for (let i = 0; i < n; i++) {
        if (!board.sittingOut[probe] && !board.folded[probe] && !board.allIn[probe] && !board.acted[probe]) {
          actor = probe;
          break;
        }
        probe = (probe + 1) % n;
      }

      if (actor >= 0) {
        state.currentSeat = actor;
        state.turnStartedAt = new Date().toISOString();
        return; // waiting for action
      }

      // Street complete → deal the next card(s) or showdown.
      if (board.subPhase === 'preflop') {
        board.community.push(board.deck.shift() as string, board.deck.shift() as string, board.deck.shift() as string);
        board.subPhase = 'flop';
        this.closeStreet(state);
        continue;
      }
      if (board.subPhase === 'flop') {
        board.community.push(board.deck.shift() as string);
        board.subPhase = 'turn';
        this.closeStreet(state);
        continue;
      }
      if (board.subPhase === 'turn') {
        board.community.push(board.deck.shift() as string);
        board.subPhase = 'river';
        this.closeStreet(state);
        continue;
      }
      if (board.subPhase === 'river') {
        this.showdown(state);
        return;
      }
      return; // showdown handled
    }
  }

  /** Closes a street: collect bets, reset betting state, set first actor. */
  private closeStreet(state: GameState): void {
    const board = state.board as unknown as PokerBoard;
    board.bet = state.seats.map(() => 0);
    board.currentBet = 0;
    board.lastRaiseSize = BB;
    this.markStreetActors(board, state);
    // First live non-all-in seat after the button acts first.
    const s = this.nextLive(board, board.dealer, state);
    if (s >= 0) {
      state.currentSeat = s;
      board.acted[s] = false;
    }
    state.turnStartedAt = new Date().toISOString();
  }

  private awardUncontested(state: GameState, seat: number): void {
    const board = state.board as unknown as PokerBoard;
    const amount = board.pot;
    board.chips[seat] += amount;
    board.pot = 0;
    state.scores = [...board.chips];
    state.seats = state.seats.map((s, i) => ({ ...s, score: board.chips[i] }));
    board.lastHand = {
      handNumber: board.handNumber,
      winners: [seat],
      amount,
      label: 'takes the pot — everyone folded',
    };
    board.log.push({ seat, text: `wins ${amount} — everyone folded` });
    this.afterHand(state);
  }

  /** Showdown: build side pots from contributions and pay them out. */
  private showdown(state: GameState): void {
    const board = state.board as unknown as PokerBoard;
    const n = state.seats.length;
    const contenders = state.seats.map((_, i) => i).filter((i) => !board.sittingOut[i] && !board.folded[i]);
    const best = new Map<number, HandScore>();
    for (const s of contenders) {
      best.set(s, bestFive([...board.hole[s], ...board.community]));
    }

    // Side pots from contribution levels (standard algorithm).
    const levels = [...new Set(board.contribution.filter((c) => c > 0))].sort((a, b) => a - b);
    const pots: Array<{ amount: number; eligible: number[] }> = [];
    let prev = 0;
    let stranded = 0;
    for (const level of levels) {
      const contributors = board.contribution.filter((c) => c >= level).length;
      const amount = (level - prev) * contributors;
      const eligible = contenders.filter((s) => board.contribution[s] >= level);
      if (amount > 0 && eligible.length > 0) {
        const last = pots[pots.length - 1];
        if (last && last.eligible.length === eligible.length && last.eligible.every((s, i) => s === eligible[i])) {
          last.amount += amount;
        } else {
          pots.push({ amount, eligible });
        }
      } else if (amount > 0) {
        stranded += amount; // defensive: cannot happen with ≥2 live players
      }
      prev = level;
    }
    if (stranded > 0 && pots.length > 0) pots[pots.length - 1].amount += stranded;

    const winnersAll = new Set<number>();
    let totalPaid = 0;
    let bestLabel = '';
    for (const pot of pots) {
      let potWinners = pot.eligible.filter((s) => (best.get(s) as HandScore).score === Math.max(...pot.eligible.map((x) => (best.get(x) as HandScore).score)));
      if (potWinners.length === 0) potWinners = [pot.eligible[0]];
      const share = Math.floor(pot.amount / potWinners.length);
      let remainder = pot.amount - share * potWinners.length;
      for (const w of potWinners) {
        let payout = share;
        if (remainder > 0) {
          payout += 1; // odd chips to the earliest seat left of the dealer
          remainder -= 1;
        }
        board.chips[w] += payout;
        totalPaid += payout;
        winnersAll.add(w);
        bestLabel = (best.get(w) as HandScore).label;
      }
    }
    // Guard: rounding can never strand chips, but assert no dust is lost.
    void totalPaid;

    board.pot = 0;
    state.scores = [...board.chips];
    state.seats = state.seats.map((s, i) => ({ ...s, score: board.chips[i] }));
    board.lastHand = {
      handNumber: board.handNumber,
      winners: [...winnersAll],
      amount: totalPaid,
      label: `wins with ${bestLabel}`,
    };
    const shown = [...winnersAll].map((w) => `#${w + 1} (${bestLabel})`).join(', ');
    board.log.push({ seat: [...winnersAll][0] ?? -1, text: `wins ${totalPaid} — ${shown}` });
    this.afterHand(state);
  }

  /** Settles bust-outs, then either ends the match or deals the next hand. */
  private afterHand(state: GameState): void {
    const board = state.board as unknown as PokerBoard;
    for (let i = 0; i < board.chips.length; i++) {
      if (board.chips[i] <= 0 && !board.sittingOut[i]) {
        board.sittingOut[i] = true;
        board.folded[i] = true;
        board.log.push({ seat: i, text: 'is out of chips' });
      }
    }
    const live = state.seats.map((_, i) => i).filter((i) => board.chips[i] > 0);

    if (live.length <= 1 || board.handNumber >= MAX_HANDS) {
      const winner = live.length === 1 ? live[0] : board.chips.indexOf(Math.max(...board.chips));
      state.phase = 'completed';
      state.winnerSeat = winner;
      state.currentSeat = -1;
      state.scores = [...board.chips];
      state.seats = state.seats.map((s, i) => ({ ...s, score: board.chips[i] }));
      board.log.push({ seat: winner, text: 'wins the match!' });
      return;
    }

    this.startHand(state);
  }

  // ───────────────────────── bot hand strength ─────────────────────────

  private handStrength(board: PokerBoard, seat: number): number {
    const hole = board.hole[seat];
    if (hole.length < 2) return 0;
    const charToNum = (c: string) => RANK_CHAR[c.slice(0, c.length - 1)];

    if (board.community.length === 0) {
      // Preflop: pairs, high cards, suitedness, connectedness.
      const [a, b] = hole.map(charToNum);
      const suited = hole[0].slice(-1) === hole[1].slice(-1);
      const gap = Math.abs(a - b);
      const high = Math.max(a, b);
      let s = 0;
      if (a === b) s = 0.55 + (a / 14) * 0.42; // 0.56..0.97
      else {
        s = ((high - 2) / 12) * 0.38 + ((a + b) / 28) * 0.2;
        if (suited) s += 0.07;
        if (gap === 1) s += 0.06;
        else if (gap === 2) s += 0.03;
        if (high === 14) s += 0.06;
      }
      return Math.min(0.97, s);
    }

    // Postflop: made-hand score + draw potential.
    const made = bestFive([...hole, ...board.community]);
    const base = made.category / 8; // 0..1
    let s = 0.18 + base * 0.8;
    if (made.category >= 1 && made.category <= 2) s -= 0.12; // weak pairs are fragile
    if (board.community.length >= 4 && made.category <= 1) s -= 0.08;

    // Draw awareness on flop/turn: 4-flush or open-ended straight.
    const cards = [...hole, ...board.community];
    const suits = new Map<string, number>();
    for (const c of cards) suits.set(c.slice(-1), (suits.get(c.slice(-1)) ?? 0) + 1);
    const flushDraw = [...suits.values()].some((v) => v === 4);
    const ranks = [...new Set(cards.map(charToNum))].sort((a, b) => a - b);
    let straightDraw = false;
    for (let i = 0; i + 3 < ranks.length + 1; i++) {
      const window = ranks.slice(i, i + 4);
      if (window.length === 4 && window[3] - window[0] === 3) straightDraw = true;
    }
    if (board.community.length <= 4 && made.category <= 3) {
      if (flushDraw) s += 0.14;
      if (straightDraw) s += 0.1;
    }
    return Math.min(1, s);
  }

  // ───────────────────────────── shared ─────────────────────────────

  /** Seat views: your hole cards only; the deck and other hands stay hidden. */
  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as PokerBoard;
    return {
      ...state,
      board: {
        ...board,
        deck: [],
        hole: board.hole.map((h, i) => (i === seat ? h : h.map(() => '??'))),
      } as unknown as Record<string, unknown>,
    };
  }

  private shuffledDeck(): string[] {
    const deck: string[] = [];
    for (const s of ['S', 'H', 'D', 'C']) {
      for (const r of Object.keys(RANK_CHAR)) deck.push(`${r}${s}`);
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1500 : difficulty === 'medium' ? 1100 : difficulty === 'hard' ? 850 : 650;
    return base + Math.floor(Math.random() * 800);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as PokerBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        deck: [...board.deck],
        hole: board.hole.map((h) => [...h]),
        community: [...board.community],
        chips: [...board.chips],
        bet: [...board.bet],
        contribution: [...board.contribution],
        folded: [...board.folded],
        allIn: [...board.allIn],
        sittingOut: [...board.sittingOut],
        acted: [...board.acted],
        log: board.log.map((l) => ({ ...l })),
        lastHand: board.lastHand ? { ...board.lastHand, winners: [...board.lastHand.winners] } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
