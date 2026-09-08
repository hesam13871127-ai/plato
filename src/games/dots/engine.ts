import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export const DOTS_N = 4; // 4×4 boxes → 5×5 dots

/** horizontal edges: (N+1) rows × N cols — h[r*N + c] is above box (r,c) */
/** vertical edges: N rows × (N+1) cols — v[r*(N+1) + c] is left of box (r,c) */

export interface DotsState {
  n: number;
  playerCount: number;
  /** -1 = unclaimed, otherwise the seat that drew it */
  h: number[];
  v: number[];
  /** -1 = unclaimed, otherwise the seat that completed the box */
  boxes: number[];
  scores: number[];
  turn: number;
  remaining: number; // unclaimed lines
  lastEvent: { player: number; kind: 'h' | 'v'; r: number; c: number; gained: number } | null;
}

export type DotsAction = { type: 'line'; kind: 'h' | 'v'; r: number; c: number };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function edgeIndex(kind: 'h' | 'v', r: number, c: number, n: number): number | null {
  if (kind === 'h') {
    if (r < 0 || r > n || c < 0 || c >= n) return null;
    return r * n + c;
  }
  if (r < 0 || r >= n || c < 0 || c > n) return null;
  return r * (n + 1) + c;
}

/** which boxes touch this edge (as [r, c] pairs) */
function adjacentBoxes(kind: 'h' | 'v', r: number, c: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  if (kind === 'h') {
    if (r > 0) out.push([r - 1, c]);
    if (r < n) out.push([r, c]);
  } else {
    if (c > 0) out.push([r, c - 1]);
    if (c < n) out.push([r, c]);
  }
  return out;
}

function boxSides(h: number[], v: number[], r: number, c: number, n: number): number {
  let sides = 0;
  if (h[edgeIndex('h', r, c, n)!] !== -1) sides++;
  if (h[edgeIndex('h', r + 1, c, n)!] !== -1) sides++;
  if (v[edgeIndex('v', r, c, n)!] !== -1) sides++;
  if (v[edgeIndex('v', r, c + 1, n)!] !== -1) sides++;
  return sides;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const dotsEngine: GameEngine<DotsState, DotsAction> = {
  createInitialState(config) {
    const n = DOTS_N;
    return {
      n,
      playerCount: config.slots.length,
      h: Array(n * (n + 1)).fill(-1),
      v: Array(n * (n + 1)).fill(-1),
      boxes: Array(n * n).fill(-1),
      scores: Array(config.slots.length).fill(0),
      turn: 0,
      remaining: 2 * n * (n + 1),
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.remaining === 0 || state.turn !== playerId) return [];
    const out: DotsAction[] = [];
    for (let r = 0; r <= state.n; r++) {
      for (let c = 0; c < state.n; c++) {
        if (state.h[edgeIndex('h', r, c, state.n)!] === -1) out.push({ type: 'line', kind: 'h', r, c });
      }
    }
    for (let r = 0; r < state.n; r++) {
      for (let c = 0; c <= state.n; c++) {
        if (state.v[edgeIndex('v', r, c, state.n)!] === -1) out.push({ type: 'line', kind: 'v', r, c });
      }
    }
    return out;
  },

  validate(state, action, playerId) {
    if (action.type !== 'line' || state.turn !== playerId || state.remaining === 0) return false;
    const idx = edgeIndex(action.kind, action.r, action.c, state.n);
    if (idx === null) return false;
    return (action.kind === 'h' ? state.h : state.v)[idx] === -1;
  },

  applyAction(state, action, playerId) {
    if (!dotsEngine.validate(state, action, playerId)) return state;
    const n = state.n;
    const idx = edgeIndex(action.kind, action.r, action.c, n)!;
    const h = [...state.h];
    const v = [...state.v];
    if (action.kind === 'h') h[idx] = playerId;
    else v[idx] = playerId;

    const boxes = [...state.boxes];
    const scores = [...state.scores];
    let gained = 0;
    for (const [br, bc] of adjacentBoxes(action.kind, action.r, action.c, n)) {
      const bi = br * n + bc;
      if (boxes[bi] === -1 && boxSides(h, v, br, bc, n) === 4) {
        boxes[bi] = playerId;
        scores[playerId]!++;
        gained++;
      }
    }

    const remaining = state.remaining - 1;
    // completing a box grants another turn
    const turn = gained > 0 && remaining > 0 ? playerId : (playerId + 1) % state.playerCount;

    return {
      ...state,
      h,
      v,
      boxes,
      scores,
      turn,
      remaining,
      lastEvent: { player: playerId, kind: action.kind, r: action.r, c: action.c, gained },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    const legal = dotsEngine.legalActions(state, playerId);
    if (legal.length === 0) return null;

    // helper: how many sides would each adjacent box have after placing?
    const danger = (action: DotsAction): number => {
      const h = [...state.h];
      const v = [...state.v];
      const idx = edgeIndex(action.kind, action.r, action.c, state.n)!;
      if (action.kind === 'h') h[idx] = playerId;
      else v[idx] = playerId;
      let worst = 0;
      for (const [br, bc] of adjacentBoxes(action.kind, action.r, action.c, state.n)) {
        if (state.boxes[br * state.n + bc] !== -1) continue;
        worst = Math.max(worst, boxSides(h, v, br, bc, state.n));
      }
      return worst;
    };

    // 1) take any box-completing line
    const completing = legal.filter((a) => {
      const h = [...state.h];
      const v = [...state.v];
      const idx = edgeIndex(a.kind, a.r, a.c, state.n)!;
      if (a.kind === 'h') h[idx] = playerId;
      else v[idx] = playerId;
      return adjacentBoxes(a.kind, a.r, a.c, state.n).some(([br, bc]) => {
        if (state.boxes[br * state.n + bc] !== -1) return false;
        return boxSides(h, v, br, bc, state.n) === 4;
      });
    });
    if (completing.length > 0) return rng.pick(completing);

    if (difficulty === 'easy') return rng.pick(legal);

    // 2) play a safe line (creates no 3-sided box)
    const safe = legal.filter((a) => danger(a) < 3);
    if (safe.length > 0) return rng.pick(safe);

    // 3) forced to give something away — hard bots give the smallest chain
    if (difficulty === 'hard') {
      let best = legal[0]!;
      let bestDanger = Infinity;
      for (const a of legal) {
        const d = danger(a) + rng.next() * 0.1;
        if (d < bestDanger) {
          bestDanger = d;
          best = a;
        }
      }
      return best;
    }
    return rng.pick(legal);
  },

  currentPlayers(state) {
    return state.remaining === 0 ? [] : [state.turn];
  },

  isGameOver(state) {
    return state.remaining === 0;
  },

  winners(state) {
    if (state.remaining > 0) return [];
    const max = Math.max(...state.scores);
    const leaders = state.scores.map((s, i) => (s === max ? i : -1)).filter((i) => i >= 0);
    return leaders;
  },
};
