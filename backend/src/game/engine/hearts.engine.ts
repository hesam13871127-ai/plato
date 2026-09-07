import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

type Suit = 'C' | 'D' | 'H' | 'S';

interface Card {
  id: string; // e.g. "QS"
  rank: number; // 2..14 (A = 14)
  suit: Suit;
}

interface HeartsPlayer {
  hand: Card[];
  taken: Card[]; // cards captured this hand
  roundPoints: number;
  score: number;
  passed: Card[] | null; // cards chosen during the pass phase
}

interface HeartsBoard extends Record<string, unknown> {
  players: HeartsPlayer[];
  hand: number; // 1-based hand index
  phase: 'pass' | 'play' | 'scoring';
  passDirection: 'left' | 'right' | 'across' | 'none';
  trick: Array<{ seat: number; card: Card }>;
  leadSeat: number;
  heartsBroken: boolean;
  trickNumber: number;
  lastTrick: { winner: number; cards: Array<{ seat: number; card: Card }>; points: number } | null;
  targetScore: number;
  log: string[];
  // Per-hand: who shot the moon (for the reveal).
  moonShooter: number | null;
  botDifficulty: Array<SeatInfo['botDifficulty']>;
}

const SUITS: Suit[] = ['C', 'D', 'H', 'S'];
const TARGET = 50;

function cardPoints(c: Card): number {
  if (c.suit === 'H') return 1;
  if (c.suit === 'S' && c.rank === 12) return 13;
  return 0;
}

/**
 * Hearts — the classic evasion trick-taking game for 2–4 players. Avoid
 * taking hearts (1 point each) and the Queen of Spades (13). Before each hand
 * you pass three cards (left, right, across, then no pass). Whoever holds the
 * lowest club leads it; you must follow suit if you can; hearts cannot be led
 * until they've been "broken" (discarded on another suit), and no points may
 * be dumped on the very first trick. Take *all* the points and you "shoot the
 * moon": everyone else gets 26 instead. First to 50 ends the game; lowest
 * score wins.
 *
 * With 3 players the 2♦ is removed (51 cards, 17 each); with 2 players a
 * 26-card deck (7 and up, 13 each) is used and passing is left/none.
 */
@Injectable()
export class HeartsEngine extends BaseGameEngine {
  readonly slug = 'hearts';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    const board: HeartsBoard = {
      players: config.seats.map(() => ({ hand: [], taken: [], roundPoints: 0, score: 0, passed: null })),
      hand: 0,
      phase: 'pass',
      passDirection: 'left',
      trick: [],
      leadSeat: 0,
      heartsBroken: false,
      trickNumber: 0,
      lastTrick: null,
      targetScore: TARGET,
      log: [],
      moonShooter: null,
      botDifficulty: config.seats.map((s) => s.botDifficulty ?? 'medium'),
    };
    const state: GameState = {
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
    this.deal(state, board, n);
    return state;
  }

  // ── Dealing ────────────────────────────────────────────────────────────────

  private buildDeck(n: number): Card[] {
    const deck: Card[] = [];
    const minRank = n === 2 ? 7 : 2;
    for (const suit of SUITS) {
      for (let rank = minRank; rank <= 14; rank++) {
        if (n === 3 && suit === 'D' && rank === 2) continue;
        deck.push({ id: `${this.rankChar(rank)}${suit}`, rank, suit });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  private rankChar(rank: number): string {
    return rank === 14 ? 'A' : rank === 13 ? 'K' : rank === 12 ? 'Q' : rank === 11 ? 'J' : rank === 10 ? 'T' : String(rank);
  }

  private deal(state: GameState, board: HeartsBoard, n: number): void {
    const deck = this.buildDeck(n);
    board.hand += 1;
    board.players.forEach((p) => {
      p.hand = [];
      p.taken = [];
      p.roundPoints = 0;
      p.passed = null;
    });
    deck.forEach((c, i) => board.players[i % n].hand.push(c));
    board.players.forEach((p) => this.sortHand(p.hand));
    board.trick = [];
    board.heartsBroken = false;
    board.trickNumber = 0;
    board.lastTrick = null;
    board.moonShooter = null;
    const cycle: HeartsBoard['passDirection'][] = n === 4 ? ['left', 'right', 'across', 'none'] : n === 3 ? ['left', 'right', 'none'] : ['left', 'none'];
    board.passDirection = cycle[(board.hand - 1) % cycle.length];
    if (board.passDirection === 'none') {
      this.startPlay(state, board);
    } else {
      board.phase = 'pass';
      state.currentSeat = this.firstUnpassed(board);
      board.log.unshift(`Hand ${board.hand}: pass three cards ${board.passDirection}.`);
      board.log = board.log.slice(0, 8);
    }
  }

  private sortHand(hand: Card[]): void {
    const order: Record<Suit, number> = { C: 0, D: 1, S: 2, H: 3 };
    hand.sort((a, b) => order[a.suit] - order[b.suit] || a.rank - b.rank);
  }

  private firstUnpassed(board: HeartsBoard): number {
    const i = board.players.findIndex((p) => p.passed === null);
    return i < 0 ? 0 : i;
  }

  private passOffset(board: HeartsBoard, n: number): number {
    switch (board.passDirection) {
      case 'left':
        return 1;
      case 'right':
        return n - 1;
      case 'across':
        return 2;
      default:
        return 0;
    }
  }

  private resolvePass(state: GameState, board: HeartsBoard): void {
    const n = board.players.length;
    const offset = this.passOffset(board, n);
    const outgoing = board.players.map((p) => p.passed ?? []);
    board.players.forEach((p, i) => {
      const chosen = new Set(outgoing[i].map((c) => c.id));
      p.hand = p.hand.filter((c) => !chosen.has(c.id));
    });
    board.players.forEach((_, i) => {
      const to = (i + offset) % n;
      board.players[to].hand.push(...outgoing[i]);
    });
    board.players.forEach((p) => {
      this.sortHand(p.hand);
      p.passed = null;
    });
    board.log.unshift('Cards passed. Lowest club leads.');
    board.log = board.log.slice(0, 8);
    this.startPlay(state, board);
  }

  private lowestClubHolder(board: HeartsBoard): { seat: number; card: Card } {
    let best: { seat: number; card: Card } | null = null;
    board.players.forEach((p, seat) => {
      for (const c of p.hand) {
        if (c.suit === 'C' && (!best || c.rank < best.card.rank)) best = { seat, card: c };
      }
    });
    if (best) return best;
    // No clubs at all (tiny 2-player edge case) — lowest card overall leads.
    let fallback: { seat: number; card: Card } | null = null;
    board.players.forEach((p, seat) => {
      for (const c of p.hand) if (!fallback || c.rank < fallback.card.rank) fallback = { seat, card: c };
    });
    return fallback!;
  }

  private startPlay(state: GameState, board: HeartsBoard): void {
    board.phase = 'play';
    board.trick = [];
    board.trickNumber = 1;
    const lead = this.lowestClubHolder(board);
    board.leadSeat = lead.seat;
    state.currentSeat = lead.seat;
    state.turnStartedAt = new Date().toISOString();
  }

  // ── Rules ──────────────────────────────────────────────────────────────────

  legalPlays(board: HeartsBoard, seat: number): Card[] {
    const p = board.players[seat];
    const hand = p.hand;
    if (board.trick.length === 0) {
      // Leading.
      if (board.trickNumber === 1) {
        const lowest = this.lowestClubHolder(board);
        if (lowest.seat === seat) return [lowest.card];
      }
      if (!board.heartsBroken) {
        const nonHearts = hand.filter((c) => c.suit !== 'H');
        if (nonHearts.length > 0) return nonHearts;
      }
      return hand;
    }
    const ledSuit = board.trick[0].card.suit;
    const follow = hand.filter((c) => c.suit === ledSuit);
    if (follow.length > 0) return follow;
    if (board.trickNumber === 1) {
      // No points on the first trick unless that's all you have.
      const safe = hand.filter((c) => cardPoints(c) === 0);
      if (safe.length > 0) return safe;
    }
    return hand;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    const board = state.board as unknown as HeartsBoard;
    const seat = action.seat;
    if (seat < 0 || seat >= board.players.length) return { ok: false, error: 'Not a seat.' };
    if (action.type === 'pass') {
      if (board.phase !== 'pass') return { ok: false, error: 'Passing is over.' };
      if (board.players[seat].passed !== null) return { ok: false, error: 'You already passed.' };
      const ids = Array.isArray(action.payload.cards) ? (action.payload.cards as unknown[]).map(String) : [];
      if (new Set(ids).size !== 3) return { ok: false, error: 'Pass exactly three different cards.' };
      const hand = board.players[seat].hand;
      if (!ids.every((id) => hand.some((c) => c.id === id))) return { ok: false, error: 'You do not hold those cards.' };
      return { ok: true };
    }
    if (action.type === 'play') {
      if (board.phase !== 'play') return { ok: false, error: 'Finish passing first.' };
      if (seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
      const id = String(action.payload.card ?? '');
      const card = board.players[seat].hand.find((c) => c.id === id);
      if (!card) return { ok: false, error: 'You do not hold that card.' };
      const legal = this.legalPlays(board, seat);
      if (!legal.some((c) => c.id === id)) {
        if (board.trick.length > 0) {
          const led = board.trick[0].card.suit;
          if (card.suit !== led && legal.every((c) => c.suit === led)) return { ok: false, error: `You must follow ${this.suitName(led)}.` };
        }
        if (board.trick.length === 0 && card.suit === 'H' && !board.heartsBroken) return { ok: false, error: 'Hearts have not been broken yet.' };
        if (board.trickNumber === 1) return { ok: false, error: board.trick.length === 0 ? 'The lowest club must lead the first trick.' : 'No points on the first trick.' };
        return { ok: false, error: 'That card cannot be played now.' };
      }
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  private suitName(s: Suit): string {
    return s === 'C' ? 'clubs' : s === 'D' ? 'diamonds' : s === 'H' ? 'hearts' : 'spades';
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as HeartsBoard;
    const seat = action.seat;
    next.version += 1;

    if (action.type === 'pass') {
      const ids = (action.payload.cards as unknown[]).map(String);
      board.players[seat].passed = board.players[seat].hand.filter((c) => ids.includes(c.id));
      if (board.players.every((p) => p.passed !== null)) {
        this.resolvePass(next, board);
      } else {
        next.currentSeat = this.firstUnpassed(board);
      }
      return next;
    }

    // play
    const id = String(action.payload.card);
    const player = board.players[seat];
    const card = player.hand.find((c) => c.id === id)!;
    player.hand = player.hand.filter((c) => c.id !== id);
    board.trick.push({ seat, card });
    if (card.suit === 'H' && !board.heartsBroken) {
      board.heartsBroken = true;
    }
    const n = board.players.length;
    if (board.trick.length < n) {
      next.currentSeat = (seat + 1) % n;
      next.turnStartedAt = new Date().toISOString();
      return next;
    }

    // Trick complete.
    const led = board.trick[0].card.suit;
    let winner = board.trick[0];
    for (const t of board.trick) {
      if (t.card.suit === led && t.card.rank > winner.card.rank) winner = t;
    }
    const points = board.trick.reduce((s, t) => s + cardPoints(t.card), 0);
    const w = board.players[winner.seat];
    w.taken.push(...board.trick.map((t) => t.card));
    w.roundPoints += points;
    board.lastTrick = { winner: winner.seat, cards: board.trick, points };
    if (points > 0) {
      board.log.unshift(`${next.seats[winner.seat].displayName} takes ${points} point${points === 1 ? '' : 's'}.`);
      board.log = board.log.slice(0, 8);
    }
    board.trick = [];
    board.leadSeat = winner.seat;
    board.trickNumber += 1;
    next.turn += 1;

    if (board.players.every((p) => p.hand.length === 0)) {
      this.scoreHand(next, board);
      return next;
    }
    next.currentSeat = winner.seat;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  private scoreHand(state: GameState, board: HeartsBoard): void {
    const n = board.players.length;
    const totalPoints = board.players.reduce((s, p) => s + p.roundPoints, 0);
    const shooter = board.players.findIndex((p) => p.roundPoints === totalPoints && totalPoints >= 26);
    if (shooter >= 0 && n > 1) {
      board.moonShooter = shooter;
      board.players.forEach((p, i) => {
        p.score += i === shooter ? 0 : 26;
      });
      board.log.unshift(`${state.seats[shooter].displayName} shot the moon! Everyone else +26.`);
    } else {
      board.players.forEach((p) => (p.score += p.roundPoints));
      board.log.unshift(`Hand ${board.hand} scored.`);
    }
    board.log = board.log.slice(0, 8);
    state.scores = board.players.map((p) => p.score);
    state.seats.forEach((s, i) => (s.score = board.players[i].score));

    if (board.players.some((p) => p.score >= board.targetScore)) {
      board.phase = 'scoring';
      state.phase = 'completed';
      state.currentSeat = -1;
      const best = Math.min(...board.players.map((p) => p.score));
      const winners = board.players.map((p, i) => (p.score === best ? i : -1)).filter((i) => i >= 0);
      state.winnerSeat = winners[0];
      state.winnerSeats = winners;
      // Leaderboard score: higher is better.
      state.scores = board.players.map((p) => Math.max(0, board.targetScore * 2 - p.score));
      state.seats.forEach((s, i) => (s.score = state.scores[i]));
      return;
    }
    this.deal(state, board, n);
  }

  // ── Bot ────────────────────────────────────────────────────────────────────

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as HeartsBoard;
    const player = board.players[seat];
    const think = (difficulty === 'easy' ? 1200 : 800) + Math.floor(Math.random() * 700);

    if (board.phase === 'pass') {
      // Pass the most dangerous cards: Q♠/A♠/K♠, then high hearts, then high cards.
      const danger = (c: Card): number => {
        if (c.suit === 'S' && c.rank >= 12) return 100 + c.rank;
        if (c.suit === 'H') return 50 + c.rank;
        return c.rank;
      };
      const chosen = [...player.hand].sort((a, b) => danger(b) - danger(a)).slice(0, 3);
      return { action: { seat, type: 'pass', payload: { cards: chosen.map((c) => c.id) } }, delayMs: think };
    }

    const legal = this.legalPlays(board, seat);
    if (legal.length === 1) return { action: { seat, type: 'play', payload: { card: legal[0].id } }, delayMs: think };

    const smart = difficulty === 'hard' || difficulty === 'expert';
    let pick: Card;
    if (board.trick.length === 0) {
      // Lead low; avoid leading spades if we hold high spades and Q♠ is out.
      const qOut = !board.players.some((p) => p.taken.some((c) => c.id === 'QS'));
      const candidates = legal.filter((c) => !(smart && qOut && c.suit === 'S' && c.rank >= 12));
      const pool = candidates.length ? candidates : legal;
      pick = pool.reduce((a, b) => (a.rank <= b.rank ? a : b));
    } else {
      const led = board.trick[0].card.suit;
      const following = legal.filter((c) => c.suit === led);
      const trickPoints = board.trick.reduce((s, t) => s + cardPoints(t.card), 0);
      const currentHigh = board.trick.filter((t) => t.card.suit === led).reduce((m, t) => Math.max(m, t.card.rank), 0);
      const lastToPlay = board.trick.length === board.players.length - 1;
      if (following.length > 0) {
        const under = following.filter((c) => c.rank < currentHigh);
        if (under.length > 0) {
          // Duck with the highest card that still loses.
          pick = under.reduce((a, b) => (a.rank >= b.rank ? a : b));
        } else if (lastToPlay && trickPoints === 0 && smart) {
          // Safe to take a pointless trick: win it with the highest card.
          pick = following.reduce((a, b) => (a.rank >= b.rank ? a : b));
        } else {
          // Forced to win: play the lowest winner to stay low later.
          pick = following.reduce((a, b) => (a.rank <= b.rank ? a : b));
        }
      } else {
        // Void: dump the Queen of Spades, then high hearts, then the highest card.
        const qs = legal.find((c) => c.id === 'QS');
        if (qs) pick = qs;
        else {
          const hearts = legal.filter((c) => c.suit === 'H');
          pick = (hearts.length ? hearts : legal).reduce((a, b) => (a.rank >= b.rank ? a : b));
        }
      }
    }
    if (difficulty === 'easy' && Math.random() < 0.3) pick = legal[Math.floor(Math.random() * legal.length)];
    return { action: { seat, type: 'play', payload: { card: pick.id } }, delayMs: think };
  }

  /** During the pass phase every unpassed seat may act at once. */
  canSeatAct(state: GameState, action: GameAction): boolean {
    if (state.phase !== 'in_progress') return false;
    const board = state.board as unknown as HeartsBoard;
    if (board.phase === 'pass') return action.type === 'pass' && board.players[action.seat]?.passed === null;
    return state.currentSeat === action.seat;
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as HeartsBoard;
    const me = seat >= 0 && seat < board.players.length ? board.players[seat] : null;
    return {
      ...state,
      board: {
        phase: board.phase,
        hand: board.hand,
        passDirection: board.passDirection,
        trick: board.trick,
        leadSeat: board.leadSeat,
        heartsBroken: board.heartsBroken,
        trickNumber: board.trickNumber,
        lastTrick: board.lastTrick,
        targetScore: board.targetScore,
        log: board.log,
        moonShooter: board.moonShooter,
        myHand: me ? me.hand : null,
        myPassed: me ? me.passed : null,
        legal: me && state.phase === 'in_progress' && board.phase === 'play' && state.currentSeat === seat ? this.legalPlays(board, seat).map((c) => c.id) : [],
        players: board.players.map((p) => ({
          handSize: p.hand.length,
          roundPoints: p.roundPoints,
          score: p.score,
          passed: p.passed !== null,
          takenCount: p.taken.length,
          heartsTaken: p.taken.filter((c) => c.suit === 'H').length,
          hasQueen: p.taken.some((c) => c.id === 'QS'),
        })),
      },
    };
  }

  private clone(state: GameState): GameState {
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: JSON.parse(JSON.stringify(state.board)) as Record<string, unknown>,
    };
  }
}
