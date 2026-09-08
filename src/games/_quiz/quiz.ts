import type { GameEngine, RNG } from '../../core/types';

/**
 * Shared turn-based quiz engine used by Trivia and Emoji Charades.
 * A deck of items (question indexes) is shuffled; on each turn the current
 * player picks one of `optionCount` options. Correct answers score
 * 10 + streak·bonus, wrong answers reset the streak. After every answer the
 * engine pauses in a `reveal` phase (so everyone sees the result) until
 * someone plays `{ type: 'next' }`.
 */

export interface QuizState {
  playerCount: number;
  scores: number[];
  streaks: number[];
  /** remaining item indexes in the deck */
  deck: number[];
  /** current item index (data-space) and display permutation of options */
  qi: number | null;
  order: number[];
  /** answers given so far */
  answered: number;
  totalRounds: number;
  turn: number;
  phase: 'ask' | 'reveal' | 'over';
  lastEvent: {
    player: number;
    qi: number;
    choice: number; // display index picked
    correct: boolean;
    gained: number;
  } | null;
}

export type QuizAction = { type: 'answer'; choice: number } | { type: 'next' };

export interface QuizItemSpec {
  /** number of display options (2–4) */
  optionCount: number;
  /** correct option index in data-space */
  answer: number;
}

const BASE_POINTS = 10;
const STREAK_BONUS = 2;
const MAX_STREAK_BONUS = 5;

export function makeQuizEngine(
  specs: readonly QuizItemSpec[],
  opts: { perPlayer: number; botAccuracy?: Record<'easy' | 'medium' | 'hard', number> },
): GameEngine<QuizState, QuizAction> {
  const accuracy = opts.botAccuracy ?? { easy: 0.3, medium: 0.65, hard: 0.92 };
  const orderFor = (qi: number, rng: RNG): number[] =>
    rng.shuffle(Array.from({ length: specs[qi]!.optionCount }, (_, i) => i));

  const engine: GameEngine<QuizState, QuizAction> = {
    createInitialState(config, rng) {
      const playerCount = config.slots.length;
      const totalRounds = opts.perPlayer * playerCount;
      if (totalRounds > specs.length) {
        throw new Error(`deck too small: need ${totalRounds} items, have ${specs.length}`);
      }
      const deck = rng.shuffle(specs.map((_, i) => i));
      const qi = deck.pop()!;
      const order = orderFor(qi, rng);
      return {
        playerCount,
        scores: Array.from({ length: playerCount }, () => 0),
        streaks: Array.from({ length: playerCount }, () => 0),
        deck,
        qi,
        order,
        answered: 0,
        totalRounds,
        turn: 0,
        phase: 'ask',
        lastEvent: null,
      };
    },

    legalActions(state, playerId) {
      if (state.phase === 'ask' && state.turn === playerId) {
        const n = state.qi !== null ? specs[state.qi]!.optionCount : 0;
        return Array.from({ length: n }, (_, choice) => ({ type: 'answer' as const, choice }));
      }
      if (state.phase === 'reveal' && state.lastEvent?.player === playerId) {
        return [{ type: 'next' as const }];
      }
      return [];
    },

    validate(state, action, playerId) {
      return engine.legalActions(state, playerId).some(
        (a) => a.type === action.type && (a.type !== 'answer' || a.choice === (action as { choice: number }).choice),
      );
    },

    applyAction(state, action, playerId, rng) {
      if (!engine.validate(state, action, playerId)) return state;

      if (action.type === 'answer') {
        const qi = state.qi!;
        const spec = specs[qi]!;
        const correct = action.choice === state.order.indexOf(spec.answer);
        const streakBefore = Math.min(state.streaks[playerId]!, MAX_STREAK_BONUS);
        const gained = correct ? BASE_POINTS + streakBefore * STREAK_BONUS : 0;
        const scores = [...state.scores];
        const streaks = [...state.streaks];
        scores[playerId]! += gained;
        streaks[playerId]! = correct ? streaks[playerId]! + 1 : 0;
        return {
          ...state,
          scores,
          streaks,
          answered: state.answered + 1,
          phase: 'reveal',
          lastEvent: { player: playerId, qi, choice: action.choice, correct, gained },
        };
      }

      // action.type === 'next'
      if (state.answered >= state.totalRounds) {
        return { ...state, phase: 'over' as const, qi: null };
      }
      const deck = [...state.deck];
      const qi = deck.pop()!;
      return {
        ...state,
        deck,
        qi,
        order: orderFor(qi, rng),
        turn: (state.lastEvent!.player + 1) % state.playerCount,
        phase: 'ask' as const,
        lastEvent: null,
      };
    },

    chooseBotMove(state, playerId, rng, difficulty) {
      if (state.phase === 'reveal' && state.lastEvent?.player === playerId) return { type: 'next' };
      if (state.phase !== 'ask' || state.turn !== playerId) return null;
      const spec = specs[state.qi!]!;
      const correctDisplayIdx = state.order.indexOf(spec.answer);
      const right = rng.next() < accuracy[difficulty];
      if (right) return { type: 'answer', choice: correctDisplayIdx };
      const wrongs = Array.from({ length: spec.optionCount }, (_, i) => i).filter((i) => i !== correctDisplayIdx);
      return { type: 'answer', choice: rng.pick(wrongs) };
    },

    currentPlayers(state) {
      if (state.phase === 'ask') return [state.turn];
      if (state.phase === 'reveal' && state.lastEvent) return [state.lastEvent.player];
      return [];
    },

    isGameOver(state) {
      return state.phase === 'over';
    },

    winners(state) {
      if (state.phase !== 'over') return [];
      const best = Math.max(...state.scores);
      if (best <= 0) return [];
      return state.scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
    },
  };

  return engine;
}
