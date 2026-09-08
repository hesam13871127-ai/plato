import type { GameConfig, GameEngine, RNG } from '../../core/types';
import { enWords, faWords } from './words';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export const STARTING_LIVES = 3;

export interface ChainState {
  playerCount: number;
  lang: 'fa' | 'en';
  /** the letter the next word must START with (normalized) */
  letter: string;
  /** accepted words, normalized */
  words: string[];
  lives: number[];
  /** words contributed per player (tiebreaker) */
  score: number[];
  turn: number;
  active: boolean[];
  phase: 'play' | 'over';
  lastEvent: {
    player: number;
    kind: 'word' | 'forfeit' | 'out' | 'rotate';
    word?: string;
    letter?: string;
  } | null;
}

export type ChainAction =
  | { type: 'word'; word: string }
  | { type: 'forfeit' }
  | { type: 'rotate' };

/* ------------------------------------------------------------------ */
/* Lexicon plumbing                                                    */
/* ------------------------------------------------------------------ */

const FA_MAP: Record<string, string> = {
  'آ': 'ا', 'أ': 'ا', 'إ': 'ا', 'ي': 'ی', 'ك': 'ک', 'ؤ': 'و', 'ئ': 'ی', 'ة': 'ه',
};

export function normWord(word: string, lang: 'fa' | 'en'): string {
  const s = word.trim().replace(/\u200c/g, '').replace(/\s+/g, '');
  if (lang === 'en') return s.toLowerCase();
  return [...s].map((c) => FA_MAP[c] ?? c).join('');
}

function buildLexicon(words: readonly string[], lang: 'fa' | 'en'): Map<string, string[]> {
  const byLetter = new Map<string, string[]>();
  for (const w of words) {
    const n = normWord(w, lang);
    if (n.length < 2) continue;
    const first = n[0]!;
    const list = byLetter.get(first) ?? [];
    if (!list.includes(n)) list.push(n);
    byLetter.set(first, list);
  }
  return byLetter;
}

const BY_LETTER: Record<'fa' | 'en', Map<string, string[]>> = {
  fa: buildLexicon(faWords, 'fa'),
  en: buildLexicon(enWords, 'en'),
};

/** every word of the lexicon starting with `letter` that is not used yet */
export function chainWordMoves(state: ChainState): string[] {
  if (state.phase !== 'play' || !state.active[state.turn]) return [];
  const used = new Set(state.words);
  return (BY_LETTER[state.lang].get(state.letter) ?? []).filter((w) => !used.has(w));
}

function pickRichLetter(rng: RNG, state: { lang: 'fa' | 'en'; words: string[] }): string {
  const used = new Set(state.words);
  const pool: string[] = [];
  for (const [letter, list] of BY_LETTER[state.lang]) {
    const free = list.filter((w) => !used.has(w)).length;
    if (free >= 3) pool.push(...Array.from({ length: Math.min(free, 5) }, () => letter));
  }
  if (pool.length === 0) {
    // extreme fallback: any letter with at least one free word
    for (const [letter, list] of BY_LETTER[state.lang]) {
      if (list.some((w) => !used.has(w))) pool.push(letter);
    }
  }
  return pool.length > 0 ? rng.pick(pool) : 'ا';
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

function nextActive(state: ChainState, from: number): number {
  for (let i = 1; i <= state.playerCount; i++) {
    const idx = (from + i) % state.playerCount;
    if (state.active[idx]) return idx;
  }
  return from;
}

function activeCount(state: ChainState): number {
  return state.active.filter(Boolean).length;
}

export const chainEngine: GameEngine<ChainState, ChainAction> = {
  createInitialState(config, rng) {
    const lang = config.lang ?? 'fa';
    const base = { lang, words: [] as string[] };
    return {
      playerCount: config.slots.length,
      lang,
      letter: pickRichLetter(rng, base),
      words: [],
      lives: Array.from({ length: config.slots.length }, () => STARTING_LIVES),
      score: Array.from({ length: config.slots.length }, () => 0),
      turn: 0,
      active: Array.from({ length: config.slots.length }, () => true),
      phase: 'play',
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'play' || state.turn !== playerId || !state.active[playerId]) return [];
    const moves: ChainAction[] = chainWordMoves(state).map((word) => ({ type: 'word' as const, word }));
    moves.push({ type: 'forfeit' });
    if (chainWordMoves(state).length === 0) moves.push({ type: 'rotate' }); // no word left → free letter change
    return moves;
  },

  validate(state, action, playerId) {
    if (state.phase !== 'play' || state.turn !== playerId) return false;
    if (action.type === 'forfeit') return true;
    if (action.type === 'rotate') return chainWordMoves(state).length === 0;
    if (action.type === 'word') {
      const n = normWord(action.word, state.lang);
      if (n.length < 2) return false;
      if (n[0] !== state.letter) return false;
      if (state.words.includes(n)) return false;
      return (BY_LETTER[state.lang].get(state.letter) ?? []).includes(n);
    }
    return false;
  },

  applyAction(state, action, playerId, rng) {
    if (!chainEngine.validate(state, action, playerId)) return state;

    if (action.type === 'word') {
      const n = normWord(action.word, state.lang);
      const words = [...state.words, n];
      const score = [...state.score];
      score[playerId]! += 1;
      const letter = n[n.length - 1]!;
      const turn = nextActive(state, playerId);
      const over = activeCount(state) <= 1;
      return {
        ...state,
        words,
        score,
        letter,
        turn,
        phase: over ? ('over' as const) : state.phase,
        lastEvent: { player: playerId, kind: 'word' as const, word: n },
      };
    }

    if (action.type === 'rotate') {
      const letter = pickRichLetter(rng, state);
      return { ...state, letter, lastEvent: { player: playerId, kind: 'rotate' as const, letter } };
    }

    // forfeit
    const lives = [...state.lives];
    lives[playerId]! -= 1;
    const active = [...state.active];
    const eliminated = lives[playerId]! <= 0;
    if (eliminated) active[playerId] = false;
    const next: ChainState = {
      ...state,
      lives,
      active,
      turn: nextActive({ ...state, active }, playerId),
      lastEvent: { player: playerId, kind: eliminated ? ('out' as const) : ('forfeit' as const) },
    };
    if (activeCount(next) <= 1) next.phase = 'over';
    return next;
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    if (state.phase !== 'play' || state.turn !== playerId || !state.active[playerId]) return null;
    const moves = chainWordMoves(state);
    if (moves.length === 0) return { type: 'rotate' };

    if (difficulty === 'easy') {
      // lazy: the shortest word that comes to mind
      return { type: 'word', word: [...moves].sort((a, b) => a.length - b.length)[0]! };
    }
    if (difficulty === 'medium') {
      return { type: 'word', word: rng.pick(moves) };
    }
    // hard: strand the opponent — pick the word whose last letter leaves the
    // fewest continuations; prefer longer words on ties (showing off).
    const used = new Set(state.words);
    let best = moves[0]!;
    let bestScore = Infinity;
    for (const w of moves) {
      const nextLetter = w[w.length - 1]!;
      const continuations = (BY_LETTER[state.lang].get(nextLetter) ?? []).filter((x) => !used.has(x) && x !== w).length;
      const score = continuations * 100 - w.length;
      if (score < bestScore) {
        bestScore = score;
        best = w;
      }
    }
    return { type: 'word', word: best };
  },

  currentPlayers(state) {
    return state.phase === 'play' ? [state.turn] : [];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    if (state.phase !== 'over') return [];
    const survivors = state.active.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
    if (survivors.length > 0) return survivors;
    // everyone died in the same action (only possible with 1 player) — score fallback
    const best = Math.max(...state.score);
    return state.score.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  },
};

export type { GameConfig };
