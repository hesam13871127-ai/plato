import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export const R8 = 8; // board is 8×8, idx = y*8+x

export interface ReversiState {
  /** 0 empty, 1 dark (player 0), 2 light (player 1) */
  board: number[];
  turn: number;
  phase: 'play' | 'over';
  lastEvent: { player: number; idx: number; flipped: number[] } | null;
}

export type ReversiAction = { type: 'move'; idx: number };

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];

function onBoard(idx: number): boolean {
  return idx >= 0 && idx < 64;
}

function sameLine(a: number, b: number): boolean {
  // horizontal neighbours must stay on one row
  return Math.abs((a % R8) - (b % R8)) <= 1;
}

export function flipsFor(board: number[], idx: number, player: number): number[] {
  if (board[idx] !== 0) return [];
  const me = player === 0 ? 1 : 2;
  const opp = player === 0 ? 2 : 1;
  const all: number[] = [];
  for (const d of DIRS) {
    const line: number[] = [];
    let cur = idx + d;
    while (onBoard(cur) && sameLine(cur, cur - d) && board[cur] === opp) {
      line.push(cur);
      cur += d;
    }
    if (line.length > 0 && onBoard(cur) && sameLine(cur, cur - d) && board[cur] === me) {
      all.push(...line);
    }
  }
  return all;
}

export function reversiLegalIdxs(board: number[], player: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 64; i++) {
    if (board[i] === 0 && flipsFor(board, i, player).length > 0) out.push(i);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Bot evaluation                                                      */
/* ------------------------------------------------------------------ */

/** classic positional weights: corners rule, X/C squares bleed */
const WEIGHTS = [
  120, -25, 12, 6, 6, 12, -25, 120,
  -25, -45, 2, 2, 2, 2, -45, -25,
  12, 2, 6, 4, 4, 6, 2, 12,
  6, 2, 4, 2, 2, 4, 2, 6,
  6, 2, 4, 2, 2, 4, 2, 6,
  12, 2, 6, 4, 4, 6, 2, 12,
  -25, -45, 2, 2, 2, 2, -45, -25,
  120, -25, 12, 6, 6, 12, -25, 120,
];

function evaluate(board: number[], player: number): number {
  const me = player === 0 ? 1 : 2;
  let score = 0;
  for (let i = 0; i < 64; i++) {
    if (board[i] === me) score += WEIGHTS[i]!;
    else if (board[i] !== 0) score -= WEIGHTS[i]!;
  }
  return score;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const reversiEngine: GameEngine<ReversiState, ReversiAction> = {
  createInitialState(config) {
    void config;
    const board = Array.from({ length: 64 }, () => 0);
    board[27] = 2; // d4 light
    board[28] = 1; // e4 dark
    board[35] = 1; // d5 dark
    board[36] = 2; // e5 light
    return { board, turn: 0, phase: 'play', lastEvent: null };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'play' || state.turn !== playerId) return [];
    return reversiLegalIdxs(state.board, playerId).map((idx) => ({ type: 'move' as const, idx }));
  },

  validate(state, action, playerId) {
    if (state.phase !== 'play' || state.turn !== playerId) return false;
    if (action.type !== 'move') return false;
    return flipsFor(state.board, action.idx, playerId).length > 0;
  },

  applyAction(state, action, playerId) {
    if (!reversiEngine.validate(state, action, playerId)) return state;
    const me = playerId === 0 ? 1 : 2;
    const board = [...state.board];
    board[action.idx] = me;
    for (const f of flipsFor(state.board, action.idx, playerId)) board[f] = me;

    // next turn: opponent if they can move, else back to me; both stuck → over
    let turn = state.turn;
    let phase: ReversiState['phase'] = 'play';
    const opp = 1 - playerId;
    if (reversiLegalIdxs(board, opp).length > 0) {
      turn = opp;
    } else if (reversiLegalIdxs(board, playerId).length > 0) {
      turn = playerId; // opponent auto-passes
    } else {
      phase = 'over';
    }
    return {
      ...state,
      board,
      turn,
      phase,
      lastEvent: { player: playerId, idx: action.idx, flipped: flipsFor(state.board, action.idx, playerId) },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    if (state.phase !== 'play' || state.turn !== playerId) return null;
    const legal = reversiLegalIdxs(state.board, playerId);
    if (legal.length === 0) return null;

    if (difficulty === 'easy') {
      return { type: 'move', idx: rng.pick(legal) };
    }

    const scoreOf = (idx: number): number => {
      const me = playerId === 0 ? 1 : 2;
      const board = [...state.board];
      board[idx] = me;
      for (const f of flipsFor(state.board, idx, playerId)) board[f] = me;
      let score = evaluate(board, playerId);
      if (difficulty === 'hard') {
        // 2-ply: subtract the opponent's best greedy reply
        const oppLegal = reversiLegalIdxs(board, 1 - playerId);
        if (oppLegal.length > 0) {
          let bestOpp = -Infinity;
          for (const oi of oppLegal) {
            const b2 = [...board];
            b2[oi] = playerId === 0 ? 2 : 1;
            for (const f of flipsFor(board, oi, 1 - playerId)) b2[f] = playerId === 0 ? 2 : 1;
            const v = evaluate(b2, 1 - playerId);
            if (v > bestOpp) bestOpp = v;
          }
          score -= bestOpp * 0.8;
          score += legal.length * 2; // mobility matters
        }
      }
      return score;
    };

    let best = legal[0]!;
    let bestScore = -Infinity;
    for (const idx of rng.shuffle(legal)) {
      const s = scoreOf(idx);
      if (s > bestScore) {
        bestScore = s;
        best = idx;
      }
    }
    return { type: 'move', idx: best };
  },

  currentPlayers(state) {
    return state.phase === 'play' ? [state.turn] : [];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    if (state.phase !== 'over') return [];
    const dark = state.board.filter((c) => c === 1).length;
    const light = state.board.filter((c) => c === 2).length;
    if (dark > light) return [0];
    if (light > dark) return [1];
    return [0, 1];
  },
};

/** disc counts for the scoreboard */
export function discCounts(state: ReversiState): { dark: number; light: number } {
  return {
    dark: state.board.filter((c) => c === 1).length,
    light: state.board.filter((c) => c === 2).length,
  };
}
