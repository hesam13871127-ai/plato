import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Card {
  id: string;
  rank: string; // 'A','2'..'10','J','Q','K'
  suit: 'S' | 'H' | 'D' | 'C';
}

interface FishEvent {
  seat: number;
  target: number;
  rank: string;
  got: number; // cards received from the target
  fished: boolean; // drew from the pond
  luckyDraw: boolean; // drew the asked rank → goes again
  booked: string | null; // rank completed this turn
}

interface FishBoard extends Record<string, unknown> {
  hands: Card[][];
  pond: Card[];
  books: string[][]; // per seat, ranks completed
  lastEvent: FishEvent | null;
  /** Server-only: per bot seat, ranks each other seat is known to hold (from asks). */
  memory: Record<number, Record<number, string[]>>;
}

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS: Card['suit'][] = ['S', 'H', 'D', 'C'];

/**
 * Go Fish for 2–4 players. On your turn ask another player for a rank you
 * hold; if they have any they hand them all over and you ask again, otherwise
 * you "go fish" from the pond (drawing the rank you asked for also lets you
 * go again). Four of a rank make a book. When the pond and every hand are
 * empty, most books wins. Bots remember what opponents asked for.
 */
@Injectable()
export class GoFishEngine extends BaseGameEngine {
  readonly slug = 'go_fish';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const deck = this.shuffledDeck();
    const n = config.seats.length;
    const per = n <= 2 ? 7 : 5;
    const hands: Card[][] = config.seats.map(() => []);
    for (let i = 0; i < per; i++) for (let s = 0; s < n; s++) hands[s].push(deck.pop()!);
    const board: FishBoard = {
      hands,
      pond: deck,
      books: config.seats.map(() => []),
      lastEvent: null,
      memory: {},
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
    // Books dealt straight from the deck count immediately.
    for (let s = 0; s < n; s++) this.collectBooks(state, s);
    return state;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    if (action.type !== 'ask') return { ok: false, error: 'Unknown action.' };
    const board = state.board as unknown as FishBoard;
    const target = Number(action.payload.target);
    const rank = String(action.payload.rank);
    if (!Number.isInteger(target) || target < 0 || target >= state.seats.length || target === action.seat) {
      return { ok: false, error: 'Choose another player to ask.' };
    }
    if (!RANKS.includes(rank)) return { ok: false, error: 'Choose a rank.' };
    if (!board.hands[action.seat].some((c) => c.rank === rank)) return { ok: false, error: 'You can only ask for a rank you hold.' };
    if (board.hands[target].length === 0) return { ok: false, error: 'That player has no cards.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as FishBoard;
    const seat = action.seat;
    const target = Number(action.payload.target);
    const rank = String(action.payload.rank);
    next.version += 1;

    // Everyone learns the asker holds this rank.
    this.remember(board, seat, rank);

    const matching = board.hands[target].filter((c) => c.rank === rank);
    let goAgain = false;
    let fished = false;
    let luckyDraw = false;
    if (matching.length > 0) {
      board.hands[target] = board.hands[target].filter((c) => c.rank !== rank);
      board.hands[seat].push(...matching);
      this.forget(board, target, rank);
      goAgain = true;
    } else {
      fished = true;
      const drawn = board.pond.pop();
      if (drawn) {
        board.hands[seat].push(drawn);
        if (drawn.rank === rank) {
          luckyDraw = true;
          goAgain = true;
        }
      }
    }
    const booked = this.collectBooks(next, seat);
    board.lastEvent = { seat, target, rank, got: matching.length, fished, luckyDraw, booked };

    if (this.isOver(board)) {
      this.finish(next);
      return next;
    }

    // A player with an empty hand draws from the pond (if any) before acting.
    if (board.hands[seat].length === 0) {
      const drawn = board.pond.pop();
      if (drawn) board.hands[seat].push(drawn);
    }
    if (!goAgain || board.hands[seat].length === 0) {
      next.currentSeat = this.nextSeatWithCards(board, seat);
      next.turn += 1;
    }
    // Sanity: if the seat to move somehow has nothing to ask, top up or skip.
    if (board.hands[next.currentSeat].length === 0) {
      const drawn = board.pond.pop();
      if (drawn) board.hands[next.currentSeat].push(drawn);
      else next.currentSeat = this.nextSeatWithCards(board, next.currentSeat);
    }
    if (this.isOver(board) || !this.someoneCanBeAsked(board, next.currentSeat)) {
      this.finish(next);
      return next;
    }
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as FishBoard;
    const hand = board.hands[seat];
    const targets = state.seats.map((_, i) => i).filter((i) => i !== seat && board.hands[i].length > 0);
    const ranks = [...new Set(hand.map((c) => c.rank))];
    const smart = difficulty === 'easy' ? 0.3 : difficulty === 'medium' ? 0.65 : difficulty === 'hard' ? 0.9 : 1;

    let pick: { target: number; rank: string } | null = null;
    if (Math.random() < smart) {
      // Ask someone known to hold one of our ranks; prefer ranks we hold most of.
      const known = board.memory[seat] ?? {};
      const byCount = ranks.sort((a, b) => hand.filter((c) => c.rank === b).length - hand.filter((c) => c.rank === a).length);
      for (const rank of byCount) {
        const t = targets.find((i) => (known[i] ?? []).includes(rank));
        if (t !== undefined) {
          pick = { target: t, rank };
          break;
        }
      }
      if (!pick) {
        // Ask for the rank we hold most of, from the player with most cards.
        const rank = byCount[0];
        const t = [...targets].sort((a, b) => board.hands[b].length - board.hands[a].length)[0];
        pick = { target: t, rank };
      }
    } else {
      pick = { target: targets[Math.floor(Math.random() * targets.length)], rank: ranks[Math.floor(Math.random() * ranks.length)] };
    }
    const base = difficulty === 'easy' ? 1500 : difficulty === 'medium' ? 1200 : 950;
    return { action: { seat, type: 'ask', payload: pick }, delayMs: base + Math.floor(Math.random() * 900) };
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as FishBoard;
    return {
      ...state,
      board: {
        hand: seat >= 0 && seat < board.hands.length ? board.hands[seat] : null,
        handSizes: board.hands.map((h) => h.length),
        pondCount: board.pond.length,
        books: board.books,
        lastEvent: board.lastEvent,
        ranks: RANKS,
      },
    };
  }

  // ── Rules ─────────────────────────────────────────────────────────────────

  private shuffledDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) for (const rank of RANKS) deck.push({ id: `${rank}${suit}`, rank, suit });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  /** Moves any complete four-of-a-rank out of the hand into books. Returns the last booked rank. */
  private collectBooks(state: GameState, seat: number): string | null {
    const board = state.board as unknown as FishBoard;
    let booked: string | null = null;
    for (const rank of RANKS) {
      if (board.hands[seat].filter((c) => c.rank === rank).length === 4) {
        board.hands[seat] = board.hands[seat].filter((c) => c.rank !== rank);
        board.books[seat].push(rank);
        booked = rank;
        this.forget(board, seat, rank);
      }
    }
    state.scores[seat] = board.books[seat].length;
    state.seats[seat].score = board.books[seat].length;
    return booked;
  }

  private isOver(board: FishBoard): boolean {
    const totalBooks = board.books.reduce((a, b) => a + b.length, 0);
    if (totalBooks >= RANKS.length) return true;
    return board.pond.length === 0 && board.hands.every((h) => h.length === 0);
  }

  private someoneCanBeAsked(board: FishBoard, seat: number): boolean {
    return board.hands[seat].length > 0 && board.hands.some((h, i) => i !== seat && h.length > 0);
  }

  private nextSeatWithCards(board: FishBoard, from: number): number {
    const n = board.hands.length;
    for (let k = 1; k <= n; k++) {
      const s = (from + k) % n;
      if (board.hands[s].length > 0 || board.pond.length > 0) return s;
    }
    return (from + 1) % n;
  }

  private remember(board: FishBoard, holder: number, rank: string): void {
    for (let bot = 0; bot < board.hands.length; bot++) {
      if (bot === holder) continue;
      const mem = (board.memory[bot] ??= {});
      const list = (mem[holder] ??= []);
      if (!list.includes(rank)) list.push(rank);
    }
  }

  private forget(board: FishBoard, holder: number, rank: string): void {
    for (const key of Object.keys(board.memory)) {
      const mem = board.memory[Number(key)];
      if (mem[holder]) mem[holder] = mem[holder].filter((r) => r !== rank);
    }
  }

  private finish(state: GameState): void {
    const board = state.board as unknown as FishBoard;
    state.phase = 'completed';
    state.currentSeat = -1;
    state.scores = board.books.map((b) => b.length);
    const max = Math.max(...state.scores);
    const leaders = state.scores.map((s, i) => (s === max ? i : -1)).filter((i) => i >= 0);
    state.winnerSeat = leaders.length === 1 ? leaders[0] : null;
    state.winnerSeats = leaders;
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as FishBoard;
    const memory: FishBoard['memory'] = {};
    for (const key of Object.keys(board.memory)) {
      const inner = board.memory[Number(key)];
      memory[Number(key)] = Object.fromEntries(Object.entries(inner).map(([k, v]) => [k, [...v]]));
    }
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        hands: board.hands.map((h) => [...h]),
        pond: [...board.pond],
        books: board.books.map((b) => [...b]),
        lastEvent: board.lastEvent,
        memory,
      } as unknown as Record<string, unknown>,
    };
  }
}
