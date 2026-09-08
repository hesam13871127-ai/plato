import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Board: points indexed 0..23 (= point 1..24).                        */
/* points[i] > 0 → that many P0(white) checkers; < 0 → P1(black).      */
/* P0 moves 24→1 and bears off from points 1–6 (indices 0–5).          */
/* P1 moves 1→24 and bears off from points 19–24 (indices 18–23).      */
/* ------------------------------------------------------------------ */

export const BAR = -1;
export const OFF = -2;

export interface BackgammonState {
  points: number[]; // 24 signed counts
  bar: [number, number]; // [p0, p1]
  borneOff: [number, number];
  turn: number;
  dice: [number, number] | null;
  remaining: number[]; // dice values still to play
  phase: 'roll' | 'move' | 'over';
  winner: number | null;
  lastEvent: {
    player: number;
    kind: 'roll' | 'move' | 'hit' | 'bearoff' | 'skip';
    from?: number;
    to?: number;
    die?: number;
    value?: [number, number];
  } | null;
}

export type BackgammonAction =
  | { type: 'roll' }
  | { type: 'move'; from: number | 'bar'; to: number | 'off'; die: number };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function pipCount(state: BackgammonState, player: number): number {
  let pips = 0;
  for (let i = 0; i < 24; i++) {
    const v = state.points[i]!;
    if (player === 0 && v > 0) pips += v * (i + 1);
    if (player === 1 && v < 0) pips += -v * (24 - i);
  }
  pips += state.bar[player]! * 25;
  return pips;
}

function homeIndices(player: number): number[] {
  return player === 0 ? [0, 1, 2, 3, 4, 5] : [18, 19, 20, 21, 22, 23];
}

function allInHome(state: BackgammonState, player: number): boolean {
  if (state.bar[player]! > 0) return false;
  const lo = player === 0 ? 6 : 0;
  const hi = player === 0 ? 24 : 18;
  for (let i = lo; i < hi; i++) {
    const v = state.points[i]!;
    if (player === 0 && v > 0) return false;
    if (player === 1 && v < 0) return false;
  }
  return true;
}

function enemyBlocks(state: BackgammonState, player: number, idx: number): boolean {
  const v = state.points[idx]!;
  return player === 0 ? v <= -2 : v >= 2;
}

type BgMove = Extract<BackgammonAction, { type: 'move' }>;

function movesForDie(state: BackgammonState, player: number, die: number): BgMove[] {
  const out: BgMove[] = [];
  const sign = player === 0 ? 1 : -1; // points[i] sign of own checkers

  // entering from the bar
  if (state.bar[player]! > 0) {
    const idx = player === 0 ? 24 - die : die - 1;
    if (!enemyBlocks(state, player, idx)) out.push({ type: 'move', from: 'bar', to: idx, die });
    return out;
  }

  for (let i = 0; i < 24; i++) {
    const v = state.points[i]!;
    if (player === 0 && v <= 0) continue;
    if (player === 1 && v >= 0) continue;
    void sign;

    const target = player === 0 ? i - die : i + die;
    if (target >= 0 && target <= 23) {
      if (!enemyBlocks(state, player, target)) out.push({ type: 'move', from: i, to: target, die });
      continue;
    }

    // bear off
    if (allInHome(state, player)) {
      const distance = player === 0 ? i + 1 : 24 - i;
      if (die === distance) {
        out.push({ type: 'move', from: i, to: 'off', die });
      } else if (die > distance) {
        // only from the farthest occupied point (no checkers farther away)
        let farther = false;
        const lo = player === 0 ? i + 1 : 18;
        const hi = player === 0 ? 6 : i;
        for (let k = lo; k < hi; k++) {
          const w = state.points[k]!;
          if (player === 0 && w > 0) farther = true;
          if (player === 1 && w < 0) farther = true;
        }
        if (!farther) out.push({ type: 'move', from: i, to: 'off', die });
      }
    }
  }
  return out;
}

function allMoves(state: BackgammonState, player: number): BgMove[] {
  const uniq = new Set<string>();
  const out: BgMove[] = [];
  for (const die of state.remaining) {
    for (const m of movesForDie(state, player, die)) {
      const key = m.from === 'bar' ? `bar-${m.to}` : m.to === 'off' ? `${m.from}-off` : `${m.from}-${m.to}`;
      if (uniq.has(key)) continue;
      uniq.add(key);
      out.push(m);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Bot evaluation                                                      */
/* ------------------------------------------------------------------ */

function evaluate(state: BackgammonState, me: number): number {
  const opp = 1 - me;
  let score = pipCount(state, opp) - pipCount(state, me);
  // borne off checkers
  score += state.borneOff[me]! * 30 - state.borneOff[opp]! * 30;
  // opponent on the bar is great
  score += state.bar[opp]! * 14;
  // blots (single checkers) are risky
  for (let i = 0; i < 24; i++) {
    const v = state.points[i]!;
    if (v === 1 && me === 0) score -= 4;
    if (v === -1 && me === 1) score -= 4;
    if (v === 1 && me === 1) score += 1;
    if (v === -1 && me === 0) score += 1;
  }
  // made points (2+) in the home board are valuable
  for (const i of homeIndices(me)) {
    const v = state.points[i]!;
    if (me === 0 && v >= 2) score += 4;
    if (me === 1 && v <= -2) score += 4;
  }
  return score;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const backgammonEngine: GameEngine<BackgammonState, BackgammonAction> = {
  createInitialState(): BackgammonState {
    const points = Array(24).fill(0);
    // P0 (white): 2 on 24, 5 on 13, 3 on 8, 5 on 6
    points[23] = 2;
    points[12] = 5;
    points[7] = 3;
    points[5] = 5;
    // P1 (black): 2 on 1, 5 on 12, 3 on 17, 5 on 19
    points[0] = -2;
    points[11] = -5;
    points[16] = -3;
    points[18] = -5;
    return {
      points,
      bar: [0, 0],
      borneOff: [0, 0],
      turn: 0,
      dice: null,
      remaining: [],
      phase: 'roll',
      winner: null,
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.turn !== playerId) return [];
    if (state.phase === 'roll') return [{ type: 'roll' }];
    if (state.phase === 'move') return allMoves(state, playerId);
    return [];
  },

  validate(state, action, playerId) {
    if (state.turn !== playerId) return false;
    if (action.type === 'roll') return state.phase === 'roll';
    if (state.phase !== 'move') return false;
    return allMoves(state, playerId).some(
      (m) =>
        m.type === 'move' &&
        m.from === action.from &&
        m.to === action.to &&
        m.die === action.die,
    );
  },

  applyAction(state, action, playerId, rng) {
    if (!backgammonEngine.validate(state, action, playerId)) return state;

    if (action.type === 'roll') {
      const d1 = rng.int(6) + 1;
      const d2 = rng.int(6) + 1;
      const dice: [number, number] = [d1, d2];
      const remaining = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      const s: BackgammonState = {
        ...state,
        points: [...state.points],
        bar: [...state.bar] as [number, number],
        borneOff: [...state.borneOff] as [number, number],
        dice,
        remaining,
        phase: 'move',
        lastEvent: { player: playerId, kind: 'roll', value: [d1, d2] },
      };
      if (allMoves(s, playerId).length === 0) {
        return {
          ...s,
          phase: 'roll',
          remaining: [],
          dice: null,
          turn: (playerId + 1) % 2,
          lastEvent: { player: playerId, kind: 'skip', value: [d1, d2] },
        };
      }
      return s;
    }

    // move
    const points = [...state.points];
    const bar: [number, number] = [...state.bar] as [number, number];
    const borneOff: [number, number] = [...state.borneOff] as [number, number];
    let kind: 'move' | 'hit' | 'bearoff' = 'move';

    // remove from source
    if (action.from === 'bar') {
      bar[playerId]! -= 1;
    } else {
      points[action.from]! += playerId === 0 ? -1 : 1;
    }

    if (action.to === 'off') {
      borneOff[playerId]! += 1;
      kind = 'bearoff';
    } else {
      const v = points[action.to]!;
      // hit a blot
      if (playerId === 0 && v === -1) {
        points[action.to] = 1;
        bar[1]! += 1;
        kind = 'hit';
      } else if (playerId === 1 && v === 1) {
        points[action.to] = -1;
        bar[0]! += 1;
        kind = 'hit';
      } else {
        points[action.to]! += playerId === 0 ? 1 : -1;
      }
    }

    const remaining = [...state.remaining];
    const dieIdx = remaining.indexOf(action.die);
    if (dieIdx >= 0) remaining.splice(dieIdx, 1);

    let s: BackgammonState = {
      ...state,
      points,
      bar,
      borneOff,
      remaining,
      phase: 'move',
      lastEvent: { player: playerId, kind, from: action.from === 'bar' ? undefined : action.from, to: action.to === 'off' ? undefined : action.to, die: action.die },
    };

    if (s.borneOff[playerId]! >= 15) {
      return { ...s, phase: 'over', winner: playerId, remaining: [], dice: null };
    }

    if (remaining.length === 0 || allMoves(s, playerId).length === 0) {
      s = {
        ...s,
        phase: 'roll',
        turn: (playerId + 1) % 2,
        remaining: remaining.length > 0 ? [] : [],
        dice: null,
        lastEvent:
          remaining.length > 0
            ? { player: playerId, kind: 'skip', value: s.dice ?? undefined }
            : s.lastEvent,
      };
    }
    return s;
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    const legal = backgammonEngine.legalActions(state, playerId);
    if (legal.length === 0) return null;
    if (legal[0]!.type === 'roll') return { type: 'roll' };
    if (difficulty === 'easy') {
      const moves = legal.filter((a): a is BgMove => a.type === 'move');
      return rng.pick(moves);
    }

    const moves = legal.filter((a): a is BgMove => a.type === 'move');
    let best = moves[0]!;
    let bestScore = -Infinity;
    for (const move of moves) {
      const after = backgammonEngine.applyAction(state, move, playerId, rng);
      let score = evaluate(after, playerId);
      // prefer keeping the turn (more dice remaining)
      if (after.turn === playerId && after.phase === 'move') score += 2;
      score += rng.next() * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = move;
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
