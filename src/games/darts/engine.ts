import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * Darts — 501. Each player throws 3 darts per turn; the score is subtracted
 * and you must land EXACTLY on zero (overshooting busts the whole turn).
 * Coordinates are board millimetres (bull at origin), real board geometry.
 */

export const START_SCORE = 501;
export const DARTS_PER_TURN = 3;

/** real board radii in mm */
export const R_BULL = 12.7;
export const R_BULL25 = 31.8;
export const R_TRIPLE_IN = 99;
export const R_TRIPLE_OUT = 107;
export const R_DOUBLE_IN = 162;
export const R_DOUBLE_OUT = 170;
export const R_MISS = 228; // beyond this the dart leaves the scoring area

/** sector order clockwise starting at the top (middle of 20 at 90°) */
export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;

export interface DartHit {
  value: number;
  label: string; // '20', 'T20', 'D20', 'Bull', '25', 'Miss'
}

export interface DartsState {
  playerCount: number;
  scores: number[];
  turn: number;
  dartsLeft: number;
  turnStart: number; // score at the beginning of the current turn
  turnDarts: { x: number; y: number; hit: DartHit }[];
  phase: 'throw' | 'over';
  winner: number | null;
  lastEvent: { player: number; x: number; y: number; hit: DartHit; bust: boolean } | null;
}

export type DartsAction = { type: 'throw'; x: number; y: number };

/* ------------------------------------------------------------------ */
/* Board math                                                          */
/* ------------------------------------------------------------------ */

export function scoreAt(x: number, y: number): DartHit {
  const r = Math.hypot(x, y);
  if (r > R_MISS) return { value: 0, label: 'Miss' };
  if (r <= R_BULL) return { value: 50, label: 'Bull' };
  if (r <= R_BULL25) return { value: 25, label: '25' };
  if (r > R_DOUBLE_OUT) return { value: 0, label: 'Miss' };

  // angle: straight up (90°) is the middle of sector 20; sectors are 18° wide
  let deg = (Math.atan2(y, x) * 180) / Math.PI; // -180..180
  deg = (deg + 360) % 360; // 0..360 measured counter-clockwise from 3 o'clock
  const fromTop = (90 - deg + 360) % 360; // 0 = top centre, increasing clockwise
  const idx = Math.floor((((fromTop + 9) % 360) / 18) % 20);
  const sector = SECTORS[idx]!;

  if (r >= R_TRIPLE_IN && r <= R_TRIPLE_OUT) return { value: sector * 3, label: `T${sector}` };
  if (r >= R_DOUBLE_IN && r <= R_DOUBLE_OUT) return { value: sector * 2, label: `D${sector}` };
  return { value: sector, label: `${sector}` };
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const dartsEngine: GameEngine<DartsState, DartsAction> = {
  createInitialState(config) {
    const playerCount = config.slots.length;
    return {
      playerCount,
      scores: Array.from({ length: playerCount }, () => START_SCORE),
      turn: 0,
      dartsLeft: DARTS_PER_TURN,
      turnStart: START_SCORE,
      turnDarts: [],
      phase: 'throw',
      winner: null,
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'throw' || state.turn !== playerId) return [];
    return [{ type: 'throw' as const, x: 0, y: 0 }]; // shape only; coordinates validated in validate()
  },

  validate(state, action, playerId) {
    if (state.phase !== 'throw' || state.turn !== playerId) return false;
    if (action.type !== 'throw') return false;
    return (
      Number.isFinite(action.x) &&
      Number.isFinite(action.y) &&
      Math.hypot(action.x, action.y) <= R_MISS + 20
    );
  },

  applyAction(state, action, playerId) {
    if (!dartsEngine.validate(state, action, playerId)) return state;

    const hit = scoreAt(action.x, action.y);
    const remaining = state.scores[playerId]! - hit.value;
    const bust = remaining < 0;
    const won = remaining === 0;

    if (won) {
      return {
        ...state,
        scores: state.scores.map((s, i) => (i === playerId ? 0 : s)),
        dartsLeft: 0,
        turnDarts: [...state.turnDarts, { x: action.x, y: action.y, hit }],
        phase: 'over',
        winner: playerId,
        lastEvent: { player: playerId, x: action.x, y: action.y, hit, bust: false },
      };
    }

    const scores = bust
      ? state.scores.map((s, i) => (i === playerId ? state.turnStart : s))
      : state.scores.map((s, i) => (i === playerId ? remaining : s));
    const dartsLeft = bust ? 0 : state.dartsLeft - 1;

    if (bust || dartsLeft === 0) {
      const next = (playerId + 1) % state.playerCount;
      return {
        ...state,
        scores,
        turn: next,
        dartsLeft: DARTS_PER_TURN,
        turnStart: scores[next]!,
        turnDarts: [],
        lastEvent: { player: playerId, x: action.x, y: action.y, hit, bust },
      };
    }

    return {
      ...state,
      scores,
      dartsLeft,
      turnDarts: [...state.turnDarts, { x: action.x, y: action.y, hit }],
      lastEvent: { player: playerId, x: action.x, y: action.y, hit, bust },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    if (state.phase !== 'throw' || state.turn !== playerId) return null;
    const remaining = state.scores[playerId]!;

    // aim point: finish if possible, otherwise T20 (or bull for 50)
    let aimX = 0;
    let aimY = R_TRIPLE_IN + (R_TRIPLE_OUT - R_TRIPLE_IN) / 2; // middle of the 20 triple ring
    if (remaining === 50) {
      aimY = 0;
    } else if (remaining <= 40 && remaining % 2 === 0) {
      const sector = remaining / 2;
      const idx = SECTORS.indexOf(sector as (typeof SECTORS)[number]);
      if (idx >= 0) {
        const ang = ((idx * 18 - 90) * Math.PI) / 180;
        aimX = Math.cos(ang) * (R_DOUBLE_IN + (R_DOUBLE_OUT - R_DOUBLE_IN) / 2);
        aimY = Math.sin(ang) * (R_DOUBLE_IN + (R_DOUBLE_OUT - R_DOUBLE_IN) / 2);
      }
    } else if (remaining <= 20) {
      aimY = 0;
      aimX = 0; // single-bull aiming: sink toward bull, best average
      // aim slightly below bull to hit a single sector? keep bull-centre for simplicity
    }

    const sigma = difficulty === 'easy' ? 34 : difficulty === 'medium' ? 16 : 6.5;
    const gauss = () => {
      // Box–Muller, deterministic through the injected rng
      const u = Math.max(1e-9, rng.next());
      const v = rng.next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return { type: 'throw', x: aimX + gauss() * sigma, y: aimY + gauss() * sigma };
  },

  currentPlayers(state) {
    return state.phase === 'throw' ? [state.turn] : [];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    return state.phase === 'over' && state.winner !== null ? [state.winner] : [];
  },
};
