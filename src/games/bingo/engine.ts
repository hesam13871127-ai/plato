import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** 5×5 card; column c draws from range [c*15+1 .. c*15+15]; center is free (0). */
export interface BingoCard {
  /** numbers[c][r], 0 = free center */
  numbers: number[][];
  marked: boolean[][];
}

export interface BingoState {
  playerCount: number;
  cards: BingoCard[];
  pool: number[];
  drawn: number[];
  turn: number;
  phase: 'draw' | 'over';
  winner: number | null;
  lastEvent: { player: number; number: number; lines: number[] } | null;
}

export type BingoAction = { type: 'draw' };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function makeCard(rng: RNG): BingoCard {
  const numbers: number[][] = [];
  const marked: boolean[][] = [];
  for (let c = 0; c < 5; c++) {
    const range = Array.from({ length: 15 }, (_, i) => c * 15 + i + 1);
    const picked = rng.shuffle(range).slice(0, 5);
    if (c === 2) picked[2] = 0; // free center
    numbers.push(picked);
    marked.push([false, false, false, false, false]);
  }
  // mark the free center
  marked[2]![2] = true;
  return { numbers, marked };
}

/** completed row/col/diag count for a card */
export function completedLines(card: BingoCard): number {
  let lines = 0;
  for (let r = 0; r < 5; r++) {
    if (card.marked.every((col) => col[r])) lines++;
  }
  for (let c = 0; c < 5; c++) {
    if (card.marked[c]!.every((m) => m)) lines++;
  }
  if (card.marked.every((col, i) => col[i]!)) lines++;
  if (card.marked.every((col, i) => col[4 - i]!)) lines++;
  return lines;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const bingoEngine: GameEngine<BingoState, BingoAction> = {
  createInitialState(config, rng) {
    const playerCount = config.slots.length;
    return {
      playerCount,
      cards: Array.from({ length: playerCount }, () => makeCard(rng)),
      pool: rng.shuffle(Array.from({ length: 75 }, (_, i) => i + 1)),
      drawn: [],
      turn: 0,
      phase: 'draw',
      winner: null,
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'draw' || state.turn !== playerId) return [];
    return state.pool.length > 0 ? [{ type: 'draw' }] : [];
  },

  validate(state, action, playerId) {
    return bingoEngine.legalActions(state, playerId).some((a) => JSON.stringify(a) === JSON.stringify(action));
  },

  applyAction(state, action, playerId, rng) {
    if (!bingoEngine.validate(state, action, playerId)) return state;
    void rng;

    const pool = [...state.pool];
    const idx = Math.floor(rng.next() * pool.length);
    const num = pool.splice(idx, 1)[0]!;

    const cards = state.cards.map((card) => ({
      numbers: card.numbers,
      marked: card.marked.map((col) => [...col]),
    }));
    for (const card of cards) {
      for (let c = 0; c < 5; c++) {
        for (let r = 0; r < 5; r++) {
          if (card.numbers[c]![r] === num) card.marked[c]![r] = true;
        }
      }
    }

    const lines = cards.map((card) => completedLines(card));
    const anyLine = lines.some((l) => l > 0);

    const drawn = [...state.drawn, num];
    if (anyLine) {
      // all players with a completed line win together; ties favor the drawer
      const winners = lines.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0);
      return {
        ...state,
        cards,
        pool,
        drawn,
        phase: 'over',
        winner: winners.length === 1 ? winners[0]! : null,
        lastEvent: { player: playerId, number: num, lines },
      };
    }
    return {
      ...state,
      cards,
      pool,
      drawn,
      turn: (playerId + 1) % state.playerCount,
      lastEvent: { player: playerId, number: num, lines },
    };
  },

  chooseBotMove(state, playerId) {
    if (state.phase !== 'draw' || state.turn !== playerId || state.pool.length === 0) return null;
    return { type: 'draw' };
  },

  currentPlayers(state) {
    return state.phase === 'over' || state.pool.length === 0 ? [] : [state.turn];
  },

  isGameOver(state) {
    return state.phase === 'over' || state.pool.length === 0;
  },

  winners(state) {
    if (state.phase === 'over') {
      if (state.winner !== null) return [state.winner];
      return state.cards.map((c, i) => (completedLines(c) > 0 ? i : -1)).filter((i) => i >= 0);
    }
    return [];
  },
};
