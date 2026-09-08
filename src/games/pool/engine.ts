import type { GameConfig, GameEngine, RNG } from '../../core/types';
import {
  runToRest,
  type PhysBody,
  type PhysConf,
  type Pocket,
} from '../_physics/physics';

/* ------------------------------------------------------------------ */
/* Table geometry (shared with the 3D board)                           */
/* ------------------------------------------------------------------ */

export const POOL_W = 8;
export const POOL_H = 4;
export const BALL_R = 0.15;
export const POCKET_R = 0.34;
export const MAX_SHOT_SPEED = 26;

export const POOL_POCKETS: Pocket[] = [
  { x: 0, y: 0, r: POCKET_R, mouthX: 0.5, mouthY: 0.5 },
  { x: POOL_W / 2, y: 0, r: POCKET_R, mouthX: 0.26, mouthY: 0.3 },
  { x: POOL_W, y: 0, r: POCKET_R, mouthX: 0.5, mouthY: 0.5 },
  { x: 0, y: POOL_H, r: POCKET_R, mouthX: 0.5, mouthY: 0.5 },
  { x: POOL_W / 2, y: POOL_H, r: POCKET_R, mouthX: 0.26, mouthY: 0.3 },
  { x: POOL_W, y: POOL_H, r: POCKET_R, mouthX: 0.5, mouthY: 0.5 },
];

export function poolConf(): PhysConf {
  return {
    w: POOL_W,
    h: POOL_H,
    friction: 0.99688, // ≈ e^(-1.5/480): balls glide ~3 table lengths
    restitution: 0.95,
    wallRestitution: 0.86,
    stop: 0.05,
    maxSpeed: MAX_SHOT_SPEED,
    pockets: POOL_POCKETS,
  };
}

export const BALL_COLORS: Record<number, string> = {
  1: '#fcc203',
  2: '#1a3a82',
  3: '#c8102e',
  4: '#5b2c83',
  5: '#f57a20',
  6: '#157944',
  7: '#6d1a36',
  8: '#151515',
  9: '#fcc203',
  10: '#1a3a82',
  11: '#c8102e',
  12: '#5b2c83',
  13: '#f57a20',
  14: '#157944',
  15: '#6d1a36',
};

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type BallKind = 'cue' | 'solid' | 'stripe' | 'eight';

export interface Ball {
  id: string;
  num: number; // 0 = cue
  kind: BallKind;
  x: number;
  y: number;
  pocketed: boolean;
}

export interface PoolShot {
  cueX: number;
  cueY: number;
  angle: number;
  power: number; // 0..1
}

export type PoolAction = { type: 'shot'; angle: number; power: number };

export interface PoolState {
  balls: Ball[];
  turn: number;
  /** per-seat group; null while the table is open */
  groups: ('solid' | 'stripe' | null)[];
  open: boolean;
  phase: 'aim' | 'over';
  winner: number | null;
  shotId: number;
  lastShot: (PoolShot & { snapshot: Ball[] }) | null;
  lastEvent: {
    player: number;
    pocketed: number[];
    foul: boolean;
    reason?: 'scratch' | 'no-contact';
    groupAssigned?: 'solid' | 'stripe';
    extraTurn: boolean;
  } | null;
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

function rackBalls(): Ball[] {
  const balls: Ball[] = [{ id: 'cue', num: 0, kind: 'cue', x: POOL_W * 0.25, y: POOL_H / 2, pocketed: false }];
  // triangle rack at 3/4 length, 8-ball in the middle of the third row
  const apexX = POOL_W * 0.72;
  const apexY = POOL_H / 2;
  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const dx = BALL_R * 2 * 0.876; // cos(30°)
  const dy = BALL_R * 2 + 0.001;
  const rack: { num: number; kind: BallKind }[] = [];
  // row 0: apex ball (a solid)
  rack.push({ num: solids.pop()!, kind: 'solid' });
  // rows grow toward +x
  let idx = 0;
  for (let row = 1; row <= 4; row++) {
    for (let i = 0; i <= row; i++) {
      if (row === 2 && i === 1) {
        rack.push({ num: 8, kind: 'eight' });
        continue;
      }
      const useStripe = row % 2 === 1 ? i % 2 === 0 : i % 2 === 1;
      if (useStripe && stripes.length > 0) rack.push({ num: stripes.pop()!, kind: 'stripe' });
      else if (solids.length > 0) rack.push({ num: solids.pop()!, kind: 'solid' });
      else rack.push({ num: stripes.pop()!, kind: 'stripe' });
      idx++;
    }
  }
  let n = 0;
  for (let row = 0; row <= 4; row++) {
    for (let i = 0; i <= row; i++) {
      const b = rack[n++]!;
      balls.push({
        id: `ball-${b.num}`,
        num: b.num,
        kind: b.kind,
        x: apexX + row * dx,
        y: apexY + (i - row / 2) * dy,
        pocketed: false,
      });
    }
  }
  return balls;
}

function bodiesOf(balls: Ball[]): PhysBody[] {
  return balls
    .filter((b) => !b.pocketed)
    .map((b) => ({ id: b.id, x: b.x, y: b.y, vx: 0, vy: 0, r: BALL_R, m: 1, pocketed: false }));
}

function isFree(balls: Ball[], x: number, y: number): boolean {
  return balls.every((b) => b.pocketed || Math.hypot(b.x - x, b.y - y) >= BALL_R * 2.1);
}

function findFreeSpot(balls: Ball[], x: number, y: number): { x: number; y: number } {
  if (isFree(balls, x, y)) return { x, y };
  for (let ring = 1; ring < 24; ring++) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const nx = Math.min(POOL_W - BALL_R, Math.max(BALL_R, x + Math.cos(ang) * ring * 0.1));
      const ny = Math.min(POOL_H - BALL_R, Math.max(BALL_R, y + Math.sin(ang) * ring * 0.1));
      if (isFree(balls, nx, ny)) return { x: nx, y: ny };
    }
  }
  return { x, y };
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export const poolEngine: GameEngine<PoolState, PoolAction> = {
  createInitialState(): PoolState {
    return {
      balls: rackBalls(),
      turn: 0,
      groups: [null, null],
      open: true,
      phase: 'aim',
      winner: null,
      shotId: 0,
      lastShot: null,
      lastEvent: null,
    };
  },

  legalActions(state, playerId) {
    if (state.phase !== 'aim' || state.turn !== playerId) return [];
    return [{ type: 'shot', angle: 0, power: 0.5 }]; // any angle/power is "legal" — signature action
  },

  validate(state, action, playerId) {
    return (
      action.type === 'shot' &&
      state.phase === 'aim' &&
      state.turn === playerId &&
      Number.isFinite(action.angle) &&
      action.power > 0 &&
      action.power <= 1
    );
  },

  applyAction(state, action, playerId, _rng) {
    if (!poolEngine.validate(state, action, playerId)) return state;

    const snapshot = state.balls.map((b) => ({ ...b }));
    const bodies = bodiesOf(state.balls);
    const cue = bodies.find((b) => b.id === 'cue');
    if (!cue) return state;
    const speed = Math.max(2, action.power * MAX_SHOT_SPEED);
    cue.vx = Math.cos(action.angle) * speed;
    cue.vy = Math.sin(action.angle) * speed;

    const result = runToRest(bodies, poolConf(), 'cue');

    // write back positions
    const balls = state.balls.map((b) => {
      const body = bodies.find((x) => x.id === b.id);
      return body ? { ...b, x: body.x, y: body.y, pocketed: body.pocketed } : b;
    });

    const potted = result.pocketed
      .map((id) => balls.find((b) => b.id === id))
      .filter((b): b is Ball => Boolean(b));
    const pottedNums = potted.map((b) => b.num);
    const cuePotted = potted.some((b) => b.kind === 'cue');
    const touchedSomething = result.touched.length > 0;

    let foul = false;
    let reason: 'scratch' | 'no-contact' | undefined;
    if (cuePotted) {
      foul = true;
      reason = 'scratch';
    } else if (!touchedSomething) {
      foul = true;
      reason = 'no-contact';
    }

    const shooter = playerId;
    const opponent = 1 - playerId;
    let { groups, open } = state;
    let winner: number | null = null;
    let groupAssigned: 'solid' | 'stripe' | undefined;

    // eight-ball resolution
    const eightPotted = pottedNums.includes(8);
    if (eightPotted) {
      const myGroup = groups[shooter];
      const clearedBefore =
        myGroup !== null &&
        snapshot.filter((b) => b.kind === myGroup && b.num !== 8).every((b) => b.pocketed);
      // legal 8: group assigned, group cleared before this shot, no foul
      winner = myGroup !== null && clearedBefore && !foul ? shooter : opponent;
      const withPos = balls.map((b) => ({ ...b }));
      const spot = findFreeSpot(withPos, POOL_W * 0.25, POOL_H / 2);
      const cueBall = withPos.find((b) => b.kind === 'cue')!;
      if (cueBall.pocketed) {
        cueBall.pocketed = false;
        cueBall.x = spot.x;
        cueBall.y = spot.y;
      }
      return {
        balls: withPos,
        turn: shooter,
        groups,
        open,
        phase: 'over',
        winner,
        shotId: state.shotId + 1,
        lastShot: { cueX: cue.x, cueY: cue.y, angle: action.angle, power: action.power, snapshot },
        lastEvent: { player: shooter, pocketed: pottedNums, foul, reason, extraTurn: false },
      };
    }

    // open-table group assignment (first potted object ball)
    const objectPots = potted.filter((b) => b.kind === 'solid' || b.kind === 'stripe');
    if (open && !foul && objectPots.length > 0) {
      const first = objectPots[0]!.kind as 'solid' | 'stripe';
      groups = [shooter === 0 ? first : first === 'solid' ? 'stripe' : 'solid', shooter === 0 ? (first === 'solid' ? 'stripe' : 'solid') : first];
      open = false;
      groupAssigned = first;
    }

    // respot cue after a scratch
    let finalBalls = balls;
    if (cuePotted) {
      finalBalls = balls.map((b) => {
        if (b.kind !== 'cue') return b;
        const spot = findFreeSpot(balls, POOL_W * 0.25, POOL_H / 2);
        return { ...b, pocketed: false, x: spot.x, y: spot.y };
      });
    }

    // extra turn: potted at least one ball of shooter's group (or any object ball while open) without foul
    const myGroupNow = groups[shooter];
    const pottedMine = potted.some(
      (b) => (open ? b.kind === 'solid' || b.kind === 'stripe' : b.kind === myGroupNow),
    );
    const extraTurn = !foul && pottedMine;

    return {
      balls: finalBalls,
      turn: extraTurn ? shooter : opponent,
      groups,
      open,
      phase: 'aim',
      winner: null,
      shotId: state.shotId + 1,
      lastShot: { cueX: cue.x, cueY: cue.y, angle: action.angle, power: action.power, snapshot },
      lastEvent: { player: shooter, pocketed: pottedNums, foul, reason, groupAssigned, extraTurn },
    };
  },

  chooseBotMove(state, playerId, rng, difficulty) {
    if (state.phase !== 'aim' || state.turn !== playerId) return null;
    const myGroup = state.groups[playerId];
    const targets = state.balls.filter(
      (b) =>
        !b.pocketed &&
        (myGroup === null
          ? b.kind === 'solid' || b.kind === 'stripe'
          : b.kind === myGroup),
    );
    // if group cleared, aim at the 8
    const eight = state.balls.find((b) => b.num === 8 && !b.pocketed);
    const aimList = targets.length > 0 ? targets : eight ? [eight] : [];

    const noise = difficulty === 'easy' ? 0.16 : difficulty === 'medium' ? 0.055 : 0.014;
    const cueBall = state.balls.find((b) => b.kind === 'cue' && !b.pocketed);
    if (!cueBall) return { type: 'shot', angle: rng.next() * Math.PI * 2, power: 0.55 };

    if (aimList.length > 0) {
      // score candidate (ball, pocket) pairs
      let best: { ghostX: number; ghostY: number; dist: number } | null = null;
      for (const ball of aimList) {
        for (const p of POOL_POCKETS) {
          const pdx = p.x - ball.x;
          const pdy = p.y - ball.y;
          const pd = Math.hypot(pdx, pdy);
          const ux = pdx / pd;
          const uy = pdy / pd;
          const ghostX = ball.x - ux * BALL_R * 2;
          const ghostY = ball.y - uy * BALL_R * 2;
          const cdx = ghostX - cueBall.x;
          const cdy = ghostY - cueBall.y;
          const cd = Math.hypot(cdx, cdy);
          if (cd < 1e-3) continue;
          // cut angle between cue→ghost and ball→pocket must be shallow
          const dot = (cdx / cd) * ux + (cdy / cd) * uy;
          if (dot < 0.25) continue; // too thin
          const score = cd + pd / Math.max(dot, 0.3);
          if (!best || score < best.dist) best = { ghostX, ghostY, dist: score };
        }
      }
      if (best) {
        const angle = Math.atan2(best.ghostY - cueBall.y, best.ghostX - cueBall.x) + (rng.next() * 2 - 1) * noise;
        const power = Math.min(1, 0.42 + best.dist / 14 + rng.next() * 0.12);
        return { type: 'shot', angle, power };
      }
    }
    // nothing to aim at — random shot
    return { type: 'shot', angle: rng.next() * Math.PI * 2, power: 0.5 + rng.next() * 0.3 };
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
