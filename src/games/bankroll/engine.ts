import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * Bankroll — push-your-luck card game ("in between").
 * Each turn the dealer lays two cards face up; the active player stakes
 * chips on the next card landing strictly between them. Narrow spreads pay
 * big multipliers, wide spreads pay even money, and hitting either post
 * (matching a table card) costs DOUBLE the stake.
 */

export const START_CHIPS = 100;
export const PASS_FEE = 2;
export const TURNS_PER_PLAYER = 10;

export interface BankrollState {
  playerCount: number;
  banks: number[];
  /** remaining ranks 1..13 (×4 suits), shuffled */
  deck: number[];
  discard: number[];
  /** the two face-up table cards */
  table: [number, number] | null;
  turn: number;
  turnsTaken: number;
  phase: 'bet' | 'over';
  lastEvent: {
    player: number;
    kind: 'win' | 'lose' | 'post' | 'pass' | 'deal';
    stake: number;
    payout: number;
    card: number | null;
    table: [number, number] | null;
  } | null;
}

export type BankrollAction =
  | { type: 'bet'; amount: number }
  | { type: 'pass' };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function freshDeck(): number[] {
  const cards: number[] = [];
  for (let rank = 1; rank <= 13; rank++) for (let s = 0; s < 4; s++) cards.push(rank);
  return cards;
}

function draw(state: BankrollState, rng: RNG): number {
  if (state.deck.length === 0) {
    state.deck = rng.shuffle(state.discard);
    state.discard = [];
  }
  return state.deck.pop()!;
}

/** payout multiplier for a spread (number of winning ranks) */
export function spreadMultiplier(spread: number): number {
  if (spread <= 1) return 5;
  if (spread <= 3) return 3;
  if (spread <= 6) return 2;
  return 1;
}

function nextSolvent(state: BankrollState, from: number): number {
  for (let i = 1; i <= state.playerCount; i++) {
    const idx = (from + i) % state.playerCount;
    if (state.banks[idx]! > 0) return idx;
  }
  return from;
}

function solventCount(state: BankrollState): number {
  return state.banks.filter((b) => b > 0).length;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const bankrollEngine: GameEngine<BankrollState, BankrollAction> = {
  createInitialState(config, rng) {
    const playerCount = config.slots.length;
    const s: BankrollState = {
      playerCount,
      banks: Array.from({ length: playerCount }, () => START_CHIPS),
      deck: rng.shuffle(freshDeck()),
      discard: [],
      table: null,
      turn: 0,
      turnsTaken: 0,
      phase: 'bet',
      lastEvent: null,
    };
    const a = draw(s, rng);
    const b = draw(s, rng);
    s.table = [a, b];
    s.lastEvent = { player: -1, kind: 'deal', stake: 0, payout: 0, card: null, table: s.table };
    return s;
  },

  legalActions(state, playerId) {
    if (state.phase !== 'bet' || state.turn !== playerId || state.banks[playerId]! <= 0) return [];
    const bank = state.banks[playerId]!;
    const acts: BankrollAction[] = [{ type: 'pass' }];
    for (let a = 1; a <= bank; a++) acts.push({ type: 'bet', amount: a });
    return acts;
  },

  validate(state, action, playerId) {
    if (state.phase !== 'bet' || state.turn !== playerId) return false;
    if (state.banks[playerId]! <= 0) return false;
    if (action.type === 'pass') return true;
    if (action.type === 'bet') {
      return Number.isInteger(action.amount) && action.amount >= 1 && action.amount <= state.banks[playerId]!;
    }
    return false;
  },

  applyAction(state, action, playerId, rng) {
    if (!bankrollEngine.validate(state, action, playerId)) return state;
    const working: BankrollState = {
      ...state,
      banks: [...state.banks],
      deck: [...state.deck],
      discard: [...state.discard],
    };
    const [a, b] = working.table!;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);

    if (action.type === 'pass') {
      working.banks[playerId]! -= PASS_FEE;
      working.discard.push(a, b);
      working.table = [draw(working, rng), draw(working, rng)];
      working.turnsTaken += 1;
      working.lastEvent = { player: playerId, kind: 'pass', stake: PASS_FEE, payout: -PASS_FEE, card: null, table: working.table };
    } else {
      const card = draw(working, rng);
      const spread = hi - lo - 1;
      let kind: 'win' | 'lose' | 'post';
      let payout: number;
      if (card === lo || card === hi) {
        kind = 'post';
        payout = -2 * action.amount;
      } else if (card > lo && card < hi) {
        kind = 'win';
        payout = action.amount * spreadMultiplier(spread);
      } else {
        kind = 'lose';
        payout = -action.amount;
      }
      working.banks[playerId]! += payout;
      working.discard.push(a, b, card);
      working.table = [draw(working, rng), draw(working, rng)];
      working.turnsTaken += 1;
      working.lastEvent = { player: playerId, kind, stake: action.amount, payout, card, table: working.table };
    }

    // end conditions: one solvent player left or the turn budget spent
    const budget = TURNS_PER_PLAYER * state.playerCount;
    if (solventCount(working) <= 1 || working.turnsTaken >= budget) {
      working.phase = 'over';
    } else {
      working.turn = nextSolvent(working, working.turn);
    }
    return working;
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    if (state.phase !== 'bet' || state.turn !== playerId) return null;
    const [a, b] = state.table!;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const spread = hi - lo - 1;
    const bank = state.banks[playerId]!;

    // expected value per chip: pWin·mult − pLose − 2·pPost
    const pWin = (spread * 4) / 50;
    const pPost = 8 / 50;
    const pLose = 1 - pWin - pPost;
    const ev = pWin * spreadMultiplier(spread) - pLose - 2 * pPost;

    const risk = difficulty === 'easy' ? -0.05 : difficulty === 'medium' ? 0.03 : 0.08;
    if (ev < risk) return { type: 'pass' };

    // stake a fraction of the bank, more when the edge is fat
    const frac = Math.min(0.5, Math.max(0.08, ev * 0.8));
    const amount = Math.max(1, Math.min(bank, Math.round(bank * frac * (0.7 + rng.next() * 0.6))));
    return { type: 'bet', amount };
  },

  currentPlayers(state) {
    return state.phase === 'bet' ? [state.turn] : [];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    if (state.phase !== 'over') return [];
    const best = Math.max(...state.banks);
    return state.banks.map((b, i) => (b === best ? i : -1)).filter((i) => i >= 0);
  },
};
