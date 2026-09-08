import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Board geometry (shared with the 3D board)                           */
/* ------------------------------------------------------------------ */

/** 52-cell main track as [row, col] on a 15×15 grid. */
export const TRACK: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];

/** Track index where each seat's tokens enter. */
export const LUDO_STARTS = [0, 13, 26, 39] as const;

/** Start cells + star cells are safe — no captures happen there. */
export const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

/** Home column cells [row, col] per seat (5 steps), then the center. */
export const HOME_COL: [number, number][][] = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
];

/** Seat colors in board order: green TL, yellow TR, blue BR, red BL. */
export const LUDO_COLORS = ['#22c55e', '#eab308', '#3b82f6', '#ef4444'];

export const YARD_RECT: [number, number][][] = [
  [[0, 0], [5, 5]],
  [[0, 9], [5, 14]],
  [[9, 9], [14, 14]],
  [[9, 0], [14, 5]],
];

export const YARD_ANCHOR: [number, number][] = [
  [2.5, 2.5],
  [2.5, 11.5],
  [11.5, 11.5],
  [11.5, 2.5],
];

export function cellOf(player: number, step: number): number {
  return ((LUDO_STARTS[player] ?? 0) + step) % 52;
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface LudoToken {
  /** -1 = yard, 0..50 = track steps from start, 51..55 = home column, 56 = finished */
  step: number;
}

export type LudoAction = { type: 'roll' } | { type: 'move'; token: number };

export interface LudoState {
  playerCount: number;
  tokens: LudoToken[][];
  turn: number;
  dice: number | null;
  phase: 'roll' | 'move' | 'gameover';
  /** consecutive sixes rolled this turn */
  sixStreak: number;
  winner: number | null;
  lastEvent: {
    kind: 'roll' | 'move' | 'capture' | 'finish' | 'forfeit' | 'skip';
    player: number;
    value?: number;
    token?: number;
    fromStep?: number;
    toStep?: number;
    captured?: { player: number; token: number }[];
  } | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function nextTurn(s: LudoState): LudoState {
  return { ...s, turn: (s.turn + 1) % s.playerCount, dice: null, phase: 'roll', sixStreak: 0 };
}

export function movableTokens(state: LudoState, player: number, dice: number): number[] {
  if (state.phase !== 'move' || state.turn !== player || dice === null) return [];
  const tokens = state.tokens[player] ?? [];
  const out: number[] = [];
  tokens.forEach((tok, i) => {
    if (tok.step === -1) {
      if (dice === 6) out.push(i);
    } else if (tok.step < 56 && tok.step + dice <= 56) {
      out.push(i);
    }
  });
  return out;
}

function applyCaptures(s: LudoState, player: number, toStep: number): { player: number; token: number }[] {
  if (toStep > 50) return []; // home column is safe
  const cell = cellOf(player, toStep);
  if (SAFE_CELLS.has(cell)) return [];
  const captured: { player: number; token: number }[] = [];
  const tokens = s.tokens.map((hand) => [...hand]);
  for (let p = 0; p < s.playerCount; p++) {
    if (p === player) continue;
    (tokens[p] as LudoToken[]).forEach((tok, i) => {
      if (tok.step >= 0 && tok.step <= 50 && cellOf(p, tok.step) === cell) {
        (tokens[p] as LudoToken[])[i] = { step: -1 };
        captured.push({ player: p, token: i });
      }
    });
  }
  if (captured.length > 0) s.tokens = tokens;
  return captured;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const ludoEngine: GameEngine<LudoState, LudoAction> = {
  createInitialState(config) {
    const playerCount = config.slots.length;
    return {
      playerCount,
      tokens: Array.from({ length: playerCount }, () =>
        Array.from({ length: 4 }, () => ({ step: -1 })),
      ),
      turn: 0,
      dice: null,
      phase: 'roll',
      sixStreak: 0,
      winner: null,
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase === 'gameover' || state.turn !== playerId) return [];
    if (state.phase === 'roll') return [{ type: 'roll' }];
    return movableTokens(state, playerId, state.dice ?? 0).map((token) => ({ type: 'move' as const, token }));
  },

  validate(state, action, playerId) {
    return ludoEngine.legalActions(state, playerId).some((a) => JSON.stringify(a) === JSON.stringify(action));
  },

  applyAction(state, action, playerId, rng) {
    if (!ludoEngine.validate(state, action, playerId)) return state;

    if (action.type === 'roll') {
      const value = rng.int(6) + 1;
      const s: LudoState = { ...state, lastEvent: { kind: 'roll', player: playerId, value } };

      if (value === 6 && state.sixStreak >= 2) {
        // third six in a row: forfeit the turn
        return { ...nextTurn(s), lastEvent: { kind: 'forfeit', player: playerId, value } };
      }

      s.dice = value;
      s.sixStreak = value === 6 ? state.sixStreak + 1 : 0;
      s.phase = 'move';

      const movable = movableTokens(s, playerId, value);
      if (movable.length === 0) {
        return { ...nextTurn(s), lastEvent: { kind: 'skip', player: playerId, value } };
      }
      return s;
    }

    // move
    const dice = state.dice as number;
    const tokens = state.tokens.map((hand) => [...hand]);
    const hand = tokens[playerId] as LudoToken[];
    const tok = hand[action.token] as LudoToken;
    const fromStep = tok.step;
    const toStep = tok.step === -1 ? 0 : tok.step + dice;
    hand[action.token] = { step: toStep };

    let s: LudoState = { ...state, tokens, dice: null };
    const captured = applyCaptures(s, playerId, toStep);

    const finished = hand[action.token]!.step === 56;
    const allHome = (tokens[playerId] as LudoToken[]).every((tk) => tk.step === 56);

    s = {
      ...s,
      lastEvent: {
        kind: finished ? 'finish' : captured.length > 0 ? 'capture' : 'move',
        player: playerId,
        token: action.token,
        fromStep,
        toStep,
        captured,
      },
    };

    if (allHome) {
      return { ...s, phase: 'gameover', winner: playerId, dice: null };
    }

    if (dice === 6) {
      return { ...s, phase: 'roll', dice: null }; // extra roll, streak kept
    }
    return nextTurn(s);
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    const legal = ludoEngine.legalActions(state, playerId);
    if (legal.length === 0) return null;
    if (legal.length === 1) return legal[0]!;
    if (difficulty === 'easy' && legal[0]!.type === 'move') return rng.pick(legal);
    if (legal[0]!.type === 'roll') return { type: 'roll' };

    const dice = state.dice as number;
    let best = legal[0] as { type: 'move'; token: number };
    let bestScore = -Infinity;
    for (const action of legal) {
      if (action.type !== 'move') continue;
      const tok = (state.tokens[playerId] ?? [])[action.token] as LudoToken;
      const toStep = tok.step === -1 ? 0 : tok.step + dice;
      let score = rng.next() * 0.3;

      if (toStep === 56) score += 100; // finish a token
      if (toStep <= 50) {
        const cell = cellOf(playerId, toStep);
        const victims = state.tokens.reduce(
          (n, hand, p) =>
            p === playerId
              ? n
              : n + hand.filter((tk) => tk.step >= 0 && tk.step <= 50 && cellOf(p, tk.step) === cell).length,
          0,
        );
        if (!SAFE_CELLS.has(cell)) score += victims * 80; // capture!
        else score += 6; // parking on a safe cell is nice
        if (difficulty === 'hard') {
          // danger: an enemy sits 1..6 cells behind the landing cell
          const danger = state.tokens.some(
            (hand, p) =>
              p !== playerId &&
              hand.some((tk) => {
                if (tk.step < 0 || tk.step > 50) return false;
                const behind = (cellOf(playerId, toStep) - cellOf(p, tk.step) + 52) % 52;
                return behind >= 1 && behind <= 6;
              }),
          );
          if (danger && !SAFE_CELLS.has(cell)) score -= 10;
        }
      }
      if (tok.step === -1) score += 45; // get out of the yard
      score += toStep * 0.6; // general progress

      if (score > bestScore) {
        bestScore = score;
        best = action;
      }
    }
    return best;
  },

  currentPlayers(state) {
    return state.phase === 'gameover' ? [] : [state.turn];
  },

  isGameOver(state) {
    return state.phase === 'gameover';
  },

  winners(state) {
    return state.winner !== null ? [state.winner] : [];
  },
};

/** Dice are injected here through a module-level seam (set by applyAction caller). */
let rollDice: () => number = () => 1;
export function setDiceRoller(fn: () => number) {
  rollDice = fn;
}
