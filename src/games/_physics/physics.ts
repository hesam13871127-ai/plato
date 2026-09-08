/**
 * Deterministic 2D circle physics — shared by Pool & Carrom.
 * Fixed-timestep, order-stable simulation: identical inputs always produce
 * identical results (the engine runs it authoritatively; the 3D board replays
 * the exact same steps for animation).
 */

export interface PhysBody {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  m: number;
  pocketed: boolean;
}

export interface Pocket {
  x: number;
  y: number;
  r: number;
  /** rectangular "jaw" zone around the pocket (half-widths) */
  mouthX?: number;
  mouthY?: number;
}

export interface PhysConf {
  w: number;
  h: number;
  friction: number; // velocity multiplier per step
  restitution: number; // ball-ball bounce
  wallRestitution: number;
  stop: number; // speed below which a body is at rest
  maxSpeed: number;
  pockets: Pocket[];
}

export interface StepEvents {
  pocketed: string[];
  /** ids of bodies that collided with `trackId` this step */
  touched: string[];
}

export const PHYS_DT = 1 / 480;

function cloneBodies(bodies: PhysBody[]): PhysBody[] {
  return bodies.map((b) => ({ ...b }));
}

export function makeWorld(bodies: PhysBody[], conf: PhysConf): { bodies: PhysBody[]; conf: PhysConf } {
  return { bodies: cloneBodies(bodies), conf };
}

/** Advance the world by one fixed step (mutates `bodies`). */
export function stepWorld(bodies: PhysBody[], conf: PhysConf, trackId?: string): StepEvents {
  const events: StepEvents = { pocketed: [], touched: [] };

  // integrate
  for (const b of bodies) {
    if (b.pocketed) continue;
    b.x += b.vx * PHYS_DT;
    b.y += b.vy * PHYS_DT;
  }

  // pockets (circle capture + optional mouth/jaw rectangle)
  for (const b of bodies) {
    if (b.pocketed) continue;
    for (const p of conf.pockets) {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      let captured = dx * dx + dy * dy < p.r * p.r;
      if (!captured && p.mouthX !== undefined && p.mouthY !== undefined) {
        captured = Math.abs(dx) < p.mouthX && Math.abs(dy) < p.mouthY;
      }
      if (captured) {
        b.pocketed = true;
        b.vx = 0;
        b.vy = 0;
        events.pocketed.push(b.id);
        break;
      }
    }
  }

  // walls
  for (const b of bodies) {
    if (b.pocketed) continue;
    if (b.x < b.r) {
      b.x = b.r + (b.r - b.x) * conf.wallRestitution;
      b.vx = Math.abs(b.vx) * conf.wallRestitution;
    } else if (b.x > conf.w - b.r) {
      b.x = conf.w - b.r - (b.x - (conf.w - b.r)) * conf.wallRestitution;
      b.vx = -Math.abs(b.vx) * conf.wallRestitution;
    }
    if (b.y < b.r) {
      b.y = b.r + (b.r - b.y) * conf.wallRestitution;
      b.vy = Math.abs(b.vy) * conf.wallRestitution;
    } else if (b.y > conf.h - b.r) {
      b.y = conf.h - b.r - (b.y - (conf.h - b.r)) * conf.wallRestitution;
      b.vy = -Math.abs(b.vy) * conf.wallRestitution;
    }
  }

  // ball-ball collisions (two passes for stability)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]!;
      if (a.pocketed) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j]!;
        if (b.pocketed) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const minD = a.r + b.r;
        let d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) {
          dx = 1;
          dy = 0;
          d = 1e-6;
        }
        const nx = dx / d;
        const ny = dy / d;

        // positional correction
        const overlap = (minD - d) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        // impulse
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        const jImp = ((1 + conf.restitution) * rel) / (1 / a.m + 1 / b.m);
        a.vx -= (jImp * nx) / a.m;
        a.vy -= (jImp * ny) / a.m;
        b.vx += (jImp * nx) / b.m;
        b.vy += (jImp * ny) / b.m;

        if (trackId !== undefined && (a.id === trackId || b.id === trackId)) {
          const other = a.id === trackId ? b.id : a.id;
          if (!events.touched.includes(other)) events.touched.push(other);
        }
      }
    }
  }

  // friction + stop + clamp
  for (const b of bodies) {
    if (b.pocketed) continue;
    b.vx *= conf.friction;
    b.vy *= conf.friction;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < conf.stop) {
      b.vx = 0;
      b.vy = 0;
    } else if (sp > conf.maxSpeed) {
      b.vx = (b.vx / sp) * conf.maxSpeed;
      b.vy = (b.vy / sp) * conf.maxSpeed;
    }
  }

  return events;
}

export interface SimResult {
  pocketed: string[];
  touched: string[];
  frames: number;
}

/** Run until every body is at rest (or maxFrames hit). */
export function runToRest(bodies: PhysBody[], conf: PhysConf, trackId?: string, maxFrames = 480 * 25): SimResult {
  const pocketed: string[] = [];
  const touched: string[] = [];
  let frames = 0;
  for (; frames < maxFrames; frames++) {
    const ev = stepWorld(bodies, conf, trackId);
    for (const id of ev.pocketed) pocketed.push(id);
    for (const id of ev.touched) if (!touched.includes(id)) touched.push(id);
    const moving = bodies.some((b) => !b.pocketed && (b.vx !== 0 || b.vy !== 0));
    if (!moving) break;
  }
  return { pocketed, touched, frames };
}
