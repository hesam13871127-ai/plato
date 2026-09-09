import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Hole {
  name: string;
  tee: [number, number];
  cup: [number, number];
  walls: Box[];
}

/** Nine holes on a 100 × 60 course, ball radius 2. */
export const MINIGOLF_HOLES: Hole[] = [
  { name: 'The Opener', tee: [12, 30], cup: [88, 30], walls: [] },
  { name: 'The Wall', tee: [10, 30], cup: [90, 30], walls: [{ x: 45, y: 18, w: 10, h: 24 }] },
  { name: 'Dogleg', tee: [10, 52], cup: [90, 10], walls: [{ x: 30, y: 0, w: 14, h: 40 }] },
  {
    name: 'Double Gate',
    tee: [10, 30],
    cup: [90, 30],
    walls: [
      { x: 45, y: 0, w: 8, h: 22 },
      { x: 45, y: 38, w: 8, h: 22 },
    ],
  },
  {
    name: 'The S',
    tee: [10, 30],
    cup: [90, 10],
    walls: [
      { x: 35, y: 0, w: 30, h: 14 },
      { x: 55, y: 46, w: 30, h: 14 },
    ],
  },
  { name: 'Pinball', tee: [12, 30], cup: [88, 30], walls: [{ x: 40, y: 20, w: 20, h: 20 }] },
  {
    name: 'Long Corner',
    tee: [12, 12],
    cup: [88, 48],
    walls: [
      { x: 50, y: 0, w: 14, h: 38 },
      { x: 50, y: 44, w: 14, h: 16 },
    ],
  },
  {
    name: 'The Island',
    tee: [10, 30],
    cup: [70, 30],
    walls: [
      { x: 63, y: 12, w: 14, h: 8 },
      { x: 63, y: 40, w: 14, h: 8 },
      { x: 60, y: 20, w: 5, h: 20 },
      { x: 78, y: 20, w: 5, h: 20 },
    ],
  },
  {
    name: 'The Gauntlet',
    tee: [8, 30],
    cup: [92, 30],
    walls: [
      { x: 28, y: 0, w: 8, h: 38 },
      { x: 28, y: 44, w: 8, h: 16 },
      { x: 55, y: 22, w: 8, h: 16 },
      { x: 75, y: 0, w: 8, h: 38 },
      { x: 75, y: 44, w: 8, h: 16 },
    ],
  },
];

const COURSE_W = 100;
const COURSE_H = 60;
const BALL_R = 2;
const CUP_R = 2.6;
const MAX_STROKES = 6;
const STROKE_CAP_PENALTY = 7;
const DT = 1 / 120;
const MAX_STEPS = 900;
const FRAME_STRIDE = 4;
const WALL_BOUNCE = 0.72;

interface GolfShot {
  seat: number;
  hole: number;
  angle: number;
  power: number;
  holed: boolean;
  frames: number[][];
}

interface MiniGolfBoard extends Record<string, unknown> {
  /** 0-based hole index. */
  hole: number;
  /** Seat playing the current hole. */
  activeSeat: number;
  /** Live ball position. */
  ball: { x: number; y: number };
  /** Strokes per seat per hole (7 = capped). */
  strokes: number[][];
  /** Strokes the active seat has used on this hole. */
  holeStrokes: number;
  lastShot: GolfShot | null;
  strokeCount: number;
}

function circleHitsBox(x: number, y: number, r: number, b: Box): boolean {
  const cx = Math.max(b.x, Math.min(x, b.x + b.w));
  const cy = Math.max(b.y, Math.min(y, b.y + b.h));
  return (x - cx) ** 2 + (y - cy) ** 2 < r * r;
}

/** True when the segment p0→p1 passes within r of the box. */
function segmentBlocked(p0: [number, number], p1: [number, number], r: number, b: Box): boolean {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return circleHitsBox(p0[0], p0[1], r, b);
  const steps = Math.max(2, Math.ceil(len));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (circleHitsBox(p0[0] + dx * t, p0[1] + dy * t, r, b)) return true;
  }
  return false;
}

/**
 * Arcade Mini-Golf for two to four players, wave-5 rebuild.
 *
 * Nine compact holes — walls, gates, an island green and a final gauntlet.
 * Each player plays a whole hole in hot-seat order: aim a direction, pick a
 * power, and the deterministic roll simulation carries the ball — friction
 * slows it, walls and blocks bounce it, and it drops in the cup when it
 * arrives slow enough. Six strokes is the cap (a seventh is charged). After
 * eighteen holes the fewest strokes wins; `lastShot.frames` replays the roll
 * on the 3D board. No hidden information.
 *
 * Bots pick the first clear line to the cup — straight, then banks — with
 * per-difficulty aim noise; easy golfers spray like a Sunday hacker.
 */
@Injectable()
export class MinigolfEngine extends BaseGameEngine {
  readonly slug = 'minigolf';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: MiniGolfBoard = {
      hole: 0,
      activeSeat: 0,
      ball: { x: MINIGOLF_HOLES[0].tee[0], y: MINIGOLF_HOLES[0].tee[1] },
      strokes: config.seats.map(() => []),
      holeStrokes: 0,
      lastShot: null,
      strokeCount: 0,
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
    if (action.type !== 'stroke') return { ok: false, error: 'Unknown action.' };
    const angle = Number(action.payload.angle);
    const power = Number(action.payload.power);
    if (!Number.isFinite(angle)) return { ok: false, error: 'Bad angle.' };
    if (!Number.isFinite(power) || power < 0.15 || power > 1) {
      return { ok: false, error: 'Power must be between 15% and 100%.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid stroke.');
    const next = this.clone(state);
    const board = next.board as unknown as MiniGolfBoard;
    const seat = action.seat;
    const angle = Number(action.payload.angle);
    const power = Number(action.payload.power);

    const sim = this.simulate(board, angle, power);
    board.ball = { x: sim.x, y: sim.y };
    board.holeStrokes += 1;
    board.strokeCount += 1;
    board.lastShot = { seat, hole: board.hole, angle, power, holed: sim.holed, frames: sim.frames };
    next.version += 1;

    // Marathon guard: a freak multi-hole stalemate cannot hang the table.
    if (board.strokeCount >= 600) {
      this.finish(next);
      return next;
    }

    const capped = board.holeStrokes >= MAX_STROKES;
    if (sim.holed || capped) {
      board.strokes[seat][board.hole] = sim.holed ? board.holeStrokes : STROKE_CAP_PENALTY;
      const totals = board.strokes.map((h) => h.reduce((a, b) => a + b, 0));
      next.scores = totals;
      this.advancePlayer(next, board, seat);
    }
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as MiniGolfBoard;
    const hole = MINIGOLF_HOLES[board.hole];
    const [bx, by] = [board.ball.x, board.ball.y];
    const dist = Math.hypot(hole.cup[0] - bx, hole.cup[1] - by);
    const direct = Math.atan2(hole.cup[1] - by, hole.cup[0] - bx);

    // Try the straight line first, then progressively wider banks.
    let angle = direct;
    const candidates = [direct];
    for (const off of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.5, -1.5, 2.2, -2.2]) {
      candidates.push(direct + off);
    }
    for (const cand of candidates) {
      const clear = !hole.walls.some((w) =>
        segmentBlocked([bx, by], [bx + Math.cos(cand) * dist, by + Math.sin(cand) * dist], BALL_R + 0.6, w),
      );
      if (clear) {
        angle = cand;
        break;
      }
    }

    const noise =
      difficulty === 'easy' ? 0.3 : difficulty === 'medium' ? 0.1 : difficulty === 'hard' ? 0.03 : 0.012;
    angle += (Math.random() - 0.5) * 2 * noise;
    const power = Math.min(1, Math.max(0.18, 0.3 + dist / 95 + (Math.random() - 0.5) * 0.08));
    return {
      action: { seat, type: 'stroke', payload: { angle: +angle.toFixed(4), power: +power.toFixed(3) } },
      delayMs: this.think(difficulty),
    };
  }

  // ── physics ───────────────────────────────────────────────────────────────

  private simulate(
    board: MiniGolfBoard,
    angle: number,
    power: number,
  ): { x: number; y: number; holed: boolean; frames: number[][] } {
    const hole = MINIGOLF_HOLES[board.hole];
    let x = board.ball.x;
    let y = board.ball.y;
    let vx = Math.cos(angle) * (40 + 160 * power);
    let vy = Math.sin(angle) * (40 + 160 * power);
    let holed = false;
    const frames: number[][] = [[+x.toFixed(2), +y.toFixed(2)]];

    for (let step = 1; step <= MAX_STEPS && !holed; step++) {
      x += vx * DT;
      y += vy * DT;

      // Cushions.
      if (x < BALL_R) {
        x = BALL_R;
        vx = -vx * WALL_BOUNCE;
      } else if (x > COURSE_W - BALL_R) {
        x = COURSE_W - BALL_R;
        vx = -vx * WALL_BOUNCE;
      }
      if (y < BALL_R) {
        y = BALL_R;
        vy = -vy * WALL_BOUNCE;
      } else if (y > COURSE_H - BALL_R) {
        y = COURSE_H - BALL_R;
        vy = -vy * WALL_BOUNCE;
      }

      // Blocks.
      for (const w of hole.walls) {
        if (!circleHitsBox(x, y, BALL_R, w)) continue;
        const cx = Math.max(w.x, Math.min(x, w.x + w.w));
        const cy = Math.max(w.y, Math.min(y, w.y + w.h));
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (d < 1e-6) continue; // deep overlap — let friction sort it out
        const nx = dx / d;
        const ny = dy / d;
        x = cx + nx * (BALL_R + 0.01);
        y = cy + ny * (BALL_R + 0.01);
        const dot = vx * nx + vy * ny;
        vx = (vx - 2 * dot * nx) * WALL_BOUNCE;
        vy = (vy - 2 * dot * ny) * WALL_BOUNCE;
      }

      // The cup: caught when it arrives slow, dead-centre always drops.
      const dc = Math.hypot(x - hole.cup[0], y - hole.cup[1]);
      const speed = Math.hypot(vx, vy);
      if (dc < 1.4 || (dc < CUP_R && speed < 80)) {
        holed = true;
        x = hole.cup[0];
        y = hole.cup[1];
        frames.push([+x.toFixed(2), +y.toFixed(2)]);
        break;
      }

      // Friction: grass drag plus rolling resistance.
      const drag = Math.pow(0.988, 1);
      vx *= drag;
      vy *= drag;
      const dec = 4 * DT;
      const sp = Math.hypot(vx, vy);
      if (sp <= dec + 2.5) {
        vx = 0;
        vy = 0;
        frames.push([+x.toFixed(2), +y.toFixed(2)]);
        break;
      }
      vx -= (vx / sp) * dec;
      vy -= (vy / sp) * dec;

      if (step % FRAME_STRIDE === 0) frames.push([+x.toFixed(2), +y.toFixed(2)]);
    }

    return { x, y, holed, frames };
  }

  private advancePlayer(next: GameState, board: MiniGolfBoard, seat: number): void {
    if (seat < next.seats.length - 1) {
      board.activeSeat = seat + 1;
      next.currentSeat = board.activeSeat;
      next.turn += 1;
    } else {
      // Everyone played the hole.
      if (board.hole >= MINIGOLF_HOLES.length - 1) {
        this.finish(next);
        return;
      }
      board.hole += 1;
      board.activeSeat = 0;
      next.currentSeat = 0;
      next.turn += 1;
    }
    board.holeStrokes = 0;
    const tee = MINIGOLF_HOLES[board.hole].tee;
    board.ball = { x: tee[0], y: tee[1] };
  }

  private finish(state: GameState): void {
    const board = state.board as unknown as MiniGolfBoard;
    const totals = board.strokes.map((h) => h.reduce((a, b) => a + b, 0));
    const min = Math.min(...totals);
    const leaders = totals.map((s, i) => ({ s, i })).filter((x) => x.s === min).map((x) => x.i);
    state.scores = totals;
    state.phase = 'completed';
    state.currentSeat = -1;
    if (leaders.length === 1) {
      state.winnerSeat = leaders[0];
      (state as unknown as { winnerSeats?: number[] }).winnerSeats = undefined;
    } else {
      state.winnerSeat = null;
      (state as unknown as { winnerSeats?: number[] }).winnerSeats = leaders;
    }
    state.seats = state.seats.map((s, i) => ({ ...s, score: totals[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1500 : difficulty === 'medium' ? 1200 : difficulty === 'hard' ? 950 : 800;
    return base + Math.floor(Math.random() * 700);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as MiniGolfBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        ball: { ...board.ball },
        strokes: board.strokes.map((h) => [...h]),
        lastShot: board.lastShot
          ? { ...board.lastShot, frames: board.lastShot.frames.map((f) => [...f]) }
          : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
