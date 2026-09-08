import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

export const BOARD_SIZE = 100;

/** snake heads → tails */
export const SNAKES: Record<number, number> = {
  16: 6,
  47: 26,
  49: 11,
  56: 53,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  98: 78,
};

/** ladder feet → tops */
export const LADDERS: Record<number, number> = {
  1: 38,
  4: 14,
  9: 31,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 100,
};

/** cell → [row, col] on a 10×10 grid; row 0 = bottom row (cells 1..10) */
export function cellRC(cell: number): [number, number] {
  const i = cell - 1;
  const row = Math.floor(i / 10);
  const col = i % 10;
  return [row, row % 2 === 0 ? col : 9 - col];
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface SnakesState {
  playerCount: number;
  /** 0 = off-board start */
  pos: number[];
  turn: number;
  dice: number | null;
  phase: 'roll' | 'gameover';
  winner: number | null;
  lastEvent: {
    player: number;
    dice: number;
    from: number;
    to: number;
    snake: boolean;
    ladder: boolean;
    extra: boolean;
    won: boolean;
  } | null;
}

export type SnakesAction = { type: 'roll' };

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const snakesEngine: GameEngine<SnakesState, SnakesAction> = {
  createInitialState(config) {
    return {
      playerCount: config.slots.length,
      pos: Array(config.slots.length).fill(0),
      turn: 0,
      dice: null,
      phase: 'roll',
      winner: null,
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'roll' || state.turn !== playerId) return [];
    return [{ type: 'roll' }];
  },

  validate(state, action, playerId) {
    return action.type === 'roll' && state.phase === 'roll' && state.turn === playerId;
  },

  applyAction(state, action, playerId, rng) {
    if (!snakesEngine.validate(state, action, playerId)) return state;
    const dice = rng.int(6) + 1;
    const from = state.pos[playerId] ?? 0;
    let to = from === 0 ? dice : from + dice;
    let snake = false;
    let ladder = false;
    let won = false;

    if (to >= BOARD_SIZE) {
      to = BOARD_SIZE;
      won = true;
    }
    if (!won && SNAKES[to] !== undefined) {
      to = SNAKES[to]!;
      snake = true;
    } else if (!won && LADDERS[to] !== undefined) {
      to = LADDERS[to]!;
      ladder = true;
      if (to >= BOARD_SIZE) {
        to = BOARD_SIZE;
        won = true;
      }
    }

    const pos = [...state.pos];
    pos[playerId] = to;

    const event = { player: playerId, dice, from, to, snake, ladder, extra: dice === 6 && !won, won };
    if (won) {
      return { ...state, pos, dice, phase: 'gameover', winner: playerId, lastEvent: event };
    }
    // rolling a 6 grants another roll
    const turn = dice === 6 ? playerId : (playerId + 1) % state.playerCount;
    return { ...state, pos, dice, turn, lastEvent: event };
  },

  chooseBotMove(state, playerId) {
    if (state.phase !== 'roll' && state.turn !== playerId) return null;
    if (state.phase !== 'roll' || state.turn !== playerId) return null;
    return { type: 'roll' };
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
