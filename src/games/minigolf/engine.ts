import type { GameConfig, GameEngine, RNG } from '../../core/types';
import { makeWorld, runToRest, stepWorld, type PhysBody } from '../_physics/physics';

/* ------------------------------------------------------------------ */
/* Course definition                                                   */
/* ------------------------------------------------------------------ */

export interface GolfHole {
  name: { fa: string; en: string };
  w: number;
  h: number;
  tee: [number, number];
  cup: [number, number];
  par: number;
  bumpers: { x: number; y: number; r: number }[];
}

export const HOLES: readonly GolfHole[] = [
  {
    name: { fa: 'راه مستقیم', en: 'The Straightaway' },
    w: 20,
    h: 12,
    tee: [4, 6],
    cup: [16, 6],
    par: 2,
    bumpers: [{ x: 10, y: 6, r: 1.1 }],
  },
  {
    name: { fa: 'پیچ گوشه', en: 'The Dogleg' },
    w: 20,
    h: 12,
    tee: [3.5, 9],
    cup: [16.5, 2.8],
    par: 3,
    bumpers: [
      { x: 9, y: 7.6, r: 0.9 },
      { x: 12, y: 4.6, r: 0.9 },
      { x: 6.4, y: 4.2, r: 0.8 },
    ],
  },
  {
    name: { fa: 'تنگهٔ سخت', en: 'The Gauntlet' },
    w: 20,
    h: 12,
    tee: [3, 6],
    cup: [17, 6],
    par: 3,
    bumpers: [
      { x: 8, y: 4, r: 0.8 },
      { x: 8, y: 8, r: 0.8 },
      { x: 12, y: 6, r: 1.0 },
      { x: 14.5, y: 3.2, r: 0.7 },
      { x: 14.5, y: 8.8, r: 0.7 },
    ],
  },
];

export const MAX_STROKES = 8;
export const BALL_R = 0.35;
const BUMPER_M = 600;
const SAMPLE_EVERY = 6; // physics steps between path samples

const HOLE_CONFS = HOLES.map((h) => ({
  w: h.w,
  h: h.h,
  friction: 0.9965,
  restitution: 0.85,
  wallRestitution: 0.5,
  stop: 0.08,
  maxSpeed: 24,
  pockets: [{ x: h.cup[0], y: h.cup[1], r: 0.5 }],
}));

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface GolfShot {
  hole: number;
  player: number;
  /** sampled ball positions (start → rest/cup) */
  path: [number, number][];
  holed: boolean;
  pickedUp: boolean;
  strokesAfter: number;
}

export interface GolfState {
  playerCount: number;
  hole: number;
  ball: [number, number];
  /** strokes[hole][player] — 0 = not played yet */
  strokes: number[][];
  turn: number;
  phase: 'aim' | 'over';
  lastShot: GolfShot | null;
}

export type GolfAction = { type: 'stroke'; angle: number; power: number };

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const golfEngine: GameEngine<GolfState, GolfAction> = {
  createInitialState(config) {
    const playerCount = config.slots.length;
    return {
      playerCount,
      hole: 0,
      ball: [...HOLES[0]!.tee],
      strokes: HOLES.map(() => Array.from({ length: playerCount }, () => 0)),
      turn: 0,
      phase: 'aim',
      lastShot: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'aim' || state.turn !== playerId) return [];
    return [{ type: 'stroke' as const, angle: 0, power: 0.5 }];
  },

  validate(state, action, playerId) {
    if (state.phase !== 'aim' || state.turn !== playerId) return false;
    if (action.type !== 'stroke') return false;
    return Number.isFinite(action.angle) && Number.isFinite(action.power) && action.power > 0 && action.power <= 1;
  },

  applyAction(state, action, playerId) {
    if (!golfEngine.validate(state, action, playerId)) return state;

    const holeIdx = state.hole;
    const hole = HOLES[holeIdx]!;
    const conf = HOLE_CONFS[holeIdx]!;
    const speed = 5 + action.power * 17;

    const bodies: PhysBody[] = [
      {
        id: 'ball',
        x: state.ball[0],
        y: state.ball[1],
        vx: Math.cos(action.angle) * speed,
        vy: Math.sin(action.angle) * speed,
        r: BALL_R,
        m: 1,
        pocketed: false,
      },
      ...hole.bumpers.map((b, i) => ({
        id: `bump${i}`,
        x: b.x,
        y: b.y,
        vx: 0,
        vy: 0,
        r: b.r,
        m: BUMPER_M,
        pocketed: false,
      })),
    ];
    const world = makeWorld(bodies, conf);

    const path: [number, number][] = [[world.bodies[0]!.x, world.bodies[0]!.y]];
    let steps = 0;
    let holed = false;
    while (steps < 480 * 30) {
      for (let k = 0; k < SAMPLE_EVERY; k++) {
        const ev = stepWorld(world.bodies, world.conf, 'ball');
        steps++;
        if (ev.pocketed.includes('ball')) {
          holed = true;
          break;
        }
      }
      const ball = world.bodies[0]!;
      path.push([ball.x, ball.y]);
      if (holed) break;
      const moving = world.bodies.some((b) => !b.pocketed && (b.vx !== 0 || b.vy !== 0));
      if (!moving) break;
    }

    const strokes = state.strokes.map((h) => [...h]);
    const prev = strokes[holeIdx]![playerId]!;
    const pickedUp = !holed && prev + 1 >= MAX_STROKES;
    strokes[holeIdx]![playerId] = Math.min(prev + 1, MAX_STROKES);
    const rest: [number, number] = holed || pickedUp ? [...hole.cup] : [world.bodies[0]!.x, world.bodies[0]!.y];

    const lastShot: GolfShot = {
      hole: holeIdx,
      player: playerId,
      path,
      holed,
      pickedUp,
      strokesAfter: strokes[holeIdx]![playerId]!,
    };

    // advance: the current player keeps playing until holed/picked up;
    // then the next player tees off on this hole (or the course moves on)
    let turn = state.turn;
    let hIdx = holeIdx;
    let ball: [number, number] = rest;
    let phase: GolfState['phase'] = 'aim';
    if (holed || pickedUp) {
      if (playerId === state.playerCount - 1) {
        // everyone finished this hole
        if (holeIdx >= HOLES.length - 1) {
          phase = 'over';
        } else {
          hIdx = holeIdx + 1;
          ball = [...HOLES[hIdx]!.tee];
          turn = 0;
        }
      } else {
        turn = playerId + 1;
        ball = [...HOLES[holeIdx]!.tee]; // next player tees off
      }
    }

    return { ...state, hole: hIdx, ball, strokes, turn, phase, lastShot };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    if (state.phase !== 'aim' || state.turn !== playerId) return null;
    const hole = HOLES[state.hole]!;
    const dx = hole.cup[0] - state.ball[0];
    const dy = hole.cup[1] - state.ball[1];
    const dist = Math.hypot(dx, dy);
    const jitter = difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.14 : 0.05;
    const angle = Math.atan2(dy, dx) + (rng.next() * 2 - 1) * jitter;
    const power = Math.min(1, Math.max(0.28, dist / 13 + (rng.next() * 0.2 - 0.1)));
    return { type: 'stroke', angle, power };
  },

  currentPlayers(state) {
    return state.phase === 'aim' ? [state.turn] : [];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    if (state.phase !== 'over') return [];
    const t = totals(state);
    const best = Math.min(...t);
    return t.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
  },
};

/** total strokes per player (helper for scoreboards) */
export function totals(state: GolfState): number[] {
  return state.strokes[0]!.map(
    (_, p) => state.strokes.reduce((acc, holeStrokes) => acc + holeStrokes[p]!, 0),
  );
}
