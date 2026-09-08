import type { GameConfig, GameEngine, RNG } from '../../core/types';
import { WORDS, type CluePair } from './words';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * Impostor (undercover/spyfall-style). Every player gets the same secret
 * word except the impostor. Seats take turns giving one clue, then everyone
 * votes. Points rotate the impostor role so everyone gets a turn.
 */

export type ImpostorEvent =
  | { kind: 'clue'; player: number; clue: CluePair }
  | { kind: 'vote'; player: number; target: number }
  | { kind: 'accused'; target: number; impostor: number; correct: boolean }
  | { kind: 'survived'; impostor: number }
  | { kind: 'guess'; impostor: number; correct: boolean; word: string }
  | { kind: 'round'; round: number; word: string };

export interface ImpostorState {
  playerCount: number;
  round: number; // 0-based; rounds = playerCount
  /** word index per round */
  words: number[];
  /** impostor seat per round (rotation) */
  impostors: number[];
  /** clue options [round][seat] — 4 clues */
  options: CluePair[][][];
  /** guess options [round] — 4 word NAMES (index into WORDS) */
  guessOptions: number[][];
  /** clues given [round][seat] */
  clues: (CluePair | null)[][];
  clueIdx: number; // seat index in the clue phase
  votes: number[];
  voteIdx: number;
  scores: number[];
  phase: 'clue' | 'vote' | 'guess' | 'over';
  lastEvent: ImpostorEvent | null;
}

export type ImpostorAction =
  | { type: 'clue'; idx: number }
  | { type: 'vote'; target: number }
  | { type: 'guess'; idx: number };

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

function makeRoundOptions(wordIdx: number, impostor: number, rng: RNG, seats: number): CluePair[][] {
  const word = WORDS[wordIdx]!;
  const options: CluePair[][] = [];
  for (let seat = 0; seat < seats; seat++) {
    if (seat === impostor) {
      // decoys: one clue from each of 4 OTHER words (never the real word's clues)
      const others = rng.shuffle(WORDS.map((_, i) => i).filter((i) => i !== wordIdx)).slice(0, 4);
      options.push(others.map((oi) => rng.pick(WORDS[oi]!.clues)));
    } else {
      options.push(rng.shuffle([...word.clues]).slice(0, 4));
    }
  }
  return options;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

/** close out the current round and open the next (or end the game) */
function finishRound(state: ImpostorState, event: ImpostorEvent): ImpostorState {
  const n = state.playerCount;
  const nextRound = state.round + 1;
  if (nextRound >= n) {
    return { ...state, phase: 'over', lastEvent: event };
  }
  return {
    ...state,
    round: nextRound,
    phase: 'clue',
    clueIdx: 0,
    votes: state.votes.map(() => -1),
    voteIdx: 0,
    lastEvent: event,
  };
}

export const impostorEngine: GameEngine<ImpostorState, ImpostorAction> = {
  createInitialState(config, rng) {
    const n = config.slots.length;
    const rounds = n;
    const words = rng.shuffle(WORDS.map((_, i) => i)).slice(0, rounds);
    const impostors = Array.from({ length: rounds }, (_, r) => r % n);
    const options = words.map((w, r) => makeRoundOptions(w, impostors[r]!, rng, n));
    const guessOptions = words.map((w, r) => {
      const others = rng
        .shuffle(WORDS.map((_, i) => i).filter((i) => i !== w))
        .slice(0, 3);
      return rng.shuffle([w, ...others]);
    });

    return {
      playerCount: n,
      round: 0,
      words,
      impostors,
      options,
      guessOptions,
      clues: Array.from({ length: rounds }, () => Array.from({ length: n }, () => null)),
      clueIdx: 0,
      votes: Array.from({ length: n }, () => -1),
      voteIdx: 0,
      scores: Array.from({ length: n }, () => 0),
      phase: 'clue',
      lastEvent: { kind: 'round', round: 0, word: WORDS[words[0]!]!.name.en },
    };
  },

  legalActions(state, playerId) {
    if (state.phase === 'clue' && state.clueIdx === playerId) {
      return state.options[state.round]![playerId]!.map((_, idx) => ({ type: 'clue' as const, idx }));
    }
    if (state.phase === 'vote' && state.voteIdx === playerId) {
      return Array.from({ length: state.playerCount }, (_, target) => target)
        .filter((t) => t !== playerId)
        .map((target) => ({ type: 'vote' as const, target }));
    }
    if (state.phase === 'guess' && state.impostors[state.round] === playerId) {
      return state.guessOptions[state.round]!.map((_, idx) => ({ type: 'guess' as const, idx }));
    }
    return [];
  },

  validate(state, action, playerId) {
    const legal = impostorEngine.legalActions(state, playerId);
    if (action.type === 'clue') return legal.some((a) => a.type === 'clue' && a.idx === action.idx);
    if (action.type === 'vote') return legal.some((a) => a.type === 'vote' && a.target === action.target);
    if (action.type === 'guess') return legal.some((a) => a.type === 'guess' && a.idx === action.idx);
    return false;
  },

  applyAction(state, action, playerId, rng) {
    if (!impostorEngine.validate(state, action, playerId)) return state;
    const n = state.playerCount;
    const impostor = state.impostors[state.round]!;

    if (action.type === 'clue') {
      const clue = state.options[state.round]![playerId]![action.idx]!;
      const clues = state.clues.map((r) => [...r]);
      clues[state.round]![playerId] = clue;
      const clueIdx = state.clueIdx + 1;
      if (clueIdx < n) {
        return { ...state, clues, clueIdx, lastEvent: { kind: 'clue', player: playerId, clue } };
      }
      return { ...state, clues, clueIdx, phase: 'vote', voteIdx: 0, lastEvent: { kind: 'clue', player: playerId, clue } };
    }

    if (action.type === 'vote') {
      const votes = [...state.votes];
      votes[playerId] = action.target;
      const voteIdx = state.voteIdx + 1;
      if (voteIdx < n) {
        return { ...state, votes, voteIdx, lastEvent: { kind: 'vote', player: playerId, target: action.target } };
      }
      // tally
      const tally = new Map<number, number>();
      for (const v of votes) if (v >= 0) tally.set(v, (tally.get(v) ?? 0) + 1);
      const sorted = [...tally.entries()].sort((a, b) => b[1]! - a[1]!);
      const top = sorted[0];
      const second = sorted[1];
      const accused = top && (!second || top[1]! > second[1]!) ? top[0]! : null;

      if (accused === null || accused !== impostor) {
        // impostor survives the vote
        const scores = [...state.scores];
        scores[impostor]! += 2;
        return finishRound(
          { ...state, votes, scores, lastEvent: { kind: 'survived', impostor } },
          { kind: 'survived', impostor },
        );
      }
      // caught! the impostor gets one chance to guess the word
      return {
        ...state,
        votes,
        phase: 'guess',
        lastEvent: { kind: 'accused', target: accused, impostor, correct: true },
      };
    }

    // guess
    const chosenWord = state.guessOptions[state.round]![action.idx]!;
    const correct = chosenWord === state.words[state.round]!;
    const scores = [...state.scores];
    if (correct) {
      scores[impostor]! += 3; // stole the win
    } else {
      for (let i = 0; i < n; i++) if (i !== impostor) scores[i]! += 1;
    }
    const guessEvent: ImpostorEvent = {
      kind: 'guess',
      impostor,
      correct,
      word: WORDS[state.words[state.round]!]!.name.en,
    };
    return finishRound({ ...state, scores, lastEvent: guessEvent }, guessEvent);
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    const n = state.playerCount;
    if (state.phase === 'clue' && state.clueIdx === playerId) {
      return { type: 'clue', idx: rng.int(4) };
    }
    if (state.phase === 'vote' && state.voteIdx === playerId) {
      const impostor = state.impostors[state.round]!;
      const word = WORDS[state.words[state.round]!]!;
      if (playerId === impostor) {
        // frame a random crew member
        const crew = Array.from({ length: n }, (_, i) => i).filter((i) => i !== playerId);
        return { type: 'vote', target: rng.pick(crew) };
      }
      // crew bot: spot the mismatching clue with a difficulty-based chance
      const detect = difficulty === 'easy' ? 0.55 : difficulty === 'medium' ? 0.75 : 0.9;
      const mismatch = Array.from({ length: n }, (_, i) => i).filter(
        (i) => i !== playerId && !word.clues.some((c) => c === state.clues[state.round]![i]),
      );
      if (rng.next() < detect && mismatch.length > 0) {
        return { type: 'vote', target: rng.pick(mismatch) };
      }
      const others = Array.from({ length: n }, (_, i) => i).filter((i) => i !== playerId);
      return { type: 'vote', target: rng.pick(others) };
    }
    if (state.phase === 'guess' && state.impostors[state.round] === playerId) {
      const chance = difficulty === 'easy' ? 0.2 : difficulty === 'medium' ? 0.4 : 0.6;
      const real = state.words[state.round]!;
      const realIdx = state.guessOptions[state.round]!.indexOf(real);
      if (rng.next() < chance) return { type: 'guess', idx: realIdx };
      const wrongs = state.guessOptions[state.round]!.map((_, i) => i).filter((i) => i !== realIdx);
      return { type: 'guess', idx: rng.pick(wrongs) };
    }
    return null;
  },

  currentPlayers(state) {
    if (state.phase === 'clue') return [state.clueIdx];
    if (state.phase === 'vote') return [state.voteIdx];
    if (state.phase === 'guess') return [state.impostors[state.round]!];
    return [];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    if (state.phase !== 'over') return [];
    const best = Math.max(...state.scores);
    return state.scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  },
};
