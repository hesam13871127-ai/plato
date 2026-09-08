import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** 16 friendly emoji symbols — as many as the biggest grid needs. */
export const SYMBOL_POOL: readonly string[] = [
  '🦊', '🐼', '🐧', '🦉', '🐢', '🦄', '🐝', '🦋',
  '🐙', '🦖', '🐳', '🦩', '🦔', '🦚', '🐞', '🦜',
];

export interface MemoryState {
  playerCount: number;
  cols: number;
  rows: number;
  /** symbol per card (cards = cols×rows, always an even count) */
  symbols: string[];
  /** matched cards stay face-up forever */
  revealed: boolean[];
  /** which player owns each matched pair (-1 = none) */
  owner: number[];
  /** cards that have been face-up at some point (bot memory) */
  seen: boolean[];
  /** first pick of the current turn */
  first: number | null;
  /** the mismatched pair currently shown (flips back on the next pick) */
  peek: number[];
  turn: number;
  pairs: number[];
  phase: 'pick' | 'over';
  lastEvent: { player: number; a: number; b: number | null; match: boolean } | null;
}

export type MemoryAction = { type: 'reveal'; idx: number };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function gridFor(playerCount: number): { cols: number; rows: number } {
  if (playerCount <= 2) return { cols: 4, rows: 4 }; // 8 pairs
  if (playerCount === 3) return { cols: 5, rows: 4 }; // 10 pairs
  return { cols: 6, rows: 4 }; // 12 pairs
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const memoryEngine: GameEngine<MemoryState, MemoryAction> = {
  createInitialState(config, rng) {
    const playerCount = config.slots.length;
    const { cols, rows } = gridFor(playerCount);
    const size = cols * rows;
    const pairSymbols = rng.shuffle([...SYMBOL_POOL]).slice(0, size / 2);
    const symbols = rng.shuffle([...pairSymbols, ...pairSymbols]);
    return {
      playerCount,
      cols,
      rows,
      symbols,
      revealed: Array.from({ length: size }, () => false),
      owner: Array.from({ length: size }, () => -1),
      seen: Array.from({ length: size }, () => false),
      first: null,
      peek: [],
      turn: 0,
      pairs: Array.from({ length: playerCount }, () => 0),
      phase: 'pick',
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'pick' || state.turn !== playerId) return [];
    const acts: MemoryAction[] = [];
    for (let i = 0; i < state.symbols.length; i++) {
      if (!state.revealed[i] && i !== state.first) acts.push({ type: 'reveal', idx: i });
    }
    return acts;
  },

  validate(state, action, playerId) {
    if (state.phase !== 'pick' || state.turn !== playerId) return false;
    if (action.type !== 'reveal') return false;
    const i = action.idx;
    if (i < 0 || i >= state.symbols.length) return false;
    return !state.revealed[i] && i !== state.first;
  },

  applyAction(state, action, playerId) {
    if (!memoryEngine.validate(state, action, playerId)) return state;
    const idx = action.idx;
    const seen = [...state.seen];
    seen[idx] = true;

    if (state.first === null) {
      return {
        ...state,
        seen,
        first: idx,
        peek: [],
        lastEvent: { player: playerId, a: idx, b: null, match: false },
      };
    }

    const a = state.first;
    const match = state.symbols[a] === state.symbols[idx];
    if (match) {
      const revealed = [...state.revealed];
      const owner = [...state.owner];
      revealed[a] = true;
      revealed[idx] = true;
      owner[a] = playerId;
      owner[idx] = playerId;
      const pairs = [...state.pairs];
      pairs[playerId]! += 1;
      const totalPairs = state.symbols.length / 2;
      const done = pairs.reduce((s, p) => s + p, 0) >= totalPairs;
      return {
        ...state,
        seen,
        revealed,
        owner,
        pairs,
        first: null,
        peek: [],
        turn: done ? state.turn : playerId, // match = extra turn
        phase: done ? 'over' : 'pick',
        lastEvent: { player: playerId, a, b: idx, match: true },
      };
    }

    // mismatch: cards flip back, turn passes on
    return {
      ...state,
      seen,
      first: null,
      peek: [a, idx],
      turn: (playerId + 1) % state.playerCount,
      lastEvent: { player: playerId, a, b: idx, match: false },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    if (state.phase !== 'pick' || state.turn !== playerId) return null;
    const unseen = state.symbols
      .map((_, i) => i)
      .filter((i) => !state.revealed[i] && !state.seen[i] && i !== state.first);

    const memoryChance = difficulty === 'easy' ? 0.15 : difficulty === 'medium' ? 0.6 : 1;

    if (state.first === null) {
      // knows a matching pair? (both seen, not revealed)
      const known: Record<string, number[]> = {};
      for (let i = 0; i < state.symbols.length; i++) {
        if (state.seen[i] && !state.revealed[i]) (known[state.symbols[i]!] ??= []).push(i);
      }
      const pair = Object.values(known).find((l) => l.length >= 2);
      if (pair && rng.next() < memoryChance) return { type: 'reveal', idx: pair[0]! };
      const pool = unseen.length > 0 ? unseen : state.symbols.map((_, i) => i).filter((i) => !state.revealed[i]);
      return { type: 'reveal', idx: rng.pick(pool) };
    }

    // second pick: does the bot remember where the match of `first` is?
    const firstSymbol = state.symbols[state.first]!;
    const matchIdx = state.symbols.findIndex(
      (s, i) => i !== state.first && s === firstSymbol && !state.revealed[i],
    );
    if (matchIdx >= 0 && state.seen[matchIdx] && rng.next() < memoryChance) {
      return { type: 'reveal', idx: matchIdx };
    }
    const pool = state.symbols.map((_, i) => i).filter((i) => !state.revealed[i] && i !== state.first);
    return { type: 'reveal', idx: rng.pick(pool) };
  },

  currentPlayers(state) {
    return state.phase === 'pick' ? [state.turn] : [];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    if (state.phase !== 'over') return [];
    const best = Math.max(...state.pairs);
    return state.pairs.map((p, i) => (p === best ? i : -1)).filter((i) => i >= 0);
  },
};
