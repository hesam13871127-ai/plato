import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Card {
  id: string; // e.g. '3D', '10S'
  rank: string; // '3'..'10','J','Q','K','A','2'
  suit: 'D' | 'C' | 'H' | 'S';
}

type ComboKind = 'single' | 'pair' | 'triple' | 'straight' | 'flush' | 'full_house' | 'four_kind' | 'straight_flush';

interface Combo {
  kind: ComboKind;
  size: number;
  cards: Card[];
  /** Primary strength (rank value of the deciding card / group). */
  value: number;
  /** Suit strength of the deciding card (for ties). */
  suit: number;
  /** Five-card category order: straight 0 … straight flush 4. */
  category: number;
}

interface Play {
  seat: number;
  combo: Combo | null; // null = pass
}

interface BigTwoBoard extends Record<string, unknown> {
  hands: Card[][]; // server-only — redacted per seat
  handSizes: number[];
  /** Cards + combo currently on the table (the play to beat), or null for a free lead. */
  tableCombo: Combo | null;
  tableSeat: number | null;
  /** Consecutive passes since the last real play. */
  passes: number;
  history: Play[]; // last few plays for the client to animate
  finished: number[]; // seats in finishing order
  firstPlay: boolean;
  lastEvent: { seat: number; kind: ComboKind | 'pass' | 'lead'; cards: string[] } | null;
}

const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUITS: Card['suit'][] = ['D', 'C', 'H', 'S'];
const RANK_VALUE = (r: string): number => RANKS.indexOf(r);
const SUIT_VALUE = (s: Card['suit']): number => SUITS.indexOf(s);

/**
 * Big Two (Deuces) for 2–4 players. 3 is low, 2 is high; suits rank
 * diamonds < clubs < hearts < spades. The holder of the 3♦ leads the first
 * trick and must include it. Play singles, pairs, triples or five-card poker
 * hands (straight < flush < full house < four of a kind + 1 < straight
 * flush); each play must beat the last of the same size, or pass. When
 * everyone else passes, the last player to play leads anything. First to
 * empty their hand wins; the others rank by cards left.
 *
 * Bots hold a simple but effective policy: lead low, beat with the weakest
 * winning combo, keep bombs for when they matter, and pass rather than break
 * strong five-card hands early.
 */
@Injectable()
export class BigTwoEngine extends BaseGameEngine {
  readonly slug = 'big_two';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    const deck = this.shuffledDeck();
    // 13 cards each for 4 players; 2 or 3 players still get 13 (the rest is set aside).
    const hands: Card[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < 13 * n; i++) hands[i % n].push(deck[i]);
    hands.forEach((h) => h.sort(this.compareCards));
    // Starter: whoever holds the lowest card in play.
    let starter = 0;
    let lowest: Card | null = null;
    hands.forEach((h, seat) => {
      if (!lowest || this.compareCards(h[0], lowest) < 0) {
        lowest = h[0];
        starter = seat;
      }
    });
    const board: BigTwoBoard = {
      hands,
      handSizes: hands.map((h) => h.length),
      tableCombo: null,
      tableSeat: null,
      passes: 0,
      history: [],
      finished: [],
      firstPlay: true,
      lastEvent: null,
    };
    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: starter,
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
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as BigTwoBoard;
    if (action.type === 'pass') {
      if (board.tableCombo === null) return { ok: false, error: 'You lead — you must play something.' };
      return { ok: true };
    }
    if (action.type !== 'play') return { ok: false, error: 'Unknown action.' };
    const ids = action.payload.cards;
    if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: 'Choose cards to play.' };
    const hand = board.hands[action.seat];
    const cards: Card[] = [];
    for (const id of ids) {
      const c = hand.find((h) => h.id === String(id));
      if (!c) return { ok: false, error: 'You do not hold that card.' };
      if (cards.includes(c)) return { ok: false, error: 'Duplicate card.' };
      cards.push(c);
    }
    const combo = this.classify(cards);
    if (!combo) return { ok: false, error: 'That is not a valid combination.' };
    if (board.firstPlay) {
      const lowest = this.lowestCardInPlay(board);
      if (!cards.some((c) => c.id === lowest.id)) return { ok: false, error: `The first play must include the ${this.pretty(lowest)}.` };
    }
    if (board.tableCombo && !this.beats(combo, board.tableCombo)) {
      return { ok: false, error: 'That does not beat the cards on the table.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid play.');
    const next = this.clone(state);
    const board = next.board as unknown as BigTwoBoard;
    const seat = action.seat;
    next.version += 1;

    if (action.type === 'pass') {
      board.passes += 1;
      board.history.push({ seat, combo: null });
      board.lastEvent = { seat, kind: 'pass', cards: [] };
    } else {
      const ids = (action.payload.cards as unknown[]).map(String);
      const hand = board.hands[seat];
      const cards = ids.map((id) => hand.find((c) => c.id === id)!);
      board.hands[seat] = hand.filter((c) => !ids.includes(c.id));
      board.handSizes[seat] = board.hands[seat].length;
      const combo = this.classify(cards)!;
      const wasLead = board.tableCombo === null;
      board.tableCombo = combo;
      board.tableSeat = seat;
      board.passes = 0;
      board.firstPlay = false;
      board.history.push({ seat, combo });
      board.lastEvent = { seat, kind: wasLead ? 'lead' : combo.kind, cards: combo.cards.map((c) => c.id) };
      if (board.hands[seat].length === 0) {
        board.finished.push(seat);
        this.finish(next);
        return next;
      }
    }
    if (board.history.length > 12) board.history.splice(0, board.history.length - 12);

    // Next seat still holding cards.
    const n = next.seats.length;
    let candidate = (seat + 1) % n;
    while (board.handSizes[candidate] === 0) candidate = (candidate + 1) % n;

    // Everyone else passed → the table clears and the last player leads.
    const active = board.handSizes.filter((s) => s > 0).length;
    if (board.tableCombo && board.passes >= active - 1 && board.tableSeat !== null) {
      board.tableCombo = null;
      board.passes = 0;
      candidate = board.tableSeat;
    }
    next.currentSeat = candidate;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as BigTwoBoard;
    const hand = board.hands[seat];
    const delay = (difficulty === 'easy' ? 1300 : 1000) + Math.floor(Math.random() * 700);
    const options = this.candidateCombos(hand);
    const table = board.tableCombo;

    let pick: Combo | null = null;
    if (table === null) {
      // Lead: prefer the longest combo that uses our lowest card, else the lowest single.
      const must = board.firstPlay ? this.lowestCardInPlay(board) : null;
      const leads = options.filter((c) => (must ? c.cards.some((x) => x.id === must.id) : true));
      leads.sort((a, b) => {
        // Bigger combos first (shed cards), but not bombs; then weakest.
        const aBomb = a.kind === 'four_kind' || a.kind === 'straight_flush';
        const bBomb = b.kind === 'four_kind' || b.kind === 'straight_flush';
        if (aBomb !== bBomb) return aBomb ? 1 : -1;
        if (a.size !== b.size) return b.size - a.size;
        return this.strength(a) - this.strength(b);
      });
      // Hard bots avoid breaking pairs when leading a single if they can lead the pair.
      pick = leads[0] ?? null;
      if (!pick) pick = this.classify([hand[0]]);
    } else {
      const beating = options.filter((c) => this.beats(c, table));
      beating.sort((a, b) => this.strength(a) - this.strength(b));
      const cheapest = beating.find((c) => c.kind !== 'four_kind' && c.kind !== 'straight_flush') ?? null;
      const bomb = beating.find((c) => c.kind === 'four_kind' || c.kind === 'straight_flush') ?? null;
      const opponentsClose = board.handSizes.some((s, i) => i !== seat && s > 0 && s <= 3);
      if (cheapest) {
        // Don't waste a 2 on a low single early unless pressured.
        const wasteful = cheapest.size === 1 && cheapest.value === 12 && table.value < 8 && !opponentsClose && hand.length > 5;
        const passChance = difficulty === 'easy' ? 0.25 : difficulty === 'medium' ? 0.1 : 0;
        if (!(wasteful && difficulty !== 'easy') && Math.random() >= passChance) pick = cheapest;
      } else if (bomb && (opponentsClose || hand.length <= 6 || difficulty === 'easy')) {
        pick = bomb;
      }
    }

    if (!pick) return { action: { seat, type: 'pass', payload: {} }, delayMs: delay };
    return { action: { seat, type: 'play', payload: { cards: pick.cards.map((c) => c.id) } }, delayMs: delay };
  }

  canSeatAct(state: GameState, action: GameAction): boolean {
    return state.currentSeat === action.seat;
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as BigTwoBoard;
    const own = seat >= 0 && seat < board.hands.length ? board.hands[seat] : null;
    return {
      ...state,
      board: {
        hand: own ? own.map((c) => ({ id: c.id, rank: c.rank, suit: c.suit })) : null,
        handSizes: board.handSizes,
        table: board.tableCombo
          ? { kind: board.tableCombo.kind, cards: board.tableCombo.cards.map((c) => ({ id: c.id, rank: c.rank, suit: c.suit })), seat: board.tableSeat }
          : null,
        passes: board.passes,
        history: board.history.slice(-8).map((p) => ({ seat: p.seat, kind: p.combo?.kind ?? 'pass', cards: p.combo?.cards.map((c) => c.id) ?? [] })),
        finished: board.finished,
        firstPlay: board.firstPlay,
        mustInclude: board.firstPlay ? this.lowestCardInPlay(board).id : null,
        lastEvent: board.lastEvent,
        playable: state.phase === 'in_progress' && seat === state.currentSeat && own ? this.playableHint(board, own) : null,
      },
    };
  }

  /** Ids of cards that take part in at least one legal play (client highlighting). */
  private playableHint(board: BigTwoBoard, hand: Card[]): string[] {
    const options = this.candidateCombos(hand).filter((c) => (board.tableCombo ? this.beats(c, board.tableCombo) : true));
    const must = board.firstPlay ? this.lowestCardInPlay(board) : null;
    const ids = new Set<string>();
    for (const c of options) {
      if (must && !c.cards.some((x) => x.id === must.id)) continue;
      c.cards.forEach((x) => ids.add(x.id));
    }
    return [...ids];
  }

  // ── Finishing ─────────────────────────────────────────────────────────────

  private finish(state: GameState): void {
    const board = state.board as unknown as BigTwoBoard;
    const n = state.seats.length;
    const winner = board.finished[0];
    // Score: cards left by everyone else for the winner; negative cards-left for others.
    const others = board.handSizes.reduce((a, b) => a + b, 0);
    state.scores = board.handSizes.map((left, i) => (i === winner ? others : -left));
    state.seats.forEach((s, i) => (s.score = state.scores[i]));
    // Finishing order for the client.
    const rest = Array.from({ length: n }, (_, i) => i).filter((i) => i !== winner).sort((a, b) => board.handSizes[a] - board.handSizes[b]);
    board.finished = [winner, ...rest];
    state.phase = 'completed';
    state.currentSeat = -1;
    state.winnerSeat = winner;
    state.winnerSeats = [winner];
    board.tableCombo = null;
  }

  // ── Cards & combinations ──────────────────────────────────────────────────

  private shuffledDeck(): Card[] {
    const deck: Card[] = [];
    for (const rank of RANKS) for (const suit of SUITS) deck.push({ id: `${rank}${suit}`, rank, suit });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  private compareCards = (a: Card, b: Card): number => {
    const d = RANK_VALUE(a.rank) - RANK_VALUE(b.rank);
    return d !== 0 ? d : SUIT_VALUE(a.suit) - SUIT_VALUE(b.suit);
  };

  private lowestCardInPlay(board: BigTwoBoard): Card {
    let lowest: Card | null = null;
    for (const hand of board.hands) for (const c of hand) if (!lowest || this.compareCards(c, lowest) < 0) lowest = c;
    return lowest!;
  }

  private pretty(c: Card): string {
    const suit = c.suit === 'D' ? '♦' : c.suit === 'C' ? '♣' : c.suit === 'H' ? '♥' : '♠';
    return `${c.rank}${suit}`;
  }

  /** Returns the combo a set of cards forms, or null if illegal. */
  classify(input: Card[]): Combo | null {
    const cards = [...input].sort(this.compareCards);
    const n = cards.length;
    const top = cards[n - 1];
    if (n === 1) return { kind: 'single', size: 1, cards, value: RANK_VALUE(top.rank), suit: SUIT_VALUE(top.suit), category: -1 };
    if (n === 2 || n === 3) {
      if (!cards.every((c) => c.rank === top.rank)) return null;
      return { kind: n === 2 ? 'pair' : 'triple', size: n, cards, value: RANK_VALUE(top.rank), suit: SUIT_VALUE(top.suit), category: -1 };
    }
    if (n !== 5) return null;
    const counts = new Map<string, Card[]>();
    for (const c of cards) counts.set(c.rank, [...(counts.get(c.rank) ?? []), c]);
    const groups = [...counts.values()].sort((a, b) => b.length - a.length);
    const flush = cards.every((c) => c.suit === top.suit);
    const straightHigh = this.straightHigh(cards);
    if (straightHigh !== null && flush) {
      return { kind: 'straight_flush', size: 5, cards, value: straightHigh.value, suit: straightHigh.suit, category: 4 };
    }
    if (groups[0].length === 4) {
      return { kind: 'four_kind', size: 5, cards, value: RANK_VALUE(groups[0][0].rank), suit: 3, category: 3 };
    }
    if (groups[0].length === 3 && groups[1].length === 2) {
      return { kind: 'full_house', size: 5, cards, value: RANK_VALUE(groups[0][0].rank), suit: 3, category: 2 };
    }
    if (flush) return { kind: 'flush', size: 5, cards, value: RANK_VALUE(top.rank), suit: SUIT_VALUE(top.suit), category: 1 };
    if (straightHigh !== null) return { kind: 'straight', size: 5, cards, value: straightHigh.value, suit: straightHigh.suit, category: 0 };
    return null;
  }

  /** Highest card of a valid straight (3-4-5-6-7 … J-Q-K-A-2 and 10-J-Q-K-A), else null. */
  private straightHigh(sorted: Card[]): { value: number; suit: number } | null {
    const values = sorted.map((c) => RANK_VALUE(c.rank));
    if (new Set(values).size !== 5) return null;
    const consecutive = values.every((v, i) => i === 0 || v === values[i - 1] + 1);
    if (consecutive) {
      const top = sorted[4];
      return { value: RANK_VALUE(top.rank), suit: SUIT_VALUE(top.suit) };
    }
    // A-2-3-4-5 and 2-3-4-5-6 are commonly allowed low straights; rank them lowest.
    const set = new Set(values);
    const a2345 = [RANK_VALUE('A'), RANK_VALUE('2'), 0, 1, 2].every((v) => set.has(v));
    const s23456 = [RANK_VALUE('2'), 0, 1, 2, 3].every((v) => set.has(v));
    if (a2345) {
      const five = sorted.find((c) => c.rank === '5')!;
      return { value: -2, suit: SUIT_VALUE(five.suit) };
    }
    if (s23456) {
      const six = sorted.find((c) => c.rank === '6')!;
      return { value: -1, suit: SUIT_VALUE(six.suit) };
    }
    return null;
  }

  private strength(c: Combo): number {
    return (c.category + 1) * 1000 + c.value * 10 + c.suit;
  }

  beats(a: Combo, b: Combo): boolean {
    if (a.size !== b.size) return false;
    if (a.size === 5 && a.category !== b.category) return a.category > b.category;
    if (a.value !== b.value) return a.value > b.value;
    return a.suit > b.suit;
  }

  /** Enumerates every legal combo in a hand (singles, pairs, triples, five-card hands). */
  private candidateCombos(hand: Card[]): Combo[] {
    const out: Combo[] = [];
    const byRank = new Map<string, Card[]>();
    for (const c of hand) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
    for (const c of hand) out.push(this.classify([c])!);
    for (const group of byRank.values()) {
      if (group.length >= 2) {
        for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) out.push(this.classify([group[i], group[j]])!);
      }
      if (group.length >= 3) {
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            for (let k = j + 1; k < group.length; k++) out.push(this.classify([group[i], group[j], group[k]])!);
          }
        }
      }
    }
    // Five-card hands: straights, flushes, full houses, quads.
    const groups = [...byRank.values()];
    // Full houses + four-of-a-kind.
    for (const trip of groups.filter((g) => g.length >= 3)) {
      for (const pair of groups.filter((g) => g.length >= 2 && g[0].rank !== trip[0].rank)) {
        const combo = this.classify([...trip.slice(0, 3), ...pair.slice(0, 2)]);
        if (combo) out.push(combo);
      }
    }
    for (const quad of groups.filter((g) => g.length === 4)) {
      const kicker = hand.find((c) => c.rank !== quad[0].rank);
      if (kicker) out.push(this.classify([...quad, kicker])!);
    }
    // Flushes: lowest five of a suit (plus the highest-five variant).
    const bySuit = new Map<string, Card[]>();
    for (const c of hand) bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), c]);
    for (const suited of bySuit.values()) {
      if (suited.length >= 5) {
        const sorted = [...suited].sort(this.compareCards);
        out.push(this.classify(sorted.slice(0, 5))!);
        if (sorted.length > 5) out.push(this.classify(sorted.slice(-5))!);
      }
    }
    // Straights: one card per rank over sliding windows (lowest suit of each rank).
    const ranksHeld = RANKS.map((r) => (byRank.get(r) ?? []).sort(this.compareCards)[0] ?? null);
    for (let start = 0; start + 4 < RANKS.length; start++) {
      const window = ranksHeld.slice(start, start + 5);
      if (window.every((c) => c !== null)) {
        const combo = this.classify(window as Card[]);
        if (combo) out.push(combo);
      }
    }
    // Deduplicate by card ids.
    const seen = new Set<string>();
    return out.filter((c) => {
      const key = c.cards.map((x) => x.id).sort().join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as BigTwoBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        hands: board.hands.map((h) => [...h]),
        handSizes: [...board.handSizes],
        history: [...board.history],
        finished: [...board.finished],
      } as unknown as Record<string, unknown>,
    };
  }
}
