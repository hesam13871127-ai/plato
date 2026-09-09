import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Ball {
  /** Ball number: 0 = cue, 1-7 solids, 8 black, 9-15 stripes. */
  n: number;
  x: number;
  y: number;
  potted: boolean;
}

interface SimBall extends Ball {
  vx: number;
  vy: number;
}

interface PoolBoard extends Record<string, unknown> {
  /** balls[0] is always the cue ball (n = 0). */
  balls: Ball[];
  /** True until a group is legally potted (solids vs stripes unassigned). */
  openTable: boolean;
  /** Group per seat: 0 = solids (1-7), 1 = stripes (9-15); null while open. */
  groups: [number | null, number | null];
  /** The current seat must place the cue ball before shooting. */
  ballInHand: boolean;
  shotCount: number;
  lastShot: {
    seat: number;
    angle: number;
    power: number;
    /** Object balls potted by this shot, in order (cue tracked separately). */
    potted: number[];
    firstHit: number | null;
    cuePotted: boolean;
    foul: boolean;
    reason: string | null;
    /** Replay keyframes every FRAME_STRIDE sim steps: flat [x, y] per ball (-1 = potted). */
    frames: number[][];
  } | null;
}

// ── table geometry & physics (all deterministic) ───────────────────────────
const W = 200;
const H = 100;
const R = 3; // ball radius
const POCKETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [W / 2, 0], [W, 0], [0, H], [W / 2, H], [W, H],
];
const POCKET_R = 5.8;
const DT = 1 / 120;
const DAMP = 0.988; // per-step rolling friction
const STOP = 0.5;
const BALL_E = 0.95;
const CUSH_E = 0.78;
const MAX_STEPS = 2400;
const FRAME_STRIDE = 8;
const MAX_SHOTS = 300;

const FOOT: [number, number] = [150, 50];
const RACK_ORDER = [1, 9, 2, 3, 8, 10, 11, 4, 12, 5, 6, 13, 7, 14, 15];

const groupOf = (n: number): 0 | 1 | null => (n === 8 || n === 0 ? null : n < 8 ? 0 : 1);

interface SimResult {
  frames: number[][];
  potted: number[];
  firstHit: number | null;
  cuePotted: boolean;
}

/**
 * Arcade 8-ball Pool for two players, wave-2 rebuild.
 *
 * The engine owns a fully deterministic physics simulation: the shooter picks
 * an angle and power, then balls roll with rolling friction, collide with
 * elastic ball-ball impulses, rebound off cushions (pocket mouths stay open)
 * and drop into six pockets. The shot resolution follows 8-ball rules:
 * open table until a legal pot assigns groups, pot-your-group to stay at the
 * table, fouls (no contact, wrong group first, cue potted) give ball-in-hand,
 * the 8-ball re-spots on the break, pots early = instant loss and pots it
 * legally after clearing the group = the win. A progress guard decides
 * marathon games by remaining balls. `lastShot.frames` replays the shot on
 * the 3D board. No hidden information.
 *
 * Bots aim analytically: for every legal target and pocket they check both
 * travel lanes, score cut angle vs distance and add per-difficulty aim noise
 * and mistake rates; with ball-in-hand they place the cue straight behind the
 * easiest pot.
 */
@Injectable()
export class PoolEngine extends BaseGameEngine {
  readonly slug = 'pool';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const balls: Ball[] = [{ n: 0, x: 50, y: 50, potted: false }];
    let k = 0;
    for (let row = 0; row < 5; row++) {
      const x = FOOT[0] + row * (2 * R * 0.866 + 0.08);
      for (let j = 0; j <= row; j++) {
        const y = FOOT[1] + (j - row / 2) * (2 * R + 0.12);
        balls.push({ n: RACK_ORDER[k++], x, y, potted: false });
      }
    }
    const board: PoolBoard = {
      balls,
      openTable: true,
      groups: [null, null],
      ballInHand: true, // break: place the cue ball anywhere
      shotCount: 0,
      lastShot: null,
    };
    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: 0,
      turnStartedAt: new Date().toISOString(),
      seats: config.seats.map((s, i) => ({
        seatNumber: i,
        playerId: s.playerId,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        connected: true,
        score: 0,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: config.seats.map(() => 0),
      version: 1,
    };
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'The game is already over.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as PoolBoard;

    if (action.type === 'place') {
      if (!board.ballInHand) return { ok: false, error: 'You can only place the cue ball after a foul.' };
      const x = Number(action.payload.x);
      const y = Number(action.payload.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: 'Choose a valid spot.' };
      if (!this.validSpot(board, x, y)) {
        return { ok: false, error: 'That spot is blocked — pick open felt.' };
      }
      return { ok: true };
    }

    if (action.type === 'shoot') {
      if (board.ballInHand) return { ok: false, error: 'Place the cue ball first.' };
      const angle = Number(action.payload.angle);
      const power = Number(action.payload.power);
      if (!Number.isFinite(angle)) return { ok: false, error: 'Choose a valid aim.' };
      if (!Number.isFinite(power) || power <= 0 || power > 1) {
        return { ok: false, error: 'Power must be between 0 and 1.' };
      }
      return { ok: true };
    }

    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as PoolBoard;

    if (action.type === 'place') {
      const cue = board.balls.find((b) => b.n === 0);
      if (cue) {
        cue.x = Number(action.payload.x);
        cue.y = Number(action.payload.y);
        cue.potted = false;
      }
      board.ballInHand = false;
      next.version += 1;
      next.turnStartedAt = new Date().toISOString();
      return next; // same seat keeps shooting
    }

    // shoot
    const angle = Number(action.payload.angle);
    const power = Number(action.payload.power);
    const sim = this.simulate(board, angle, power);
    board.lastShot = {
      seat: action.seat,
      angle,
      power,
      potted: sim.potted,
      firstHit: sim.firstHit,
      cuePotted: sim.cuePotted,
      foul: false,
      reason: null,
      frames: sim.frames,
    };
    this.resolveShot(next, action.seat, sim);
    next.version += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as PoolBoard;
    if (board.ballInHand) {
      const spot = this.bestPlacement(board, seat);
      return {
        action: { seat, type: 'place', payload: { x: spot[0], y: spot[1] } },
        delayMs: this.think(difficulty, 300),
      };
    }
    const shot = this.bestShot(board, seat, difficulty);
    return {
      action: { seat, type: 'shoot', payload: { angle: shot.angle, power: shot.power } },
      delayMs: this.think(difficulty),
    };
  }

  // ── physics ───────────────────────────────────────────────────────────────

  private simulate(board: PoolBoard, angle: number, power: number): SimResult {
    const sim: SimBall[] = board.balls.map((b) => ({ ...b, vx: 0, vy: 0 }));
    const cue = sim.find((b) => b.n === 0);
    const speed = 30 + 140 * power;
    if (cue && !cue.potted) {
      cue.vx = Math.cos(angle) * speed;
      cue.vy = Math.sin(angle) * speed;
    }
    const frames: number[][] = [this.flatten(sim)];
    const potted: number[] = [];
    let firstHit: number | null = null;
    let cuePotted = false;

    for (let step = 1; step <= MAX_STEPS; step++) {
      for (const b of sim) {
        if (b.potted) continue;
        b.x += b.vx * DT;
        b.y += b.vy * DT;
      }

      // Ball-ball collisions (equal mass, elastic impulse + separation).
      for (let i = 0; i < sim.length; i++) {
        const a = sim[i];
        if (a.potted) continue;
        for (let j = i + 1; j < sim.length; j++) {
          const b = sim[j];
          if (b.potted) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 === 0 || d2 >= 4 * R * R) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const overlap = 2 * R - d;
          a.x -= (nx * overlap) / 2;
          a.y -= (ny * overlap) / 2;
          b.x += (nx * overlap) / 2;
          b.y += (ny * overlap) / 2;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            const imp = (-(1 + BALL_E) * rel) / 2;
            a.vx -= imp * nx;
            a.vy -= imp * ny;
            b.vx += imp * nx;
            b.vy += imp * ny;
            if (firstHit == null && (a.n === 0 || b.n === 0)) {
              firstHit = a.n === 0 ? b.n : a.n;
            }
          }
        }
      }

      // Cushions & pockets.
      for (const b of sim) {
        if (b.potted) continue;
        this.cushion(b);
        if (this.tryPot(b)) {
          if (b.n === 0) cuePotted = true;
          else potted.push(b.n);
          continue;
        }
        // Safety: a ball that somehow escaped the rails fell into a pocket.
        if (b.x < -POCKET_R || b.x > W + POCKET_R || b.y < -POCKET_R || b.y > H + POCKET_R) {
          let best = POCKETS[0];
          let bd = Infinity;
          for (const p of POCKETS) {
            const d = (b.x - p[0]) ** 2 + (b.y - p[1]) ** 2;
            if (d < bd) {
              bd = d;
              best = p;
            }
          }
          b.x = best[0];
          b.y = best[1];
          if (b.n === 0) cuePotted = true;
          else potted.push(b.n);
        }
      }

      // Rolling friction.
      let moving = false;
      for (const b of sim) {
        if (b.potted) continue;
        b.vx *= DAMP;
        b.vy *= DAMP;
        if (Math.hypot(b.vx, b.vy) < STOP) {
          b.vx = 0;
          b.vy = 0;
        } else {
          moving = true;
        }
      }

      if (step % FRAME_STRIDE === 0) frames.push(this.flatten(sim));
      if (!moving) break;
    }
    frames.push(this.flatten(sim));

    board.balls = sim.map(({ n, x, y, potted: p }) => ({ n, x, y, potted: p }));
    return { frames, potted, firstHit, cuePotted };
  }

  private cushion(b: SimBall): void {
    const mouth = POCKET_R + R + 1.5;
    const nearMouth = POCKETS.some((p) => Math.hypot(b.x - p[0], b.y - p[1]) < mouth);
    if (nearMouth) return;
    if (b.x < R && b.vx < 0) {
      b.x = R;
      b.vx = -b.vx * CUSH_E;
    } else if (b.x > W - R && b.vx > 0) {
      b.x = W - R;
      b.vx = -b.vx * CUSH_E;
    }
    if (b.y < R && b.vy < 0) {
      b.y = R;
      b.vy = -b.vy * CUSH_E;
    } else if (b.y > H - R && b.vy > 0) {
      b.y = H - R;
      b.vy = -b.vy * CUSH_E;
    }
  }

  private tryPot(b: SimBall): boolean {
    for (const [px, py] of POCKETS) {
      const dx = b.x - px;
      const dy = b.y - py;
      if (dx * dx + dy * dy < POCKET_R * POCKET_R) {
        b.potted = true;
        b.vx = 0;
        b.vy = 0;
        return true;
      }
    }
    return false;
  }

  private flatten(sim: SimBall[]): number[] {
    const out: number[] = [];
    for (const b of sim) {
      out.push(b.potted ? -1 : b.x, b.potted ? -1 : b.y);
    }
    return out;
  }

  // ── rules resolution ──────────────────────────────────────────────────────

  private resolveShot(next: GameState, seat: number, sim: SimResult): void {
    const board = next.board as unknown as PoolBoard;
    board.shotCount += 1;
    const wasBreak = board.shotCount === 1;
    const opponent = 1 - seat;

    const myGroup = board.groups[seat];
    const onEight =
      myGroup != null && !board.balls.some((b) => !b.potted && b.n !== 0 && b.n !== 8 && groupOf(b.n) === myGroup);

    let foul = false;
    let reason: string | null = null;
    if (sim.cuePotted) {
      foul = true;
      reason = 'Cue ball potted.';
    }
    if (sim.firstHit == null) {
      foul = true;
      reason ??= 'The cue ball hit nothing.';
    } else if (!board.openTable && myGroup != null) {
      if (onEight) {
        if (sim.firstHit !== 8) {
          foul = true;
          reason = 'You must play the 8-ball.';
        }
      } else if (groupOf(sim.firstHit) !== myGroup) {
        foul = true;
        reason = 'You must hit your own group first.';
      }
    }

    if (sim.potted.includes(8)) {
      if (wasBreak) {
        this.respotEight(board);
      } else if (onEight && !foul) {
        board.lastShot!.foul = foul;
        board.lastShot!.reason = null;
        this.finish(next, seat);
        return;
      } else {
        board.lastShot!.foul = foul;
        board.lastShot!.reason = reason ?? 'The 8-ball went down early.';
        this.finish(next, opponent);
        return;
      }
    }

    // Open table: the first legally potted object ball assigns groups.
    const objectPotted = sim.potted.filter((n) => n !== 8);
    if (board.openTable && !foul && objectPotted.length > 0) {
      const g = groupOf(objectPotted[0]);
      if (g != null) {
        board.groups[seat] = g;
        board.groups[opponent] = (1 - g) as 0 | 1;
        board.openTable = false;
      }
    }

    board.lastShot!.foul = foul;
    board.lastShot!.reason = reason;

    // Stay at the table only after a clean shot that potted your own ball.
    let continues = false;
    if (!foul && objectPotted.length > 0) {
      if (board.openTable) continues = true;
      else continues = objectPotted.some((n) => groupOf(n) === board.groups[seat]);
    }

    if (foul) {
      board.ballInHand = true;
      next.currentSeat = opponent;
    } else if (!continues) {
      next.currentSeat = opponent;
    }
    next.turn += 1;

    // Marathon guard: decide endless safety battles by remaining balls.
    if (next.phase === 'in_progress' && board.shotCount >= MAX_SHOTS) {
      const remaining = (s: number) => {
        const g = board.groups[s];
        if (g == null) return 99;
        return board.balls.filter((b) => !b.potted && b.n !== 0 && b.n !== 8 && groupOf(b.n) === g).length;
      };
      const mine = remaining(seat);
      const theirs = remaining(opponent);
      this.finish(next, mine === theirs ? opponent : mine < theirs ? seat : opponent);
    }
  }

  private respotEight(board: PoolBoard): void {
    const eight = board.balls.find((b) => b.n === 8);
    if (!eight) return;
    eight.potted = false;
    let [x, y] = FOOT;
    const free = (fx: number, fy: number) =>
      board.balls.every((b) => b.potted || b.n === 8 || Math.hypot(b.x - fx, b.y - fy) >= 2 * R + 0.1);
    while (!free(x, y) && x < W - R - 1) x += 1;
    eight.x = x;
    eight.y = y;
  }

  // ── bot brains ────────────────────────────────────────────────────────────

  private bestShot(
    board: PoolBoard,
    seat: number,
    difficulty: SeatInfo['botDifficulty'],
  ): { angle: number; power: number } {
    const cue = board.balls.find((b) => b.n === 0 && !b.potted);
    const targets = this.legalTargets(board, seat);
    if (!cue || targets.length === 0) return { angle: 0, power: 0.5 };

    const mistakeChance =
      difficulty === 'easy' ? 0.45 : difficulty === 'medium' ? 0.18 : difficulty === 'hard' ? 0.06 : 0.0;
    const noise = difficulty === 'easy' ? 0.18 : difficulty === 'medium' ? 0.08 : difficulty === 'hard' ? 0.03 : 0.01;

    if (Math.random() < mistakeChance) {
      const t = targets[Math.floor(Math.random() * targets.length)];
      const angle = Math.atan2(t.y - cue.y, t.x - cue.x) + (Math.random() * 2 - 1) * 0.25;
      return { angle, power: 0.4 + Math.random() * 0.4 };
    }

    let best: { angle: number; power: number; score: number } | null = null;
    for (const t of targets) {
      for (const [px, py] of POCKETS) {
        if (!this.clearPath(board.balls, t.x, t.y, px, py, [t.n])) continue;
        const ddx = t.x - px;
        const ddy = t.y - py;
        const dd = Math.hypot(ddx, ddy);
        if (dd < 1) continue;
        const gx = t.x + (ddx / dd) * 2 * R;
        const gy = t.y + (ddy / dd) * 2 * R;
        if (gx < R || gx > W - R || gy < R || gy > H - R) continue;
        if (!this.clearPath(board.balls, cue.x, cue.y, gx, gy, [t.n, 0])) continue;
        const cdx = gx - cue.x;
        const cdy = gy - cue.y;
        const cd = Math.hypot(cdx, cdy);
        if (cd < 1) continue;
        const bdx = (px - t.x) / dd;
        const bdy = (py - t.y) / dd;
        const cut = (cdx / cd) * bdx + (cdy / cd) * bdy;
        if (cut < 0.12) continue; // too thin to attempt
        const dist = cd + dd;
        const score = cut * 2 - dist / 400;
        if (!best || score > best.score) {
          const power = Math.min(0.95, Math.max(0.32, 0.3 + dist / 380 + (t.n === 8 ? 0.05 : 0)));
          best = { angle: Math.atan2(cdy, cdx), power, score };
        }
      }
    }

    if (best) {
      return { angle: best.angle + (Math.random() * 2 - 1) * noise, power: best.power };
    }

    // Safety: softly roll onto the nearest legal target.
    const t = targets.reduce((a, b) =>
      Math.hypot(a.x - cue.x, a.y - cue.y) < Math.hypot(b.x - cue.x, b.y - cue.y) ? a : b,
    );
    return {
      angle: Math.atan2(t.y - cue.y, t.x - cue.x) + (Math.random() * 2 - 1) * noise,
      power: 0.38,
    };
  }

  private bestPlacement(board: PoolBoard, seat: number): [number, number] {
    const targets = this.legalTargets(board, seat);
    let best: { x: number; y: number; score: number } | null = null;
    for (const t of targets) {
      for (const [px, py] of POCKETS) {
        if (!this.clearPath(board.balls, t.x, t.y, px, py, [t.n])) continue;
        const ddx = t.x - px;
        const ddy = t.y - py;
        const dd = Math.hypot(ddx, ddy);
        if (dd < 1) continue;
        const x = t.x + (ddx / dd) * 26;
        const y = t.y + (ddy / dd) * 26;
        if (!this.validSpot(board, x, y)) continue;
        if (!this.clearPath(board.balls, x, y, t.x, t.y, [t.n, 0])) continue;
        const score = 2 - dd / 300;
        if (!best || score > best.score) best = { x, y, score };
      }
    }
    if (best) return [best.x, best.y];

    const anyTarget = targets[0];
    let fallback: [number, number] = [50, 50];
    let fbDist = Infinity;
    for (let x = 25; x <= 175; x += 15) {
      for (let y = 15; y <= 85; y += 15) {
        if (!this.validSpot(board, x, y)) continue;
        const d = anyTarget ? Math.hypot(anyTarget.x - x, anyTarget.y - y) : 0;
        if (d < fbDist) {
          fbDist = d;
          fallback = [x, y];
        }
      }
    }
    return fallback;
  }

  private legalTargets(board: PoolBoard, seat: number): Ball[] {
    const g = board.groups[seat];
    if (board.openTable || g == null) {
      return board.balls.filter((b) => !b.potted && b.n !== 0 && b.n !== 8);
    }
    const own = board.balls.filter((b) => !b.potted && b.n !== 0 && groupOf(b.n) === g);
    if (own.length > 0) return own;
    return board.balls.filter((b) => !b.potted && b.n === 8);
  }

  private clearPath(
    balls: Ball[],
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    ignore: number[],
  ): boolean {
    for (const b of balls) {
      if (b.potted || ignore.includes(b.n)) continue;
      if (this.segDist(b.x, b.y, x1, y1, x2, y2) < 2 * R * 0.95) return false;
    }
    return true;
  }

  private segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  private validSpot(board: PoolBoard, x: number, y: number): boolean {
    if (x < R + 0.2 || x > W - R - 0.2 || y < R + 0.2 || y > H - R - 0.2) return false;
    for (const b of board.balls) {
      if (b.potted || b.n === 0) continue;
      if (Math.hypot(b.x - x, b.y - y) < 2 * R + 0.05) return false;
    }
    for (const [px, py] of POCKETS) {
      if (Math.hypot(x - px, y - py) < POCKET_R + R + 0.2) return false;
    }
    return true;
  }

  // ── shared helpers ────────────────────────────────────────────────────────

  private finish(state: GameState, winnerSeat: number | null): void {
    const scores = state.scores.map((_, i) => (winnerSeat === null ? 0 : i === winnerSeat ? 1 : 0));
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = scores;
    state.seats = state.seats.map((s, i) => ({ ...s, score: scores[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1500 : difficulty === 'medium' ? 1100 : difficulty === 'hard' ? 800 : 550;
    return base + extra + Math.floor(Math.random() * 900);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as PoolBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        balls: board.balls.map((b) => ({ ...b })),
        openTable: board.openTable,
        groups: [...board.groups] as [number | null, number | null],
        ballInHand: board.ballInHand,
        shotCount: board.shotCount,
        lastShot: board.lastShot
          ? {
              ...board.lastShot,
              potted: [...board.lastShot.potted],
              frames: board.lastShot.frames.map((f) => [...f]),
            }
          : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
