import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export const CATEGORIES = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'triple',
  'quad',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'yacht',
  'chance',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, { fa: string; en: string }> = {
  ones: { fa: 'یک‌ها', en: 'Ones' },
  twos: { fa: 'دوها', en: 'Twos' },
  threes: { fa: 'سه‌ها', en: 'Threes' },
  fours: { fa: 'چهارها', en: 'Fours' },
  fives: { fa: 'پنج‌ها', en: 'Fives' },
  sixes: { fa: 'شش‌ها', en: 'Sixes' },
  triple: { fa: 'سه‌تایی', en: '3 of a kind' },
  quad: { fa: 'چهارتایی', en: '4 of a kind' },
  fullHouse: { fa: 'فول‌هاوس', en: 'Full house' },
  smallStraight: { fa: 'راه‌راه کوچک', en: 'Small straight' },
  largeStraight: { fa: 'راه‌راه بزرگ', en: 'Large straight' },
  yacht: { fa: 'پنج‌تایی! (یاتزی)', en: 'Yahtzee!' },
  chance: { fa: 'شانس', en: 'Chance' },
};

export interface DiceState {
  playerCount: number;
  /** scorecard per player: category → score (null = unscored) */
  scores: (Record<Category, number | null>)[];
  dice: number[];
  held: boolean[];
  rollsLeft: number;
  turn: number;
  round: number; // 1..13
  phase: 'roll' | 'assign' | 'over';
  lastEvent: { player: number; kind: 'roll' | 'assign'; category?: Category; value?: number } | null;
}

export type DiceAction = { type: 'roll'; hold: boolean[] } | { type: 'score'; category: Category };

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

export function scoreCategory(dice: number[], category: Category): number {
  const counts: Record<number, number> = {};
  for (const d of dice) counts[d] = (counts[d] ?? 0) + 1;
  const values = Object.values(counts).sort((a, b) => b - a);
  const sum = dice.reduce((a, b) => a + b, 0);

  switch (category) {
    case 'ones':
    case 'twos':
    case 'threes':
    case 'fours':
    case 'fives':
    case 'sixes': {
      const n = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 }[category];
      return dice.filter((d) => d === n).length * n;
    }
    case 'triple':
      return values[0]! >= 3 ? sum : 0;
    case 'quad':
      return values[0]! >= 4 ? sum : 0;
    case 'fullHouse': {
      const isFull =
        (values[0] === 3 && values[1] === 2) || values[0] === 5;
      return isFull ? 25 : 0;
    }
    case 'smallStraight': {
      const uniq = Array.from(new Set(dice)).sort((a, b) => a - b);
      const runs = [ [1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6] ];
      return runs.some((run) => run.every((n) => uniq.includes(n))) ? 30 : 0;
    }
    case 'largeStraight': {
      const uniq = Array.from(new Set(dice)).sort((a, b) => a - b).join(',');
      return uniq === '1,2,3,4,5' || uniq === '2,3,4,5,6' ? 40 : 0;
    }
    case 'yacht':
      return values[0] === 5 ? 50 : 0;
    case 'chance':
      return sum;
  }
}

export function totalScore(scores: Record<Category, number | null>): number {
  const upper = (['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'] as Category[]).reduce(
    (sum, c) => sum + (scores[c] ?? 0),
    0,
  );
  const bonus = upper >= 63 ? 35 : 0;
  const lower = (['triple', 'quad', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht', 'chance'] as Category[]).reduce(
    (sum, c) => sum + (scores[c] ?? 0),
    0,
  );
  return upper + bonus + lower;
}

export function upperSection(scores: Record<Category, number | null>): { sum: number; bonus: number } {
  const sum = (['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'] as Category[]).reduce(
    (acc, c) => acc + (scores[c] ?? 0),
    0,
  );
  return { sum, bonus: sum >= 63 ? 35 : 0 };
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const diceEngine: GameEngine<DiceState, DiceAction> = {
  createInitialState(config, rng) {
    const playerCount = config.slots.length;
    const emptyCard = () =>
      Object.fromEntries(CATEGORIES.map((c) => [c, null])) as Record<Category, number | null>;
    const dice = Array.from({ length: 5 }, () => rng.int(6) + 1);
    return {
      playerCount,
      scores: Array.from({ length: playerCount }, emptyCard),
      dice,
      held: [false, false, false, false, false],
      rollsLeft: 2,
      turn: 0,
      round: 1,
      phase: 'roll',
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.turn !== playerId) return [];
    if (state.phase === 'roll') {
      if (state.rollsLeft <= 0) return [];
      const actions: DiceAction[] = [];
      const combos = 1 << 5;
      for (let mask = 0; mask < combos; mask++) {
        const hold = Array.from({ length: 5 }, (_, i) => Boolean((mask >> i) & 1));
        actions.push({ type: 'roll', hold });
      }
      return actions;
    }
    if (state.phase === 'assign') {
      return CATEGORIES.filter((c) => state.scores[playerId]?.[c] === null).map((c) => ({
        type: 'score' as const,
        category: c,
      }));
    }
    return [];
  },

  validate(state, action, playerId) {
    if (state.turn !== playerId) return false;
    if (action.type === 'roll') {
      return state.phase === 'roll' && state.rollsLeft > 0 && action.hold.length === 5;
    }
    return state.phase === 'assign' && state.scores[playerId]?.[action.category] === null;
  },

  applyAction(state, action, playerId, rng) {
    if (!diceEngine.validate(state, action, playerId)) return state;

    if (action.type === 'roll') {
      const dice = state.dice.map((d, i) => (action.hold[i] ? d : rng.int(6) + 1));
      const rollsLeft = state.rollsLeft - 1;
      if (rollsLeft > 0) {
        return { ...state, dice, rollsLeft, lastEvent: { player: playerId, kind: 'roll' } };
      }
      // last roll → must assign
      return { ...state, dice, rollsLeft: 0, phase: 'assign', lastEvent: { player: playerId, kind: 'roll' } };
    }

    // score
    const scores = state.scores.map((card) => ({ ...card }));
    const value = scoreCategory(state.dice, action.category);
    scores[playerId]![action.category] = value;

    const isLastRound = state.round >= 13 && (playerId + 1) % state.playerCount === 0;
    if (isLastRound) {
      return {
        ...state,
        scores,
        phase: 'over',
        lastEvent: { player: playerId, kind: 'assign', category: action.category, value },
      };
    }

    const nextPlayer = (playerId + 1) % state.playerCount;
    const nextRound = nextPlayer === 0 ? state.round + 1 : state.round;
    return {
      ...state,
      scores,
      dice: Array.from({ length: 5 }, () => rng.int(6) + 1),
      held: [false, false, false, false, false],
      rollsLeft: 2,
      turn: nextPlayer,
      round: nextRound,
      phase: 'roll',
      lastEvent: { player: playerId, kind: 'assign', category: action.category, value },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    const legal = diceEngine.legalActions(state, playerId);
    if (legal.length === 0) return null;

    if (state.phase === 'roll') {
      if (difficulty === 'easy') {
        // random holds
        const hold = Array.from({ length: 5 }, () => rng.next() < 0.5);
        return { type: 'roll', hold };
      }
      // keep the dice value that appears most (or a straight run)
      const counts: Record<number, number> = {};
      for (const d of state.dice) counts[d] = (counts[d] ?? 0) + 1;
      let bestVal = 0;
      let bestCount = 0;
      for (const [v, c] of Object.entries(counts)) {
        if (c > bestCount || (c === bestCount && Number(v) > bestVal)) {
          bestVal = Number(v);
          bestCount = c;
        }
      }
      const hold =
        bestCount >= 2
          ? state.dice.map((d) => d === bestVal)
          : state.dice.map(() => false); // reroll everything when nothing pairs
      return { type: 'roll', hold };
    }

    // assign: pick the highest-scoring available category
    const options = legal.filter((a): a is Extract<DiceAction, { type: 'score' }> => a.type === 'score');
    let best = options[0]!;
    let bestScore = -1;
    for (const option of options) {
      let v = scoreCategory(state.dice, option.category);
      // slight preference for keeping upper-section holes for the bonus
      if (v === 0 && ['smallStraight', 'largeStraight'].includes(option.category)) v = 0.5;
      if (v > bestScore) {
        bestScore = v;
        best = option;
      }
    }
    return best;
  },

  currentPlayers(state) {
    return state.phase === 'over' ? [] : [state.turn];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    if (state.phase !== 'over') return [];
    const totals = state.scores.map((card) => totalScore(card));
    const max = Math.max(...totals);
    return totals.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
  },
};
