import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * Go Fish. Hands are rank multiplicities (13 ranks × 4 suits). Asking a
 * player for a rank you hold: on a hit you take ALL their cards of that
 * rank and ask again; on a miss you "go fish" — draw from the pool, and if
 * you draw the very rank you asked for you keep the turn. Four of a rank
 * is a booked set worth a point.
 */

export interface FishState {
  playerCount: number;
  /** hands[p][rank 0..12] = card count */
  hands: number[][];
  /** draw pile (ranks) */
  pool: number[];
  books: number[];
  bookedRanks: number[];
  /** public log of asks — bots mine it for information */
  log: { asker: number; target: number; rank: number; hit: boolean }[];
  turn: number;
  phase: 'play' | 'over';
  lastEvent:
    | { kind: 'hit'; asker: number; target: number; rank: number; count: number }
    | { kind: 'fish'; asker: number; rank: number; drew: number; lucky: boolean }
    | { kind: 'book'; player: number; rank: number }
    | { kind: 'empty-draw'; player: number }
    | { kind: 'skip'; player: number }
    | { kind: 'over' }
    | null;
}

export type FishAction = { type: 'ask'; target: number; rank: number };

const RANKS = 13;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function handSize(counts: number[]): number {
  return counts.reduce((a, b) => a + b, 0);
}

/** extract complete books from a hand */
function extractBooks(counts: number[], player: number, events: FishState['lastEvent'][]): number[] {
  const booked: number[] = [];
  for (let r = 0; r < RANKS; r++) {
    if (counts[r] === 4) {
      counts[r] = 0;
      booked.push(r);
      events.push({ kind: 'book', player, rank: r });
    }
  }
  return booked;
}

function nextWithCards(state: FishState, from: number): number {
  for (let i = 1; i <= state.playerCount; i++) {
    const idx = (from + i) % state.playerCount;
    if (handSize(state.hands[idx]!) > 0) return idx;
  }
  return -1;
}

function anyoneHasCards(state: FishState): boolean {
  return state.hands.some((h) => handSize(h) > 0);
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const fishEngine: GameEngine<FishState, FishAction> = {
  createInitialState(config, rng) {
    const n = config.slots.length;
    const deck: number[] = [];
    for (let r = 0; r < RANKS; r++) for (let s = 0; s < 4; s++) deck.push(r);
    const shuffled = rng.shuffle(deck);
    const perHand = n === 2 ? 7 : 5;
    const hands: number[][] = Array.from({ length: n }, () => Array.from({ length: RANKS }, () => 0));
    let k = 0;
    for (let p = 0; p < n; p++) {
      for (let c = 0; c < perHand; c++) {
        hands[p]![shuffled[k++]!]!++;
      }
    }
    const pool = shuffled.slice(k);

    // extract any fluke opening books (four of a kind dealt)
    const events: FishState['lastEvent'][] = [];
    const books = Array.from({ length: n }, () => 0);
    const bookedRanks: number[] = [];
    for (let p = 0; p < n; p++) {
      for (const r of extractBooks(hands[p]!, p, events)) {
        books[p]!++;
        bookedRanks.push(r);
      }
    }

    return {
      playerCount: n,
      hands,
      pool,
      books,
      bookedRanks,
      log: [],
      turn: 0,
      phase: 'play',
      lastEvent: events.length > 0 ? events[events.length - 1]! : null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'play' || state.turn !== playerId) return [];
    const acts: FishAction[] = [];
    if (handSize(state.hands[playerId]!) === 0) return [];
    for (let r = 0; r < RANKS; r++) {
      if (state.hands[playerId]![r]! < 1 || state.bookedRanks.includes(r)) continue;
      for (let t = 0; t < state.playerCount; t++) {
        if (t === playerId || handSize(state.hands[t]!) === 0) continue;
        acts.push({ type: 'ask', target: t, rank: r });
      }
    }
    return acts;
  },

  validate(state, action, playerId) {
    return fishEngine.legalActions(state, playerId).some(
      (a) => a.target === action.target && a.rank === action.rank,
    );
  },

  applyAction(state, action, playerId) {
    if (!fishEngine.validate(state, action, playerId)) return state;

    const hands = state.hands.map((h) => [...h]);
    const pool = [...state.pool];
    const books = [...state.books];
    const bookedRanks = [...state.bookedRanks];
    const log = [...state.log];
    const events: NonNullable<FishState['lastEvent']>[] = [];
    const { target, rank } = action;
    let keepTurn = false;

    const count = hands[target]![rank]!;
    if (count > 0) {
      hands[target]![rank] = 0;
      hands[playerId]![rank]! += count;
      log.push({ asker: playerId, target, rank, hit: true });
      events.push({ kind: 'hit', asker: playerId, target, rank, count });
      keepTurn = true;
    } else {
      log.push({ asker: playerId, target, rank, hit: false });
      if (pool.length > 0) {
        const drew = pool.pop()!;
        hands[playerId]![drew]! += 1;
        const lucky = drew === rank;
        events.push({ kind: 'fish', asker: playerId, rank, drew, lucky });
        keepTurn = lucky;
      } else {
        events.push({ kind: 'fish', asker: playerId, rank, drew: -1, lucky: false });
      }
    }

    // books
    for (const r of extractBooks(hands[playerId]!, playerId, events)) {
      books[playerId]!++;
      bookedRanks.push(r);
    }

    // anyone left with an empty hand draws a card to stay in the game
    for (let p = 0; p < state.playerCount; p++) {
      if (handSize(hands[p]!) === 0 && pool.length > 0) {
        const drew = pool.pop()!;
        hands[p]![drew]! += 1;
        if (p === playerId) events.push({ kind: 'empty-draw', player: p });
      }
    }

    // end conditions
    const allBooked = books.reduce((a, b) => a + b, 0) >= RANKS;
    const playersWithCards = hands.filter((h) => handSize(h) > 0).length;
    const nothingLeft = pool.length === 0 && playersWithCards <= 1;
    if (allBooked || nothingLeft) {
      return {
        ...state,
        hands,
        pool,
        books,
        bookedRanks,
        log,
        phase: 'over',
        lastEvent: { kind: 'over' },
      };
    }

    // turn: keep on hit/lucky — unless the asker's hand is bone dry (pool
    // empty too), then pass to the next player still holding cards
    let turn = state.turn;
    if (!keepTurn || handSize(hands[playerId]!) === 0) {
      const nxt = nextWithCards({ ...state, hands }, playerId);
      if (nxt < 0) {
        return { ...state, hands, pool, books, bookedRanks, log, phase: 'over', lastEvent: { kind: 'over' } };
      }
      turn = nxt;
    }

    return {
      ...state,
      hands,
      pool,
      books,
      bookedRanks,
      log,
      turn,
      phase: 'play',
      lastEvent: events[events.length - 1] ?? null,
    };
  },

  chooseBotMove(state, playerId, rng) {
    const legal = fishEngine.legalActions(state, playerId);
    if (legal.length === 0) return null;

    // mine the public log: whoever last ASKED for a rank still holds at
    // least one card of it (they needed one to ask), unless it got booked
    const known: Map<number, number> = new Map(); // rank → seat that surely holds it
    for (const entry of state.log) {
      known.set(entry.rank, entry.asker);
    }
    for (const a of rng.shuffle(legal)) {
      const holder = known.get(a.rank);
      if (holder !== undefined && holder === a.target && handSize(state.hands[a.target]!) > 0) {
        return a;
      }
    }
    return rng.pick(legal);
  },

  currentPlayers(state) {
    return state.phase === 'play' ? [state.turn] : [];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    if (state.phase !== 'over') return [];
    const best = Math.max(...state.books);
    return state.books.map((b, i) => (b === best ? i : -1)).filter((i) => i >= 0);
  },
};
