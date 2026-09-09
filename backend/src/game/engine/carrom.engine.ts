import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Piece {
  /** 0 = white (seat 0), 1 = black (seat 1), 8 = queen, 9 = striker. */
  k: number;
  x: number;
  y: number;
  potted: boolean;
}

interface SimPiece extends Piece {
  vx: number;
  vy: number;
}

interface CarromBoard extends Record<string, unknown> {
  pieces: Piece[];
  /** The striker must be placed on the shooter's baseline before flicking. */
  strikerInHand: boolean;
  /** The queen is down but awaits a cover pot from the seat that potted her. */
  queenPending: boolean;
  /** Seat that legally covered the queen (for the win bonus). */
  queenCoveredBy: number | null;
  shotCount: number;
  lastShot: {
    seat: number;
    angle: number;
    power: number;
    potted: number[]; // piece kinds, in order (0/1/8)
    strikerPotted: boolean;
    foul: boolean;
    reason: string | null;
    frames: number[][];
  } | null;
}

// ── board geometry & physics (deterministic) ───────────────────────────────
const S = 100; // square board, coordinates 0..S
const R = 4.0; // carrom man radius
const STRIKER_R = 4.2;
const POCKET_R = 5.4;
const POCKETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [S, 0], [0, S], [S, S],
];
const BASE_LO = 17; // baseline band (low edge) — seat 1 flicks from up here
const BASE_HI = 21;
const BASE_X_MIN = 22;
const BASE_X_MAX = 78;
const DT = 1 / 120;
const DAMP = 0.986;
const STOP = 0.5;
const PIECE_E = 0.92;
const CUSH_E = 0.72;
const MAX_STEPS = 2400;
const FRAME_STRIDE = 8;
const MAX_SHOTS = 300;
const QUEEN = 8;
const STRIKER = 9;

interface SimResult {
  frames: number[][];
  potted: number[];
  strikerPotted: boolean;
}

const isOwn = (k: number, seat: number) => k === seat;

/**
 * Carrom for two players, wave-2 rebuild.
 *
 * A square wooden board with four corner pockets. Each turn the shooter
 * places the striker anywhere on their own baseline band, then flicks it —
 * the same deterministic physics core as Pool drives pieces (rolling
 * friction, elastic collisions, wooden rebounds, pocket capture) and ships
 * replay keyframes. Pot your nine carrom men to keep the turn; pot the red
 * queen and cover her with one of your own on the same or next stroke, or
 * she returns to the centre. A potted striker is a foul: one of your potted
 * men comes back and the turn passes. Sink all nine of your colour to win
 * (the covered queen adds a bonus to the final score). No hidden information.
 *
 * Bots aim analytically like the pool brain — target × pocket lane checks,
 * ghost-striker geometry, cut-angle scoring — and sample baseline positions
 * to set up the easiest board.
 */
@Injectable()
export class CarromEngine extends BaseGameEngine {
  readonly slug = 'carrom';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const pieces: Piece[] = [];
    const push = (k: number, x: number, y: number) => pieces.push({ k, x, y, potted: false });
    push(QUEEN, 50, 50);
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (30 + 60 * i);
      push(i % 2, 50 + Math.cos(a) * 8.6, 50 + Math.sin(a) * 8.6);
    }
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI / 180) * (15 + 30 * i);
      push((i + 1) % 2, 50 + Math.cos(a) * 17.2, 50 + Math.sin(a) * 17.2);
    }
    pieces.push({ k: STRIKER, x: 50, y: 0, potted: false }); // off-board until placed
    const board: CarromBoard = {
      pieces,
      strikerInHand: true,
      queenPending: false,
      queenCoveredBy: null,
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
    const board = state.board as unknown as CarromBoard;

    if (action.type === 'place') {
      if (!board.strikerInHand) return { ok: false, error: 'The striker is already placed.' };
      const x = Number(action.payload.x);
      const y = Number(action.payload.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: 'Choose a valid spot.' };
      if (x < BASE_X_MIN || x > BASE_X_MAX) {
        return { ok: false, error: 'Keep the striker between the base circles.' };
      }
      const lo = action.seat === 0 ? S - BASE_HI : BASE_LO;
      const hi = action.seat === 0 ? S - BASE_LO : BASE_HI;
      if (y < lo || y > hi) return { ok: false, error: 'Place the striker on your own baseline.' };
      for (const p of board.pieces) {
        if (p.potted || p.k === STRIKER) continue;
        if (Math.hypot(p.x - x, p.y - y) < R + STRIKER_R + 0.05) {
          return { ok: false, error: 'That spot is blocked by a piece.' };
        }
      }
      for (const [px, py] of POCKETS) {
        if (Math.hypot(x - px, y - py) < POCKET_R + STRIKER_R + 0.2) {
          return { ok: false, error: 'Too close to a pocket.' };
        }
      }
      return { ok: true };
    }

    if (action.type === 'shoot') {
      if (board.strikerInHand) return { ok: false, error: 'Place the striker first.' };
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
    const board = next.board as unknown as CarromBoard;

    if (action.type === 'place') {
      const striker = board.pieces.find((p) => p.k === STRIKER);
      if (striker) {
        striker.x = Number(action.payload.x);
        striker.y = Number(action.payload.y);
        striker.potted = false;
      }
      board.strikerInHand = false;
      next.version += 1;
      next.turnStartedAt = new Date().toISOString();
      return next; // same seat keeps the turn
    }

    const angle = Number(action.payload.angle);
    const power = Number(action.payload.power);
    const sim = this.simulate(board, angle, power);
    board.lastShot = {
      seat: action.seat,
      angle,
      power,
      potted: sim.potted,
      strikerPotted: sim.strikerPotted,
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
    const board = state.board as unknown as CarromBoard;
    if (board.strikerInHand) {
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

  private simulate(board: CarromBoard, angle: number, power: number): SimResult {
    const sim: SimPiece[] = board.pieces.map((p) => ({ ...p, vx: 0, vy: 0 }));
    const striker = sim.find((p) => p.k === STRIKER);
    const speed = 25 + 135 * power;
    if (striker && !striker.potted) {
      striker.vx = Math.cos(angle) * speed;
      striker.vy = Math.sin(angle) * speed;
    }
    const frames: number[][] = [this.flatten(sim)];
    const potted: number[] = [];
    let strikerPotted = false;

    for (let step = 1; step <= MAX_STEPS; step++) {
      for (const p of sim) {
        if (p.potted) continue;
        p.x += p.vx * DT;
        p.y += p.vy * DT;
      }

      // Piece-piece collisions.
      for (let i = 0; i < sim.length; i++) {
        const a = sim[i];
        if (a.potted) continue;
        for (let j = i + 1; j < sim.length; j++) {
          const b = sim[j];
          if (b.potted) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          const rr = a.k === STRIKER || b.k === STRIKER ? R + STRIKER_R : 2 * R;
          if (d2 === 0 || d2 >= rr * rr) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const overlap = rr - d;
          a.x -= (nx * overlap) / 2;
          a.y -= (ny * overlap) / 2;
          b.x += (nx * overlap) / 2;
          b.y += (ny * overlap) / 2;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            const imp = (-(1 + PIECE_E) * rel) / 2;
            a.vx -= imp * nx;
            a.vy -= imp * ny;
            b.vx += imp * nx;
            b.vy += imp * ny;
          }
        }
      }

      // Cushions & pockets.
      for (const p of sim) {
        if (p.potted) continue;
        this.cushion(p);
        if (this.tryPot(p)) {
          if (p.k === STRIKER) strikerPotted = true;
          else potted.push(p.k);
          continue;
        }
        if (p.x < -POCKET_R || p.x > S + POCKET_R || p.y < -POCKET_R || p.y > S + POCKET_R) {
          let best = POCKETS[0];
          let bd = Infinity;
          for (const q of POCKETS) {
            const d = (p.x - q[0]) ** 2 + (p.y - q[1]) ** 2;
            if (d < bd) {
              bd = d;
              best = q;
            }
          }
          p.x = best[0];
          p.y = best[1];
          if (p.k === STRIKER) strikerPotted = true;
          else potted.push(p.k);
        }
      }

      let moving = false;
      for (const p of sim) {
        if (p.potted) continue;
        p.vx *= DAMP;
        p.vy *= DAMP;
        if (Math.hypot(p.vx, p.vy) < STOP) {
          p.vx = 0;
          p.vy = 0;
        } else {
          moving = true;
        }
      }

      if (step % FRAME_STRIDE === 0) frames.push(this.flatten(sim));
      if (!moving) break;
    }
    frames.push(this.flatten(sim));

    board.pieces = sim.map(({ k, x, y, potted: p }) => ({ k, x, y, potted: p }));
    return { frames, potted, strikerPotted };
  }

  private cushion(p: SimPiece): void {
    const pr = p.k === STRIKER ? STRIKER_R : R;
    const mouth = POCKET_R + pr + 1.5;
    const nearMouth = POCKETS.some((q) => Math.hypot(p.x - q[0], p.y - q[1]) < mouth);
    if (nearMouth) return;
    if (p.x < pr && p.vx < 0) {
      p.x = pr;
      p.vx = -p.vx * CUSH_E;
    } else if (p.x > S - pr && p.vx > 0) {
      p.x = S - pr;
      p.vx = -p.vx * CUSH_E;
    }
    if (p.y < pr && p.vy < 0) {
      p.y = pr;
      p.vy = -p.vy * CUSH_E;
    } else if (p.y > S - pr && p.vy > 0) {
      p.y = S - pr;
      p.vy = -p.vy * CUSH_E;
    }
  }

  private tryPot(p: SimPiece): boolean {
    for (const [px, py] of POCKETS) {
      const dx = p.x - px;
      const dy = p.y - py;
      if (dx * dx + dy * dy < POCKET_R * POCKET_R) {
        p.potted = true;
        p.vx = 0;
        p.vy = 0;
        return true;
      }
    }
    return false;
  }

  private flatten(sim: SimPiece[]): number[] {
    const out: number[] = [];
    for (const p of sim) {
      out.push(p.potted ? -1 : p.x, p.potted ? -1 : p.y);
    }
    return out;
  }

  // ── rules resolution ──────────────────────────────────────────────────────

  private resolveShot(next: GameState, seat: number, sim: SimResult): void {
    const board = next.board as unknown as CarromBoard;
    board.shotCount += 1;
    const opponent = 1 - seat;

    const foul = sim.strikerPotted;
    const pottedQueen = sim.potted.includes(QUEEN);
    const ownPotted = sim.potted.filter((k) => isOwn(k, seat));

    if (foul) {
      // The striker went down: one potted man of the shooter comes back, any
      // queen progress is void, and the turn passes.
      if (pottedQueen || board.queenPending) {
        this.respawnQueen(board);
        board.queenPending = false;
      }
      this.respawnOwn(board, seat);
      board.lastShot!.foul = true;
      board.lastShot!.reason = 'Striker potted.';
      board.strikerInHand = true;
      next.currentSeat = opponent;
      next.turn += 1;
      this.checkWin(next);
      return;
    }

    let continues = false;
    if (pottedQueen && ownPotted.length > 0) {
      board.queenPending = false;
      board.queenCoveredBy = seat; // potted and covered in one stroke
      continues = true;
    } else if (pottedQueen) {
      board.queenPending = true;
      continues = true; // shoot again to cover her
    } else if (board.queenPending && ownPotted.length > 0) {
      board.queenPending = false;
      board.queenCoveredBy = seat;
      continues = true;
    } else if (board.queenPending) {
      this.respawnQueen(board); // failed cover — she returns
      board.queenPending = false;
    }

    if (ownPotted.length > 0) continues = true;
    board.strikerInHand = true; // every turn starts with striker placement

    if (continues) {
      // same seat keeps shooting
    } else {
      next.currentSeat = opponent;
    }
    next.turn += 1;

    this.checkWin(next);

    // Marathon guard.
    if (next.phase === 'in_progress' && board.shotCount >= MAX_SHOTS) {
      const remaining = (s: number) => board.pieces.filter((p) => !p.potted && isOwn(p.k, s)).length;
      const mine = remaining(seat);
      const theirs = remaining(opponent);
      this.finish(next, mine === theirs ? opponent : mine < theirs ? seat : opponent);
    }
  }

  /** Ends the game when a seat has all nine men down (shooter checked first). */
  private checkWin(next: GameState): void {
    if (next.phase !== 'in_progress') return;
    const board = next.board as unknown as CarromBoard;
    const shooter = board.lastShot?.seat ?? next.currentSeat;
    for (const seat of [shooter, 1 - shooter]) {
      const left = board.pieces.filter((p) => !p.potted && isOwn(p.k, seat)).length;
      if (left === 0) {
        this.finish(next, seat);
        return;
      }
    }
  }

  /** Puts the queen back on a free spot near the centre. */
  private respawnQueen(board: CarromBoard): void {
    const queen = board.pieces.find((p) => p.k === QUEEN);
    if (queen) this.respawnAt(board, queen);
  }

  /** Returns the most recently potted man of `seat` to the centre. */
  private respawnOwn(board: CarromBoard, seat: number): void {
    const mine = board.pieces.filter((p) => p.potted && isOwn(p.k, seat));
    if (mine.length > 0) this.respawnAt(board, mine[mine.length - 1]);
  }

  private respawnAt(board: CarromBoard, piece: Piece): void {
    const free = (x: number, y: number) =>
      board.pieces.every(
        (p) => p.potted || p === piece || Math.hypot(p.x - x, p.y - y) >= 2 * R + 0.15,
      );
    let x = 50;
    let y = 50;
    let radius = 0;
    while (!free(x, y) && radius < 40) {
      radius += 2.5;
      const a = radius * 1.7; // spiral
      x = 50 + Math.cos(a) * radius;
      y = 50 + Math.sin(a) * radius;
    }
    piece.x = Math.max(R, Math.min(S - R, x));
    piece.y = Math.max(R, Math.min(S - R, y));
    piece.potted = false;
  }

  // ── bot brains ────────────────────────────────────────────────────────────

  private bestShot(
    board: CarromBoard,
    seat: number,
    difficulty: SeatInfo['botDifficulty'],
  ): { angle: number; power: number } {
    const striker = board.pieces.find((p) => p.k === STRIKER && !p.potted);
    const targets = this.legalTargets(board, seat);
    if (!striker || targets.length === 0) return { angle: 0, power: 0.5 };

    const mistakeChance =
      difficulty === 'easy' ? 0.45 : difficulty === 'medium' ? 0.18 : difficulty === 'hard' ? 0.06 : 0.0;
    const noise = difficulty === 'easy' ? 0.18 : difficulty === 'medium' ? 0.08 : difficulty === 'hard' ? 0.03 : 0.01;

    if (Math.random() < mistakeChance) {
      const t = targets[Math.floor(Math.random() * targets.length)];
      const angle = Math.atan2(t.y - striker.y, t.x - striker.x) + (Math.random() * 2 - 1) * 0.25;
      return { angle, power: 0.4 + Math.random() * 0.4 };
    }

    let best: { angle: number; power: number; score: number } | null = null;
    for (const t of targets) {
      for (const [px, py] of POCKETS) {
        if (!this.clearPath(board.pieces, t.x, t.y, px, py, [t.k])) continue;
        const ddx = t.x - px;
        const ddy = t.y - py;
        const dd = Math.hypot(ddx, ddy);
        if (dd < 1) continue;
        const gx = t.x + (ddx / dd) * (R + STRIKER_R);
        const gy = t.y + (ddy / dd) * (R + STRIKER_R);
        if (gx < STRIKER_R || gx > S - STRIKER_R || gy < STRIKER_R || gy > S - STRIKER_R) continue;
        if (!this.clearPath(board.pieces, striker.x, striker.y, gx, gy, [t.k, STRIKER])) continue;
        const cdx = gx - striker.x;
        const cdy = gy - striker.y;
        const cd = Math.hypot(cdx, cdy);
        if (cd < 1) continue;
        const bdx = (px - t.x) / dd;
        const bdy = (py - t.y) / dd;
        const cut = (cdx / cd) * bdx + (cdy / cd) * bdy;
        if (cut < 0.12) continue;
        const dist = cd + dd;
        const score = cut * 2 - dist / 300 + (t.k === QUEEN ? 0.15 : 0);
        if (!best || score > best.score) {
          const power = Math.min(0.95, Math.max(0.34, 0.3 + dist / 360));
          best = { angle: Math.atan2(cdy, cdx), power, score };
        }
      }
    }

    if (best) {
      return { angle: best.angle + (Math.random() * 2 - 1) * noise, power: best.power };
    }

    const t = targets.reduce((a, b) =>
      Math.hypot(a.x - striker.x, a.y - striker.y) < Math.hypot(b.x - striker.x, b.y - striker.y) ? a : b,
    );
    return {
      angle: Math.atan2(t.y - striker.y, t.x - striker.x) + (Math.random() * 2 - 1) * noise,
      power: 0.38,
    };
  }

  private bestPlacement(board: CarromBoard, seat: number): [number, number] {
    // Sample the baseline and keep the position with the best available shot.
    const y = seat === 0 ? S - (BASE_LO + BASE_HI) / 2 : (BASE_LO + BASE_HI) / 2;
    let best: { x: number; score: number } | null = null;
    for (let x = BASE_X_MIN + 3; x <= BASE_X_MAX - 3; x += 6) {
      let blocked = false;
      for (const p of board.pieces) {
        if (p.potted || p.k === STRIKER) continue;
        if (Math.hypot(p.x - x, p.y - y) < R + STRIKER_R + 0.05) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const score = this.placementScore(board, seat, x, y);
      if (!best || score > best.score) best = { x, score };
    }
    if (best) return [best.x, y];

    // Fall back to any free baseline slot.
    for (let x = BASE_X_MIN; x <= BASE_X_MAX; x += 2) {
      let blocked = false;
      for (const p of board.pieces) {
        if (p.potted || p.k === STRIKER) continue;
        if (Math.hypot(p.x - x, p.y - y) < R + STRIKER_R + 0.05) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return [x, y];
    }
    return [50, y];
  }

  private placementScore(board: CarromBoard, seat: number, x: number, y: number): number {
    const targets = this.legalTargets(board, seat);
    let best = -Infinity;
    for (const t of targets) {
      for (const [px, py] of POCKETS) {
        if (!this.clearPath(board.pieces, t.x, t.y, px, py, [t.k])) continue;
        const ddx = t.x - px;
        const ddy = t.y - py;
        const dd = Math.hypot(ddx, ddy);
        if (dd < 1) continue;
        const gx = t.x + (ddx / dd) * (R + STRIKER_R);
        const gy = t.y + (ddy / dd) * (R + STRIKER_R);
        if (gx < STRIKER_R || gx > S - STRIKER_R || gy < STRIKER_R || gy > S - STRIKER_R) continue;
        if (!this.clearPath(board.pieces, x, y, gx, gy, [t.k, STRIKER])) continue;
        const cdx = gx - x;
        const cdy = gy - y;
        const cd = Math.hypot(cdx, cdy);
        if (cd < 1) continue;
        const bdx = (px - t.x) / dd;
        const bdy = (py - t.y) / dd;
        const cut = (cdx / cd) * bdx + (cdy / cd) * bdy;
        if (cut < 0.12) continue;
        const score = cut * 2 - (cd + dd) / 300 + (t.k === QUEEN ? 0.15 : 0);
        if (score > best) best = score;
      }
    }
    return best === -Infinity ? -1 : best;
  }

  private legalTargets(board: CarromBoard, seat: number): Piece[] {
    const own = board.pieces.filter((p) => !p.potted && isOwn(p.k, seat));
    if (own.length > 0) return own;
    return board.pieces.filter((p) => !p.potted && p.k !== STRIKER);
  }

  private clearPath(
    pieces: Piece[],
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    ignore: number[],
  ): boolean {
    for (const p of pieces) {
      if (p.potted || ignore.includes(p.k)) continue;
      if (this.segDist(p.x, p.y, x1, y1, x2, y2) < R + STRIKER_R * 0.6) return false;
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

  // ── shared helpers ────────────────────────────────────────────────────────

  private finish(state: GameState, winnerSeat: number | null): void {
    const board = state.board as unknown as CarromBoard;
    const potted = (s: number) => board.pieces.filter((p) => p.potted && isOwn(p.k, s)).length;
    const scores = state.scores.map((_, i) => {
      if (winnerSeat === null) return 0;
      const base = potted(i);
      const bonus = board.queenCoveredBy === i ? 3 : 0;
      return i === winnerSeat ? base + bonus + 1 : base;
    });
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
    const board = state.board as unknown as CarromBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        pieces: board.pieces.map((p) => ({ ...p })),
        strikerInHand: board.strikerInHand,
        queenPending: board.queenPending,
        queenCoveredBy: board.queenCoveredBy,
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
