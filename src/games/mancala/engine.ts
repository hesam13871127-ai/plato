import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Board layout: pits 0..5 = P0, 6 = P0 store, 7..12 = P1, 13 = P1 store */
/* ------------------------------------------------------------------ */

export const STORE_P0 = 6;
export const STORE_P1 = 13;

export function pitOwner(pit: number): 0 | 1 {
  return pit <= 5 ? 0 : pit >= 7 && pit <= 12 ? 1 : (pit === STORE_P0 ? 0 : 1);
}

export function oppositePit(pit: number): number {
  return 12 - pit;
}

export interface MancalaState {
  pits: number[]; // 14 entries
  turn: number;
  phase: 'play' | 'over';
  winner: number | null;
  lastEvent: {
    player: number;
    pit: number;
    lastSeedPit: number;
    captured: number;
    extraTurn: boolean;
    swept: { player: number; amount: number } | null;
  } | null;
}

export type MancalaAction = { type: 'sow'; pit: number };

/* ------------------------------------------------------------------ */

function sideEmpty(pits: number[], player: number): boolean {
  const from = player === 0 ? 0 : 7;
  return pits.slice(from, from + 6).every((n) => n === 0);
}

/* ------------------------------------------------------------------ */

export const mancalaEngine: GameEngine<MancalaState, MancalaAction> = {
  createInitialState() {
    return {
      pits: [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0],
      turn: 0,
      phase: 'play',
      winner: null,
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'play' || state.turn !== playerId) return [];
    const from = playerId === 0 ? 0 : 7;
    const out: MancalaAction[] = [];
    for (let i = 0; i < 6; i++) {
      if (state.pits[from + i]! > 0) out.push({ type: 'sow', pit: from + i });
    }
    return out;
  },

  validate(state, action, playerId) {
    if (action.type !== 'sow' || state.phase !== 'play' || state.turn !== playerId) return false;
    const pit = action.pit;
    if (pit < 0 || pit > 13 || pit === STORE_P0 || pit === STORE_P1) return false;
    if (pitOwner(pit) !== playerId) return false;
    return state.pits[pit]! > 0;
  },

  applyAction(state, action, playerId) {
    if (!mancalaEngine.validate(state, action, playerId)) return state;

    const pits = [...state.pits];
    const myStore = playerId === 0 ? STORE_P0 : STORE_P1;
    const oppStore = playerId === 0 ? STORE_P1 : STORE_P0;

    let hand = pits[action.pit]!;
    pits[action.pit] = 0;
    let pit = action.pit;

    while (hand > 0) {
      pit = (pit + 1) % 14;
      if (pit === oppStore) continue; // skip the opponent's store
      pits[pit]!++;
      hand--;
    }

    let captured = 0;
    let extraTurn = false;
    const lastPit = pit;

    if (pit === myStore) {
      extraTurn = true; // landed in own store
    } else if (pitOwner(pit) === playerId && pits[pit] === 1) {
      // landed in an empty own pit → capture it + the opposite pit
      const opp = oppositePit(pit);
      captured = 1 + pits[opp]!;
      pits[myStore]! += captured;
      pits[pit] = 0;
      pits[opp] = 0;
    }

    // sweep when either side is empty
    let swept: { player: number; amount: number } | null = null;
    if (sideEmpty(pits, 0) || sideEmpty(pits, 1)) {
      for (const player of [0, 1] as const) {
        const from = player === 0 ? 0 : 7;
        const store = player === 0 ? STORE_P0 : STORE_P1;
        let amount = 0;
        for (let i = 0; i < 6; i++) {
          amount += pits[from + i]!;
          pits[from + i] = 0;
        }
        pits[store]! += amount;
        if (amount > 0) swept = { player, amount };
      }
      const s0 = pits[STORE_P0]!;
      const s1 = pits[STORE_P1]!;
      return {
        pits,
        turn: playerId,
        phase: 'over',
        winner: s0 === s1 ? null : s0 > s1 ? 0 : 1,
        lastEvent: { player: playerId, pit: action.pit, lastSeedPit: lastPit, captured, extraTurn, swept },
      };
    }

    return {
      pits,
      turn: extraTurn ? playerId : 1 - playerId,
      phase: 'play',
      winner: null,
      lastEvent: { player: playerId, pit: action.pit, lastSeedPit: lastPit, captured, extraTurn, swept },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    const legal = mancalaEngine.legalActions(state, playerId);
    if (legal.length === 0) return null;
    if (difficulty === 'easy') return rng.pick(legal);

    // simulate each move: prefer extra turns, then captures, then store gain
    let best = legal[0]!;
    let bestScore = -Infinity;
    for (const action of legal) {
      const after = mancalaEngine.applyAction(state, action, playerId, rng);
      const myStore = playerId === 0 ? STORE_P0 : STORE_P1;
      const oppStore = playerId === 0 ? STORE_P1 : STORE_P0;
      let score = after.pits[myStore]! - state.pits[myStore]!;
      score -= (after.pits[oppStore]! - state.pits[oppStore]!) * 0.9;
      if (after.phase === 'over') {
        score += (after.winner === playerId ? 100 : after.winner === null ? 0 : -100);
      } else {
        if (after.lastEvent?.extraTurn) score += 6;
        if (after.lastEvent?.captured) score += (after.lastEvent.captured - 1) * 1.2;
        // small randomness for variety
        score += rng.next() * 0.3;
      }
      if (score > bestScore) {
        bestScore = score;
        best = action;
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
    return state.winner !== null ? [state.winner] : [];
  },
};
