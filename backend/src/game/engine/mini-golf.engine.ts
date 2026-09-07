import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Bumper {
  x: number;
  y: number;
  r: number;
}

/** A hole layout in unit course coordinates: width 1, height 1.5, +y is down (toward the tee). */
interface HoleLayout {
  name: string;
  par: number;
  start: [number, number];
  cup: [number, number];
  walls: Rect[];
  sand: Rect[];
  bumpers: Bumper[];
}

interface GolfPlayer {
  x: number;
  y: number;
  strokes: number; // on the current hole
  holed: boolean;
  total: number;
  card: number[]; // strokes per completed hole
}

interface Shot {
  seat: number;
  path: Array<[number, number]>;
  holed: boolean;
  strokes: number;
  bumps: number; // wall/bumper hits (for sound)
  sand: boolean; // ended in sand
}

interface GolfBoard extends Record<string, unknown> {
  hole: number; // 0-based index
  holeCount: number;
  layout: HoleLayout;
  players: GolfPlayer[];
  lastShot: Shot | null;
  maxStrokes: number;
  pars: number[];
  log: string[];
}

const COURSE_W = 1;
const COURSE_H = 1.5;
const BALL_R = 0.018;
const CUP_R = 0.036;
const MAX_STROKES = 7;
const HOLE_COUNT = 9;

const HOLES: HoleLayout[] = [
  { name: 'Straight Shot', par: 2, start: [0.5, 1.35], cup: [0.5, 0.2], walls: [], sand: [], bumpers: [] },
  { name: 'The Wall', par: 3, start: [0.5, 1.35], cup: [0.5, 0.2], walls: [{ x: 0.3, y: 0.72, w: 0.4, h: 0.06 }], sand: [], bumpers: [] },
  { name: 'Dogleg', par: 3, start: [0.25, 1.35], cup: [0.25, 0.2], walls: [{ x: 0, y: 0.72, w: 0.66, h: 0.06 }], sand: [], bumpers: [] },
  { name: 'Sand Trap', par: 3, start: [0.5, 1.35], cup: [0.5, 0.2], walls: [], sand: [{ x: 0.18, y: 0.55, w: 0.64, h: 0.32 }], bumpers: [] },
  { name: 'Pinball', par: 3, start: [0.5, 1.35], cup: [0.5, 0.15], walls: [], sand: [], bumpers: [{ x: 0.3, y: 0.72, r: 0.06 }, { x: 0.7, y: 0.72, r: 0.06 }, { x: 0.5, y: 0.45, r: 0.06 }] },
  { name: 'Corridor', par: 3, start: [0.5, 1.35], cup: [0.5, 0.2], walls: [{ x: 0.33, y: 0.38, w: 0.05, h: 0.75 }, { x: 0.62, y: 0.38, w: 0.05, h: 0.75 }], sand: [], bumpers: [] },
  { name: 'Zigzag', par: 4, start: [0.15, 1.38], cup: [0.15, 0.18], walls: [{ x: 0, y: 1.0, w: 0.7, h: 0.05 }, { x: 0.3, y: 0.55, w: 0.7, h: 0.05 }], sand: [], bumpers: [] },
  { name: 'The Gauntlet', par: 4, start: [0.5, 1.38], cup: [0.5, 0.15], walls: [{ x: 0.12, y: 1.02, w: 0.28, h: 0.05 }, { x: 0.6, y: 1.02, w: 0.28, h: 0.05 }, { x: 0.12, y: 0.5, w: 0.28, h: 0.05 }, { x: 0.6, y: 0.5, w: 0.28, h: 0.05 }], sand: [], bumpers: [{ x: 0.5, y: 0.76, r: 0.05 }] },
  { name: 'Finale', par: 5, start: [0.15, 1.4], cup: [0.85, 0.15], walls: [{ x: 0, y: 0.92, w: 0.74, h: 0.05 }, { x: 0.26, y: 0.47, w: 0.74, h: 0.05 }], sand: [{ x: 0.58, y: 0.04, w: 0.36, h: 0.26 }], bumpers: [{ x: 0.5, y: 0.7, r: 0.05 }] },
];

/**
 * Mini Golf — nine themed holes for 2–4 players. Drag back from your ball to
 * set direction and power, release to putt. The server simulates the roll:
 * walls and bumpers bounce, sand slows you down, and the cup only takes a
 * ball that arrives slowly enough (rip it and you'll lip out). Players putt
 * in turn until everyone is in; a hole is capped at seven strokes. Lowest
 * total after nine holes wins — ties share the win.
 */
@Injectable()
export class MiniGolfEngine extends BaseGameEngine {
  readonly slug = 'mini_golf';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const layout = HOLES[0];
    const board: GolfBoard = {
      hole: 0,
      holeCount: HOLE_COUNT,
      layout,
      players: config.seats.map(() => ({ x: layout.start[0], y: layout.start[1], strokes: 0, holed: false, total: 0, card: [] })),
      lastShot: null,
      maxStrokes: MAX_STROKES,
      pars: HOLES.map((h) => h.par),
      log: [`Hole 1 — ${layout.name} (par ${layout.par}).`],
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
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    if (action.type !== 'putt') return { ok: false, error: 'Unknown action.' };
    const angle = Number(action.payload.angle);
    const power = Number(action.payload.power);
    if (!Number.isFinite(angle)) return { ok: false, error: 'Aim angle required.' };
    if (!Number.isFinite(power) || power < 0.05 || power > 1) return { ok: false, error: 'Power must be between 0.05 and 1.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid putt.');
    const next = this.clone(state);
    const board = next.board as unknown as GolfBoard;
    const seat = action.seat;
    const player = board.players[seat];
    const angle = Number(action.payload.angle);
    const power = Number(action.payload.power);

    const result = this.roll(board.layout, player.x, player.y, angle, power);
    player.x = result.x;
    player.y = result.y;
    player.strokes += 1;
    next.version += 1;

    const name = next.seats[seat].displayName;
    if (result.holed) {
      player.holed = true;
      board.log.unshift(`${name} holed out in ${player.strokes} (${this.relative(player.strokes, board.layout.par)}).`);
    } else if (player.strokes >= board.maxStrokes) {
      player.holed = true;
      board.log.unshift(`${name} picked up — max ${board.maxStrokes}.`);
    } else if (result.bumps > 0) {
      board.log.unshift(`${name} banked it off ${result.bumps} wall${result.bumps === 1 ? '' : 's'}.`);
    }
    board.log = board.log.slice(0, 6);
    board.lastShot = { seat, path: result.path, holed: result.holed, strokes: player.strokes, bumps: result.bumps, sand: result.sand };

    if (player.holed) {
      player.total += player.strokes;
      player.card.push(player.strokes);
    }

    // Everyone in? Advance hole.
    if (board.players.every((p) => p.holed)) {
      if (board.hole + 1 >= board.holeCount) {
        this.finish(next);
        return next;
      }
      board.hole += 1;
      board.layout = HOLES[board.hole];
      // Honours: lowest strokes on the previous hole tees off first.
      const order = board.players.map((p, i) => ({ i, s: p.card[p.card.length - 1] })).sort((a, b) => a.s - b.s || a.i - b.i);
      for (const p of board.players) {
        p.x = board.layout.start[0];
        p.y = board.layout.start[1];
        p.strokes = 0;
        p.holed = false;
      }
      board.log.unshift(`Hole ${board.hole + 1} — ${board.layout.name} (par ${board.layout.par}).`);
      board.log = board.log.slice(0, 6);
      next.currentSeat = order[0].i;
      next.turn += 1;
      next.turnStartedAt = new Date().toISOString();
      return next;
    }

    // Next player still on the hole.
    next.currentSeat = this.nextSeat(board, seat);
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  private nextSeat(board: GolfBoard, from: number): number {
    const n = board.players.length;
    for (let k = 1; k <= n; k++) {
      const s = (from + k) % n;
      if (!board.players[s].holed) return s;
    }
    return from;
  }

  private relative(strokes: number, par: number): string {
    const d = strokes - par;
    if (strokes === 1) return 'hole in one!';
    if (d <= -2) return 'eagle';
    if (d === -1) return 'birdie';
    if (d === 0) return 'par';
    if (d === 1) return 'bogey';
    if (d === 2) return 'double bogey';
    return `+${d}`;
  }

  private finish(state: GameState): void {
    const board = state.board as unknown as GolfBoard;
    state.phase = 'completed';
    state.currentSeat = -1;
    const best = Math.min(...board.players.map((p) => p.total));
    const winners = board.players.map((p, i) => (p.total === best ? i : -1)).filter((i) => i >= 0);
    state.winnerSeat = winners[0];
    state.winnerSeats = winners;
    const parTotal = board.pars.reduce((a, b) => a + b, 0);
    // Higher is better for leaderboards: strokes under a generous ceiling.
    state.scores = board.players.map((p) => Math.max(0, parTotal * 2 + 10 - p.total));
    state.seats.forEach((s, i) => (s.score = state.scores[i]));
  }

  // ── Physics ────────────────────────────────────────────────────────────────

  private roll(layout: HoleLayout, sx: number, sy: number, angle: number, power: number): { x: number; y: number; holed: boolean; path: Array<[number, number]>; bumps: number; sand: boolean } {
    let x = sx;
    let y = sy;
    const speed0 = 0.012 + power * 0.03;
    let vx = Math.cos(angle) * speed0;
    let vy = Math.sin(angle) * speed0;
    const path: Array<[number, number]> = [[+x.toFixed(3), +y.toFixed(3)]];
    let holed = false;
    let bumps = 0;
    let inSand = false;
    const cupX = layout.cup[0];
    const cupY = layout.cup[1];

    for (let step = 0; step < 1400; step++) {
      x += vx;
      y += vy;
      inSand = layout.sand.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      const friction = inSand ? 0.9 : 0.982;
      vx *= friction;
      vy *= friction;

      // Course bounds.
      if (x < BALL_R) { x = BALL_R; vx = -vx * 0.8; bumps++; }
      if (x > COURSE_W - BALL_R) { x = COURSE_W - BALL_R; vx = -vx * 0.8; bumps++; }
      if (y < BALL_R) { y = BALL_R; vy = -vy * 0.8; bumps++; }
      if (y > COURSE_H - BALL_R) { y = COURSE_H - BALL_R; vy = -vy * 0.8; bumps++; }

      // Walls (AABB, expanded by the ball radius).
      for (const w of layout.walls) {
        const left = w.x - BALL_R;
        const right = w.x + w.w + BALL_R;
        const top = w.y - BALL_R;
        const bottom = w.y + w.h + BALL_R;
        if (x > left && x < right && y > top && y < bottom) {
          const dl = x - left;
          const dr = right - x;
          const dt = y - top;
          const db = bottom - y;
          const m = Math.min(dl, dr, dt, db);
          if (m === dl) { x = left; vx = -Math.abs(vx) * 0.8; }
          else if (m === dr) { x = right; vx = Math.abs(vx) * 0.8; }
          else if (m === dt) { y = top; vy = -Math.abs(vy) * 0.8; }
          else { y = bottom; vy = Math.abs(vy) * 0.8; }
          bumps++;
        }
      }

      // Bumpers (round, springy).
      for (const b of layout.bumpers) {
        const dx = x - b.x;
        const dy = y - b.y;
        const d = Math.hypot(dx, dy);
        const minD = b.r + BALL_R;
        if (d < minD && d > 0) {
          const nx = dx / d;
          const ny = dy / d;
          const dot = vx * nx + vy * ny;
          if (dot < 0) {
            vx -= 2 * dot * nx;
            vy -= 2 * dot * ny;
            const sp = Math.hypot(vx, vy);
            const boosted = Math.max(sp, 0.012) * 1.08;
            vx = (vx / (sp || 1)) * boosted;
            vy = (vy / (sp || 1)) * boosted;
          }
          x = b.x + nx * minD;
          y = b.y + ny * minD;
          bumps++;
        }
      }

      // Cup.
      const dc = Math.hypot(x - cupX, y - cupY);
      const sp = Math.hypot(vx, vy);
      if (dc < CUP_R) {
        if (sp < 0.021) {
          holed = true;
          x = cupX;
          y = cupY;
          path.push([+x.toFixed(3), +y.toFixed(3)]);
          break;
        }
        // Lip out: the rim kicks the ball sideways and bleeds speed.
        const nx = (x - cupX) / (dc || 1);
        const ny = (y - cupY) / (dc || 1);
        vx = vx * 0.55 + nx * sp * 0.35;
        vy = vy * 0.55 + ny * sp * 0.35;
      }

      if (step % 3 === 0) path.push([+x.toFixed(3), +y.toFixed(3)]);
      if (sp < 0.0007) break;
    }
    path.push([+x.toFixed(3), +y.toFixed(3)]);
    return { x: +x.toFixed(4), y: +y.toFixed(4), holed, path: path.slice(-320), bumps, sand: inSand };
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as GolfBoard;
    const p = board.players[seat];
    const layout = board.layout;
    // Search a fan of angles and powers; keep the shot that ends closest to the cup.
    let best: { angle: number; power: number; score: number } | null = null;
    const direct = Math.atan2(layout.cup[1] - p.y, layout.cup[0] - p.x);
    // Bots "read" the green like a person would: a handful of candidate lines
    // with a few club strengths, then a wobbly execution. Stronger bots read
    // more lines and wobble less — but nobody is a robot.
    const samples = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 10 : difficulty === 'hard' ? 16 : 22;
    const powers = difficulty === 'easy' ? [0.3, 0.55, 0.85] : [0.2, 0.4, 0.6, 0.8, 1];
    for (let i = 0; i < samples; i++) {
      const a = direct + ((i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * Math.PI * 2) / samples;
      for (const pw of powers) {
        const r = this.roll(layout, p.x, p.y, a, pw);
        const score = r.holed ? -1 : Math.hypot(r.x - layout.cup[0], r.y - layout.cup[1]) + (r.sand ? 0.15 : 0);
        if (!best || score < best.score) best = { angle: a, power: pw, score };
      }
    }
    const err = difficulty === 'easy' ? 0.14 : difficulty === 'medium' ? 0.09 : difficulty === 'hard' ? 0.055 : 0.035;
    const angle = (best?.angle ?? direct) + (Math.random() - 0.5) * 2 * err;
    const power = Math.min(1, Math.max(0.05, (best?.power ?? 0.5) + (Math.random() - 0.5) * 2 * err));
    const delay = difficulty === 'easy' ? 1700 : 1300;
    return { action: { seat, type: 'putt', payload: { angle: +angle.toFixed(4), power: +power.toFixed(3) } }, delayMs: delay + Math.floor(Math.random() * 600) };
  }

  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as GolfBoard;
    return {
      ...state,
      board: {
        hole: board.hole,
        holeCount: board.holeCount,
        layout: board.layout,
        players: board.players,
        lastShot: board.lastShot,
        maxStrokes: board.maxStrokes,
        pars: board.pars,
        log: board.log,
        course: { width: COURSE_W, height: COURSE_H, ballR: BALL_R, cupR: CUP_R },
      },
    };
  }

  private clone(state: GameState): GameState {
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: JSON.parse(JSON.stringify(state.board)) as Record<string, unknown>,
    };
  }
}
