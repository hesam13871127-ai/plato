import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/** Card ranks, lowest first. */
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
type Rank = (typeof RANKS)[number];
const SUITS = ['S', 'H', 'D', 'C'] as const;

interface GoFishBoard extends Record<string, unknown> {
  /** Server-only deck (the "pond"), index 0 = top. Stripped from client views. */
  deck: string[];
  /** Server-only hands, seat-indexed. Stripped from client views. */
  hands: string[][];
  /** Ranks each seat is known to hold, derived from public asks — public. */
  knownRanks: string[][];
  /** Laid-down books per seat: each entry is the rank of a completed set. */
  books: string[][];
  /** Latest public event, drives the board feed. */
  lastEvent: {
    seat: number;
    kind: 'ask_hit' | 'go_fish' | 'lucky_draw' | 'book' | 'empty_hand';
    rank: string;
    target?: number;
    received?: number;
  } | null;
}

/**
 * Classic Go Fish for 2–4 players.
 *
 * Seven cards each (five with 3–4 players). On your turn you ask one specific
 * opponent for a rank you already hold; if they have any, they must hand over
 * ALL of them and you ask again. If not — "go fish": you draw from the pond;
 * drawing the very rank you asked for lets you ask again, otherwise the turn
 * passes. Four of a kind makes a book and is laid down immediately. When the
 * thirteenth book hits the table the game is over — most books wins.
 *
 * Hands and the pond are hidden information: seat views carry only your own
 * hand, everyone sees books, pond size and the public ask history.
 */
@Injectable()
export class GoFishEngine extends BaseGameEngine {
  readonly slug = 'gofish';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const deck = this.shuffledDeck();
    const handSize = config.seats.length <= 2 ? 7 : 5;
    const hands: string[][] = config.seats.map(() => []);
    for (let n = 0; n < handSize; n++) {
      for (let s = 0; s < config.seats.length; s++) {
        hands[s].push(deck.shift() as string);
      }
    }
    // Sort hands for stable rendering.
    for (const hand of hands) this.sortHand(hand);

    const board: GoFishBoard = {
      deck,
      hands,
      knownRanks: config.seats.map(() => []),
      books: config.seats.map(() => []),
      lastEvent: null,
    };
    // Opening deals can already contain books (rare) — lay them down.
    for (let s = 0; s < config.seats.length; s++) this.layBooks(board, s);

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
        score: board.books[i].length,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: config.seats.map((_, i) => board.books[i].length),
      version: 1,
    };
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'The game is already over.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    if (action.type !== 'ask') return { ok: false, error: 'Unknown action.' };

    const board = state.board as unknown as GoFishBoard;
    const target = Number(action.payload.target);
    const rank = String(action.payload.rank ?? '');
    if (!Number.isInteger(target) || target < 0 || target >= state.seats.length || target === action.seat) {
      return { ok: false, error: 'Pick another player to ask.' };
    }
    if (!(RANKS as readonly string[]).includes(rank)) {
      return { ok: false, error: 'Pick a card rank.' };
    }
    if (!board.hands[action.seat].some((c) => this.rankOf(c) === rank)) {
      return { ok: false, error: 'You can only ask for a rank you are holding.' };
    }
    if (board.hands[target].length === 0) {
      return { ok: false, error: 'That player has no cards — pick someone else.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const next = this.clone(state);
    const board = next.board as unknown as GoFishBoard;
    const seat = action.seat;
    const target = Number(action.payload.target);
    const rank = String(action.payload.rank);
    let extraTurn = false;

    // Record the public knowledge: the asker holds this rank.
    if (!board.knownRanks[seat].includes(rank)) board.knownRanks[seat].push(rank);

    const taken = board.hands[target].filter((c) => this.rankOf(c) === rank);
    if (taken.length > 0) {
      board.hands[target] = board.hands[target].filter((c) => this.rankOf(c) !== rank);
      board.hands[seat].push(...taken);
      this.sortHand(board.hands[seat]);
      board.lastEvent = { seat, kind: 'ask_hit', rank, target, received: taken.length };
      extraTurn = true;
    } else {
      board.lastEvent = { seat, kind: 'go_fish', rank, target };
      if (board.deck.length > 0) {
        const drawn = board.deck.shift() as string;
        board.hands[seat].push(drawn);
        this.sortHand(board.hands[seat]);
        if (this.rankOf(drawn) === rank) {
          board.lastEvent = { seat, kind: 'lucky_draw', rank, target };
          extraTurn = true;
        }
      }
    }

    // Remove the rank from public knowledge of the target if they gave them all away.
    if (taken.length > 0 && !board.hands[target].some((c) => this.rankOf(c) === rank)) {
      board.knownRanks[target] = board.knownRanks[target].filter((r) => r !== rank);
    }

    this.layBooks(board, seat);
    next.scores = board.books.map((b) => b.length);
    next.seats = next.seats.map((s, i) => ({ ...s, score: next.scores[i] }));
    next.version += 1;

    // All thirteen books on the table? Game over.
    const totalBooks = board.books.reduce((a, b) => a + b.length, 0);
    if (totalBooks === RANKS.length) {
      this.finish(next);
      return next;
    }

    // Pond dry and nobody else holds cards — no legal ask remains.
    if (board.deck.length === 0 && state.seats.every((_, i) => i === seat || board.hands[i].length === 0)) {
      this.finish(next);
      return next;
    }

    // Asker out of cards: draw or pass (turn continues if they drew a card).
    if (board.hands[seat].length === 0) {
      if (board.deck.length > 0) {
        board.hands[seat].push(board.deck.shift() as string);
        this.sortHand(board.hands[seat]);
        board.lastEvent = { seat, kind: 'empty_hand', rank };
      } else {
        board.lastEvent = { seat, kind: 'empty_hand', rank };
        const advanced = this.nextSeatWithCards(board, seat, next);
        if (advanced === 'done') this.finish(next);
        return next;
      }
    }

    if (extraTurn) {
      next.turnStartedAt = new Date().toISOString(); // ask again
      return next;
    }

    const res = this.nextSeatWithCards(board, seat, next);
    if (res === 'done') this.finish(next);
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as GoFishBoard;
    const hand = board.hands[seat];

    const mistakeChance =
      difficulty === 'easy' ? 0.5 : difficulty === 'medium' ? 0.25 : difficulty === 'hard' ? 0.08 : 0.0;

    // Candidate asks: ranks in hand, targets holding cards.
    const targets = state.seats.map((_, i) => i).filter((i) => i !== seat && board.hands[i].length > 0);
    if (targets.length === 0 || hand.length === 0) {
      // Should not happen (engine refills hands); defensive single ask.
      return { action: { seat, type: 'ask', payload: { target: (seat + 1) % state.seats.length, rank: this.rankOf(hand[0] ?? '2S') } }, delayMs: 500 };
    }

    let rank: Rank = '2';
    let target: number = targets[0];
    if (Math.random() < mistakeChance) {
      rank = this.rankOf(hand[Math.floor(Math.random() * hand.length)]);
      target = targets[Math.floor(Math.random() * targets.length)];
    } else {
      // Ask for the rank we hold most of; prefer targets whose public asks
      // (knownRanks) match — that is real information.
      const counts = new Map<string, number>();
      for (const c of hand) counts.set(this.rankOf(c), (counts.get(this.rankOf(c)) ?? 0) + 1);
      let bestScore = -Infinity;
      for (const [r, n] of counts) {
        for (const t of targets) {
          const known = board.knownRanks[t].includes(r) ? 6 : 0;
          // Books are safe points — chasing 3-of-a-kind first is efficient.
          const score = n * 2 + known + Math.random();
          if (score > bestScore) {
            bestScore = score;
            rank = r as Rank;
            target = t;
          }
        }
      }
    }

    return {
      action: { seat, type: 'ask', payload: { target, rank } },
      delayMs: this.think(difficulty),
    };
  }

  // ── rules helpers ─────────────────────────────────────────────────────────

  private rankOf(card: string): Rank {
    return card.slice(0, card.length - 1) as Rank;
  }

  private shuffledDeck(): string[] {
    const deck: string[] = [];
    for (const s of SUITS) for (const r of RANKS) deck.push(`${r}${s}`);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  private sortHand(hand: string[]): void {
    hand.sort((a, b) => {
      const ra = RANKS.indexOf(this.rankOf(a) as Rank);
      const rb = RANKS.indexOf(this.rankOf(b) as Rank);
      return ra === rb ? a.localeCompare(b) : ra - rb;
    });
  }

  /** Auto-lays every completed book for the seat and records a public event. */
  private layBooks(board: GoFishBoard, seat: number): void {
    let changed = true;
    while (changed) {
      changed = false;
      const counts = new Map<string, string[]>();
      for (const c of board.hands[seat]) {
        const r = this.rankOf(c);
        const list = counts.get(r) ?? [];
        list.push(c);
        counts.set(r, list);
      }
      for (const [r, cards] of counts) {
        if (cards.length === 4) {
          board.hands[seat] = board.hands[seat].filter((c) => this.rankOf(c) !== r);
          board.books[seat].push(r);
          board.knownRanks[seat] = board.knownRanks[seat].filter((k) => k !== r);
          board.lastEvent = { seat, kind: 'book', rank: r };
          changed = true;
          break;
        }
      }
    }
  }

  /** Moves the turn to the next seat holding cards; 'done' when nobody can act. */
  private nextSeatWithCards(board: GoFishBoard, from: number, state: GameState): 'ok' | 'done' {
    const n = state.seats.length;
    // Nobody has cards and the pond is dry — finish by book count.
    if (board.deck.length === 0 && board.hands.every((h) => h.length === 0)) return 'done';
    let s = (from + 1) % n;
    for (let k = 0; k < n; k++) {
      if (board.hands[s].length > 0) break;
      s = (s + 1) % n;
    }
    // Everyone dry: if the pond still has cards, deal one to each dry seat.
    if (board.hands[s].length === 0) {
      let dealt = false;
      for (let i = 0; i < n; i++) {
        if (board.hands[i].length === 0 && board.deck.length > 0) {
          board.hands[i].push(board.deck.shift() as string);
          this.sortHand(board.hands[i]);
          dealt = true;
        }
      }
      if (!dealt) return 'done';
      s = board.hands.findIndex((h) => h.length > 0);
      if (s < 0) return 'done';
    }
    state.currentSeat = s;
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
    return 'ok';
  }

  private finish(state: GameState): void {
    const board = state.board as unknown as GoFishBoard;
    const books = board.books.map((b) => b.length);
    const max = Math.max(...books);
    const winner = books.indexOf(max);
    state.phase = 'completed';
    state.winnerSeat = winner;
    state.currentSeat = -1;
    state.scores = books;
    state.seats = state.seats.map((s, i) => ({ ...s, score: books[i] }));
  }

  /** Client views: your own hand only, plus everything public. */
  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as GoFishBoard;
    return {
      ...state,
      board: {
        deck: board.deck.length,
        hands: board.hands.map((h, i) => (i === seat ? h : h.map(() => '??'))),
        knownRanks: board.knownRanks,
        books: board.books,
        lastEvent: board.lastEvent,
      } as unknown as Record<string, unknown>,
    };
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1400 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 750 : 550;
    return base + Math.floor(Math.random() * 700);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as GoFishBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        deck: [...board.deck],
        hands: board.hands.map((h) => [...h]),
        knownRanks: board.knownRanks.map((r) => [...r]),
        books: board.books.map((b) => [...b]),
        lastEvent: board.lastEvent ? { ...board.lastEvent } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
