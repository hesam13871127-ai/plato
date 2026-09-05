import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Ball {
  id: number; // 1-7 solids, 8 = eight, 9-15 stripes; cue = 0
  x: number; // 0..1 table coords
  y: number;
  vx: number;
  vy: number;
  active: boolean; // not pocketed
  group: 'cue' | 'solid' | 'stripe' | 'eight';
}

interface PoolBoard extends Record<string, unknown> {
  balls: Ball[];
  turnSeat: number;
  // Assigned group per seat: '' | 'solid' | 'stripe'
  groups: string[];
  // Pocketed count per group for each seat's win condition tracking.
  phase: 'aim' | 'sim' | 'ended';
  lastPocketed: number[];
  foul: boolean;
  scratch: boolean;
  botSeats: boolean[];
  simStep: number;
  firstContactGroup: string | null;
  pocketedThisShot: number[];
  difficulty: Array<SeatInfo['botDifficulty']>;
}

const POCKET_R = 0.07;
const BALL_R = 0.028;
const FRICTION = 0.995;
const STOP_EPS = 0.0015;
const POCKETS: Array<[number, number]> = [
  [0.04, 0.06], [0.5, 0.03], [0.96, 0.06],
  [0.04, 0.94], [0.5, 0.97], [0.96, 0.94],
];

/**
 * Pool (8-ball) for two players, LIVE. A player aims and applies power to the
 * cue ball; the server runs a deterministic friction/collision/pocket
 * simulation over the tick loop, then resolves the shot (turn, scratches,
 * group assignment, win/loss on the 8-ball). Bots pick a legal-looking shot
 * automatically after a human-like delay. Simplified but complete 8-ball rules.
 */
@Injectable()
export class PoolEngine extends BaseGameEngine {
  readonly slug = 'pool_8ball';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = true;

  createInitialState(config: MatchConfig): GameState {
    const balls = this.rack();
    const board: PoolBoard = {
      balls,
      turnSeat: 0,
      groups: ['', ''],
      phase: 'aim',
      lastPocketed: [],
      foul: false,
      scratch: false,
      botSeats: config.seats.map((s) => s.isBot),
      simStep: 0,
      firstContactGroup: null,
      pocketedThisShot: [],
      difficulty: config.seats.map((s) => s.botDifficulty ?? 'medium'),
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

  private rack(): Ball[] {
    const balls: Ball[] = [];
    const groupOf = (id: number): Ball['group'] => {
      if (id === 0) return 'cue';
      if (id === 8) return 'eight';
      return id <= 7 ? 'solid' : 'stripe';
    };
    // Cue ball behind the head spot.
    balls.push(this.ball(0, 0.25, 0.5, groupOf(0)));
    // Triangle rack toward the foot spot, 8 in the centre.
    const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    let idx = 0;
    const startX = 0.68;
    const dy = 0.032;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const x = startX + row * 0.03;
        const y = 0.5 + (col - row / 2) * (dy * 2);
        const id = order[idx++];
        balls.push(this.ball(id, x, y, groupOf(id)));
      }
    }
    return balls;
  }

  private ball(id: number, x: number, y: number, group: Ball['group']): Ball {
    return { id, x, y, vx: 0, vy: 0, active: true, group };
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is over.' };
    const board = state.board as unknown as PoolBoard;
    if (action.type !== 'shoot') return { ok: false, error: 'Unknown action.' };
    if (action.seat !== board.turnSeat) return { ok: false, error: 'It is not your turn.' };
    if (board.phase !== 'aim') return { ok: false, error: 'Wait for the balls to stop.' };
    const angle = Number((action.payload as { angle?: unknown }).angle);
    const power = Number((action.payload as { power?: unknown }).power);
    if (!Number.isFinite(angle)) return { ok: false, error: 'Aim angle required.' };
    if (!Number.isFinite(power) || power < 0.1 || power > 1) {
      return { ok: false, error: 'Power must be between 0.1 and 1.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid shot.');
    const board = state.board as unknown as PoolBoard;
    const angle = Number((action.payload as { angle: number }).angle);
    const power = Number((action.payload as { power: number }).power);
    const speed = 0.018 * power;
    const cue = board.balls[0];
    cue.vx = Math.cos(angle) * speed;
    cue.vy = Math.sin(angle) * speed;
    board.phase = 'sim';
    board.simStep = 0;
    board.foul = false;
    board.scratch = false;
    board.firstContactGroup = null;
    board.pocketedThisShot = [];
    state.version += 1;
    return state;
  }

  tick(state: GameState): GameState {
    if (state.phase !== 'in_progress') return state;
    const board = state.board as unknown as PoolBoard;
    if (board.phase !== 'sim') {
      this.botShoot(state, board);
      return state;
    }
    // Sub-step the physics several times per tick for stable, realistic motion.
    for (let i = 0; i < 4; i++) this.stepPhysics(board);
    const moving = board.balls.some((b) => b.active && (Math.abs(b.vx) > STOP_EPS || Math.abs(b.vy) > STOP_EPS));
    state.version += 1;
    if (!moving) {
      this.resolveShot(state, board);
    }
    return state;
  }

  private stepPhysics(board: PoolBoard): void {
    const balls = board.balls.filter((b) => b.active);
    // Integrate.
    for (const b of balls) {
      b.x += b.vx;
      b.y += b.vy;
      b.vx *= FRICTION;
      b.vy *= FRICTION;
    }
    // Cushions.
    for (const b of balls) {
      if (b.y < BALL_R) { b.y = BALL_R; b.vy = -b.vy; }
      if (b.y > 1 - BALL_R) { b.y = 1 - BALL_R; b.vy = -b.vy; }
      if (b.x < BALL_R) { b.x = BALL_R; b.vx = -b.vx; }
      if (b.x > 1 - BALL_R) { b.x = 1 - BALL_R; b.vx = -b.vx; }
    }
    // Pockets.
    for (const b of balls) {
      for (const [px, py] of POCKETS) {
        const dx = b.x - px;
        const dy = b.y - py;
        if (Math.hypot(dx, dy) < POCKET_R) {
          b.active = false;
          b.vx = 0;
          b.vy = 0;
          board.pocketedThisShot.push(b.id);
          board.lastPocketed.push(b.id);
          break;
        }
      }
    }
    // Ball-ball collisions (elastic, equal mass).
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i];
        const c = balls[j];
        if (!a.active || !c.active) continue;
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < BALL_R * 2) {
          if (board.firstContactGroup == null && (a.id === 0 || c.id === 0)) {
            const other = a.id === 0 ? c : a;
            board.firstContactGroup = other.group === 'solid' || other.group === 'stripe' ? other.group : 'eight';
          }
          const nx = dx / dist;
          const ny = dy / dist;;
          const overlap = BALL_R * 2 - dist;
          a.x -= (nx * overlap) / 2;
          a.y -= (ny * overlap) / 2;
          c.x += (nx * overlap) / 2;
          c.y += (ny * overlap) / 2;
          const dvx = c.vx - a.vx;
          const dvy = c.vy - a.vy;
          const dot = dvx * nx + dvy * ny;
          if (dot < 0) {
            a.vx += dot * nx;
            a.vy += dot * ny;
            c.vx -= dot * nx;
            c.vy -= dot * ny;
          }
        }
      }
    }
  }

  private resolveShot(state: GameState, board: PoolBoard): void {
    const seat = board.turnSeat;
    const opp = 1 - seat;
    const cuePocketed = board.pocketedThisShot.includes(0);
    const eightPocketed = board.pocketedThisShot.includes(8);
    const pocketed = board.pocketedThisShot.filter((id) => id !== 0 && id !== 8);

    // Assign groups on first legal pot after the break.
    if (board.groups[seat] === '' && board.groups[opp] === '' && pocketed.length > 0 && !cuePocketed) {
      const firstGroup = board.balls.find((b) => b.id === pocketed[0])?.group;
      if (firstGroup === 'solid' || firstGroup === 'stripe') {
        board.groups[seat] = firstGroup;
        board.groups[opp] = firstGroup === 'solid' ? 'stripe' : 'solid';
      }
    }

    let foul = false;
    if (cuePocketed) {
      foul = true;
      board.scratch = true;
      // respot cue
      const cue = board.balls[0];
      cue.active = true;
      cue.x = 0.25;
      cue.y = 0.5;
      cue.vx = 0;
      cue.vy = 0;
    }

    // 8-ball resolution.
    if (eightPocketed) {
      const myGroup = board.groups[seat];
      const cleared = myGroup
        ? !board.balls.some((b) => b.active && b.group === myGroup)
        : false;
      // Pocketing the 8 early or on a scratch/uncalled table loses; clearing
      // your group first wins.
      const win = cleared && !foul;
      this.finish(state, win ? seat : opp, board);
      return;
    }

    // Turn logic: continue if you legally pocketed your own group; else switch.
    const pottedOwn = pocketed.some((id) => {
      const g = board.balls.find((b) => b.id === id)?.group;
      return board.groups[seat] !== '' && g === board.groups[seat];
    });
    if (!pottedOwn || foul) {
      board.turnSeat = opp;
      state.currentSeat = opp;
    }
    board.phase = 'aim';
    board.foul = foul;
    // Settle residual motion so frozen velocities don't carry into the next shot.
    for (const b of board.balls) {
      b.vx = 0;
      b.vy = 0;
    }
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
    state.version += 1;
  }

  private botShoot(state: GameState, board: PoolBoard): void {
    const takenOver =
      ((state as unknown as { __autoSeats?: boolean[] }).__autoSeats?.[board.turnSeat]) ?? false;
    if (!board.botSeats[board.turnSeat] && !takenOver) return;
    // Only act on a human-like delay after becoming active; use a counter.
    board.simStep += 1;
    const difficulty = board.difficulty[board.turnSeat] ?? 'medium';
    const wait = difficulty === 'easy' ? 22 : difficulty === 'medium' ? 16 : difficulty === 'hard' ? 10 : 6; // ticks (~250ms each)
    if (board.simStep < wait) return;
    board.simStep = 0;
    const shot = this.chooseBotShot(board, difficulty);
    const cue = board.balls[0];
    cue.vx = Math.cos(shot.angle) * 0.018 * shot.power;
    cue.vy = Math.sin(shot.angle) * 0.018 * shot.power;
    board.phase = 'sim';
    board.foul = false;
    board.scratch = false;
    board.firstContactGroup = null;
    board.pocketedThisShot = [];
    state.version += 1;
  }

  private chooseBotShot(board: PoolBoard, difficulty: SeatInfo['botDifficulty']): { angle: number; power: number } {
    const cue = board.balls[0];
    const myGroup = board.groups[board.turnSeat] || '';
    let targets = board.balls.filter((b) => b.active && b.group !== 'cue' && b.group !== 'eight');
    if (myGroup) {
      const mine = targets.filter((b) => b.group === myGroup);
      targets = mine.length > 0 ? mine : board.balls.filter((b) => b.active && b.group === 'eight');
    }
    if (targets.length === 0) targets = board.balls.filter((b) => b.active && b.group !== 'cue');

    // Pick the (ball, pocket) pair with the straightest, unblocked cut.
    let best: { angle: number; score: number } | null = null;
    for (const target of targets) {
      for (const pk of POCKETS) {
        const tx = pk[0] - target.x;
        const ty = pk[1] - target.y;
        const tlen = Math.hypot(tx, ty) || 1;
        const ghostX = target.x - (tx / tlen) * BALL_R * 2;
        const ghostY = target.y - (ty / tlen) * BALL_R * 2;
        const aimAng = Math.atan2(ghostY - cue.y, ghostX - cue.x);
        // Cut angle: between cue's incoming direction and the ball→pocket line.
        const incoming = Math.atan2(ghostY - cue.y, ghostX - cue.x);
        const toPocket = Math.atan2(ty, tx);
        let cut = Math.abs(((incoming - toPocket + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (cut > Math.PI / 2) cut = Math.PI - cut;
        // Path clearance from cue to ghost.
        const blocked = this.pathBlocked(board, cue.x, cue.y, ghostX, ghostY, target.id);
        if (blocked) continue;
        // Prefer small cut and short distances.
        const distCue = Math.hypot(ghostX - cue.x, ghostY - cue.y);
        const distPocket = tlen;
        const score = -cut * 3 - distCue * 0.5 - distPocket * 0.5;
        if (!best || score > best.score) best = { angle: aimAng, score };
      }
    }
    let angle = best ? best.angle : Math.random() * Math.PI * 2;
    const error = difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.18 : difficulty === 'hard' ? 0.08 : 0.03;
    angle += (Math.random() - 0.5) * 2 * error;
    const power = 0.65 + Math.random() * 0.25;
    return { angle, power: Math.min(1, power) };
  }

  private pathBlocked(board: PoolBoard, x0: number, y0: number, x1: number, y1: number, ignoreId: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    for (const b of board.balls) {
      if (!b.active || b.id === 0 || b.id === ignoreId) continue;
      // Project ball centre onto the cue→ghost segment.
      const t = (b.x - x0) * nx + (b.y - y0) * ny;
      if (t < 0 || t > len) continue;
      const px = x0 + nx * t;
      const py = y0 + ny * t;
      if (Math.hypot(b.x - px, b.y - py) < BALL_R * 1.8) return true;
    }
    return false;
  }

  private finish(state: GameState, winnerSeat: number, board: PoolBoard): void {
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.winnerSeats = [winnerSeat];
    state.currentSeat = -1;
    board.phase = 'ended';
    state.scores = [0, 1].map((i) => (i === winnerSeat ? 1 : 0));
    state.version += 1;
  }

  chooseBotMove(): BotMove {
    return { action: { seat: -1, type: '__noop__', payload: {} }, delayMs: 0 };
  }

  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as PoolBoard;
    // Pool is perfect-information: all ball positions are public.
    const safe = {
      balls: board.balls.map((b) => ({ id: b.id, x: b.x, y: b.y, active: b.active, group: b.group })),
      turnSeat: board.turnSeat,
      groups: board.groups,
      phase: board.phase,
      lastPocketed: board.lastPocketed,
      foul: board.foul,
      scratch: board.scratch,
    };
    return { ...state, board: safe as unknown as Record<string, unknown> };
  }
}
