import type { GameConfig, GameEngine, RNG } from '../../core/types';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/**
 * Skeeball — 9 rolls per player up a ramp into concentric-ish holes.
 * Simulated as a deterministic top-down integrator (single ball):
 * the lane is 6×22 with a sloped zone [8..14] that decelerates the ball
 * climbing it (and accelerates it rolling back).
 */

export const SK_BALLS = 9;
export const SK_W = 6;
export const SK_H = 22;

const START: [number, number] = [3, 1.5];
export const RAMP_Y0 = 8;
export const RAMP_Y1 = 12;
const RAMP_DECEL = 4.2; // units/s² pushing toward −y inside the ramp zone
const FRICTION_LANE = 0.999; // light roll on the approach
const FRICTION_TOP = 0.9968; // heavy felt on the target plateau
const CRAWL = 2.4; // a ball slower than this drops into a hole it overlaps
const STOP = 0.14;
const DT = 1 / 480;
const WALL_R = 0.5;
const BACK_R = 0.45;

export interface SkeeHole {
  x: number;
  y: number;
  r: number;
  points: number;
}

export const SKEE_HOLES: readonly SkeeHole[] = [
  { x: 3.0, y: 20.4, r: 0.5, points: 100 },
  { x: 1.7, y: 19.5, r: 0.5, points: 50 },
  { x: 4.3, y: 19.5, r: 0.5, points: 50 },
  { x: 0.85, y: 17.8, r: 0.5, points: 30 },
  { x: 5.15, y: 17.8, r: 0.5, points: 30 },
  { x: 3.0, y: 17.6, r: 0.55, points: 20 },
  { x: 1.9, y: 15.8, r: 0.55, points: 20 },
  { x: 4.1, y: 15.8, r: 0.55, points: 20 },
];

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface SkeeShot {
  player: number;
  /** sampled ball positions from release to rest/hole */
  path: [number, number][];
  points: number;
  hole: number | null;
}

export interface SkeeState {
  playerCount: number;
  scores: number[];
  /** balls rolled per player */
  rolled: number[];
  turn: number;
  phase: 'roll' | 'over';
  lastShot: SkeeShot | null;
}

export type SkeeAction = { type: 'roll'; angle: number; power: number };

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

function simulate(angle: number, power: number): { path: [number, number][]; hole: number | null } {
  const speed = 6 + power * 15;
  let x = START[0];
  let y = START[1];
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;
  const path: [number, number][] = [[x, y]];
  let hole: number | null = null;

  for (let step = 0; step < 480 * 20; step++) {
    x += vx * DT;
    y += vy * DT;

    // hole capture: a ball crawling over a hole drops in (fast balls fly over)
    if (y > 13) {
      const sp = Math.hypot(vx, vy);
      if (sp < CRAWL) {
        for (let h = 0; h < SKEE_HOLES.length; h++) {
          const holeDef = SKEE_HOLES[h]!;
          const dx = x - holeDef.x;
          const dy = y - holeDef.y;
          if (dx * dx + dy * dy <= holeDef.r * holeDef.r) {
            hole = h;
            x = holeDef.x;
            y = holeDef.y;
            break;
          }
        }
        if (hole !== null) break;
      }
    }

    // side walls
    if (x < 0.2) {
      x = 0.2 + (0.2 - x) * WALL_R;
      vx = Math.abs(vx) * WALL_R;
    } else if (x > SK_W - 0.2) {
      x = SK_W - 0.2 - (x - (SK_W - 0.2)) * WALL_R;
      vx = -Math.abs(vx) * WALL_R;
    }
    // back wall
    if (y > SK_H - 0.2) {
      y = SK_H - 0.2 - (y - (SK_H - 0.2)) * BACK_R;
      vy = -Math.abs(vy) * BACK_R;
    }
    // rolled all the way back → dead ball
    if (y < START[1] - 0.3 && vy < 0) {
      y = START[1];
      break;
    }

    // ramp slope then zone friction
    if (y >= RAMP_Y0 && y <= RAMP_Y1) vy -= RAMP_DECEL * DT;
    const f = y > RAMP_Y1 ? FRICTION_TOP : FRICTION_LANE;
    vx *= f;
    vy *= f;

    const sp = Math.hypot(vx, vy);
    if (sp < STOP) break; // at rest — if it were over a hole it would have dropped

    if (step % 8 === 0) path.push([x, y]);
  }
  path.push([x, y]);
  return { path, hole };
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const skeeEngine: GameEngine<SkeeState, SkeeAction> = {
  createInitialState(config) {
    const n = config.slots.length;
    return {
      playerCount: n,
      scores: Array.from({ length: n }, () => 0),
      rolled: Array.from({ length: n }, () => 0),
      turn: 0,
      phase: 'roll',
      lastShot: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'roll' || state.turn !== playerId) return [];
    return [{ type: 'roll' as const, angle: Math.PI / 2, power: 0.5 }];
  },

  validate(state, action, playerId) {
    if (state.phase !== 'roll' || state.turn !== playerId) return false;
    if (action.type !== 'roll') return false;
    if (!Number.isFinite(action.angle) || !Number.isFinite(action.power)) return false;
    if (action.power <= 0 || action.power > 1) return false;
    // must aim roughly up the lane (±50° of straight)
    let diff = Math.abs(action.angle - Math.PI / 2) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    return diff <= (Math.PI / 180) * 50;
  },

  applyAction(state, action, playerId) {
    if (!skeeEngine.validate(state, action, playerId)) return state;
    const { path, hole } = simulate(action.angle, action.power);
    const points = hole !== null ? SKEE_HOLES[hole]!.points : 0;
    const scores = [...state.scores];
    scores[playerId]! += points;
    const rolled = [...state.rolled];
    rolled[playerId]! += 1;

    const allDone = rolled.every((r) => r >= SK_BALLS);
    let turn = state.turn;
    if (!allDone) {
      // alternate to the next player who still has balls
      for (let i = 1; i <= state.playerCount; i++) {
        const idx = (playerId + i) % state.playerCount;
        if (rolled[idx]! < SK_BALLS) {
          turn = idx;
          break;
        }
      }
    }

    return {
      ...state,
      scores,
      rolled,
      turn,
      phase: allDone ? 'over' : 'roll',
      lastShot: { player: playerId, path, points, hole },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    if (state.phase !== 'roll' || state.turn !== playerId) return null;
    const noise = difficulty === 'easy' ? 0.09 : difficulty === 'medium' ? 0.045 : 0.02;
    const target = SKEE_HOLES[0]!;
    const angle = Math.atan2(target.y - START[1], target.x - START[0]) + (rng.next() * 2 - 1) * noise;
    const power = 1 + (rng.next() * 2 - 1) * (difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.18 : 0.05);
    return { type: 'roll', angle, power: Math.min(1, Math.max(0.2, power)) };
  },

  currentPlayers(state) {
    return state.phase === 'roll' ? [state.turn] : [];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    if (state.phase !== 'over') return [];
    const best = Math.max(...state.scores);
    return state.scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  },
};

export const SKEE_START = START;
