import type { GameConfig, GameEngine, RNG } from '../../core/types';
import { runToRest, type PhysBody, type PhysConf } from '../_physics/physics';

/* ------------------------------------------------------------------ */
/* Lane geometry                                                       */
/* ------------------------------------------------------------------ */

export const LANE_W = 2;
export const LANE_H = 20;
export const BALL_R = 0.3;
export const PIN_R = 0.13;
export const MAX_THROW_SPEED = 20;
export const BALL_START_Y = 0.9;
export const DOWN_THRESHOLD = 0.17;

/** standard 10-pin triangle; index 0 = head pin */
export const PIN_SPOTS: [number, number][] = (() => {
  const spots: [number, number][] = [];
  const spacing = 0.32;
  const rowGap = spacing * 0.87;
  const y0 = 17.5;
  let i = 0;
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k <= row; k++) {
      spots.push([LANE_W / 2 + (k - row / 2) * spacing, y0 + row * rowGap]);
      i++;
    }
  }
  void i;
  return spots;
})();

export function bowlingConf(): PhysConf {
  return {
    // oversized box → no effective side walls; gutters capture instead
    w: 200,
    h: 200,
    friction: 0.9984, // full-power rolls travel ~26 units (lane is 20)
    restitution: 0.7,
    wallRestitution: 0.55,
    stop: 0.05,
    maxSpeed: MAX_THROW_SPEED,
    pockets: [
      // left gutter: captures anything whose center crosses x < 0
      { x: -0.5, y: LANE_H / 2, r: 0.001, mouthX: 0.5, mouthY: LANE_H / 2 + 1 },
      // right gutter: center crosses x > LANE_W
      { x: LANE_W + 0.5, y: LANE_H / 2, r: 0.001, mouthX: 0.5, mouthY: LANE_H / 2 + 1 },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface BowlingState {
  playerCount: number;
  /** rolls per frame per player: frames[p][f] = list of pin counts */
  frames: number[][][];
  /** standing pins for the current throw (indexes into PIN_SPOTS) */
  standing: number[];
  turn: number;
  frame: number; // 0..9
  roll: number; // roll within frame
  phase: 'aim' | 'over';
  lastShot: { angle: number; power: number; snapshot: number[]; downed: number[] } | null;
  lastEvent: { player: number; knocked: number; standingAfter: number; frame: number; roll: number } | null;
}

export type BowlingAction = { type: 'throw'; angle: number; power: number };

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

/** Standard bowling score from flat per-frame rolls. */
export function scoreGame(frames: number[][]): number {
  const flat: number[] = [];
  const frameOfRoll: number[] = [];
  frames.forEach((frame, fi) => {
    frame.forEach((r) => {
      flat.push(r);
      frameOfRoll.push(fi);
    });
  });

  let total = 0;
  let rollIdx = 0;
  for (let fi = 0; fi < Math.min(10, frames.length); fi++) {
    const frame = frames[fi]!;
    if (fi === 9) {
      // 10th frame: just sum (includes bonus rolls)
      total += frame.reduce((a, b) => a + b, 0);
      break;
    }
    const first = frame[0] ?? 0;
    if (first === 10) {
      // strike: + next two rolls
      const n1 = flat[rollIdx + 1] ?? 0;
      const n2 = flat[rollIdx + 2] ?? 0;
      total += 10 + n1 + n2;
      rollIdx += 1;
    } else if ((first + (frame[1] ?? 0)) === 10) {
      const n1 = flat[rollIdx + 2] ?? 0;
      total += 10 + n1;
      rollIdx += 2;
    } else {
      total += first + (frame[1] ?? 0);
      rollIdx += 2;
    }
  }
  void frameOfRoll;
  return total;
}

export function cumulativeScores(frames: number[][]): number[] {
  const out: number[] = [];
  for (let fi = 0; fi < frames.length && fi < 10; fi++) {
    out.push(scoreGame(frames.slice(0, fi + 1)));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

function simulateThrow(standing: number[], angle: number, power: number): { downed: number[]; positions: [number, number][] } {
  const conf = bowlingConf();
  const bodies: PhysBody[] = [
    { id: 'ball', x: LANE_W / 2, y: BALL_START_Y, vx: 0, vy: 0, r: BALL_R, m: 5, pocketed: false },
  ];
  standing.forEach((pinIdx) => {
    const [x, y] = PIN_SPOTS[pinIdx]!;
    bodies.push({ id: `pin-${pinIdx}`, x, y, vx: 0, vy: 0, r: PIN_R, m: 0.14, pocketed: false });
  });

  const speed = Math.max(3, power * MAX_THROW_SPEED);
  const ball = bodies[0]!;
  ball.vx = Math.sin(angle) * speed;
  ball.vy = Math.cos(angle) * speed;

  runToRest(bodies, conf, undefined, 480 * 20);

  const downed: number[] = [];
  const positions: [number, number][] = [];
  standing.forEach((pinIdx, k) => {
    const body = bodies[k + 1]!;
    const [ox, oy] = PIN_SPOTS[pinIdx]!;
    if (body.pocketed || Math.hypot(body.x - ox, body.y - oy) > DOWN_THRESHOLD) {
      downed.push(pinIdx);
    }
    positions.push([body.x, body.y]);
  });
  return { downed, positions };
}

function rackFull(): number[] {
  return Array.from({ length: 10 }, (_, i) => i);
}

export const bowlingEngine: GameEngine<BowlingState, BowlingAction> = {
  createInitialState(config): BowlingState {
    return {
      playerCount: config.slots.length,
      frames: Array.from({ length: config.slots.length }, () => []),
      standing: rackFull(),
      turn: 0,
      frame: 0,
      roll: 0,
      phase: 'aim',
      lastShot: null,
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'aim' || state.turn !== playerId) return [];
    return [{ type: 'throw', angle: 0, power: 0.7 }];
  },

  validate(state, action, playerId) {
    return (
      action.type === 'throw' &&
      state.phase === 'aim' &&
      state.turn === playerId &&
      Number.isFinite(action.angle) &&
      Math.abs(action.angle) <= Math.PI / 2 &&
      action.power > 0 &&
      action.power <= 1
    );
  },

  applyAction(state, action, playerId) {
    if (!bowlingEngine.validate(state, action, playerId)) return state;

    const snapshot = [...state.standing];
    const { downed } = simulateThrow(state.standing, action.angle, action.power);
    const knocked = downed.length;
    const standingAfter = state.standing.filter((p) => !downed.includes(p));

    const frames = state.frames.map((f) => f.map((r) => [...r]));
    while (frames[playerId]!.length <= state.frame) frames[playerId]!.push([]);
    frames[playerId]![state.frame]!.push(knocked);

    const isStrike = state.roll === 0 && knocked === 10;
    const isTenth = state.frame === 9;

    let nextFrame = state.frame;
    let nextRoll = state.roll + 1;
    let standing = standingAfter;
    let turn = playerId;
    let phase: BowlingState['phase'] = 'aim';

    if (!isTenth) {
      const frameComplete = isStrike || state.roll === 1;
      if (!frameComplete) {
        // same player, second roll with the remaining pins
        nextFrame = state.frame;
        nextRoll = 1;
      } else {
        standing = rackFull();
        if (playerId === state.playerCount - 1) {
          const nf = state.frame + 1;
          if (nf > 9) {
            phase = 'over';
            turn = playerId;
            nextFrame = 9;
            nextRoll = 0;
          } else {
            turn = 0;
            nextFrame = nf;
            nextRoll = 0;
          }
        } else {
          turn = playerId + 1;
          nextFrame = state.frame;
          nextRoll = 0;
        }
      }
    } else {
      const tenth = frames[playerId]![9]!;
      const rolls = tenth.length;
      const done =
        rolls >= 3 || (rolls === 2 && tenth[0]! < 10 && tenth[0]! + tenth[1]! < 10);
      if (done) {
        if (playerId === state.playerCount - 1) {
          phase = 'over';
          turn = playerId;
          nextFrame = 9;
          nextRoll = rolls;
        } else {
          turn = playerId + 1;
          nextFrame = 9;
          nextRoll = 0;
        }
        standing = rackFull();
      } else {
        standing = standingAfter.length === 0 ? rackFull() : standingAfter;
        nextFrame = 9;
        nextRoll = rolls;
      }
    }

    return {
      ...state,
      frames,
      standing,
      turn,
      frame: nextFrame,
      roll: nextRoll,
      phase,
      lastShot: { angle: action.angle, power: action.power, snapshot, downed },
      lastEvent: { player: playerId, knocked, standingAfter: standingAfter.length, frame: state.frame, roll: state.roll },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    if (state.phase !== 'aim' || state.turn !== playerId) return null;
    // aim near the 1–3 pocket with difficulty-scaled accuracy (easy bots gutter sometimes)
    const noise = difficulty === 'easy' ? 0.06 : difficulty === 'medium' ? 0.028 : 0.01;
    const baseAngle = 0.006;
    const angle = baseAngle + (rng.next() * 2 - 1) * noise;
    const power = 0.82 + rng.next() * 0.18;
    return { type: 'throw', angle, power };
  },

  currentPlayers(state) {
    return state.phase === 'over' ? [] : [state.turn];
  },

  isGameOver(state) {
    return state.phase === 'over';
  },

  winners(state) {
    if (state.phase !== 'over') return [];
    const totals = state.frames.map((f) => scoreGame(f));
    const max = Math.max(...totals);
    return totals.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
  },
};
