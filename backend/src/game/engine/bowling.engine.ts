import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Pin {
  x: number;
  y: number;
  down: boolean;
}

interface SimItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pin: boolean; // false = ball
  idx: number; // pin index, -1 for the ball
}

interface BowlingBoard extends Record<string, unknown> {
  /** Ten pins; `down` pins are out of play. Positions are the standing spots. */
  pins: Pin[];
  /** 1..10 — the frame both players are currently on. */
  frameNumber: number;
  /** Rolls the current seat has thrown in this frame (0/1, up to 3 in the 10th). */
  rollsThisFrame: number;
  /** Flat roll values per seat, in order. */
  frames: number[][];
  /** Where each seat's 10th frame begins in their roll list. */
  tenthStart: [number, number];
  lastShot: {
    seat: number;
    angle: number;
    power: number;
    knocked: number;
    gutter: boolean;
    /** Replay keyframes every FRAME_STRIDE sim steps: [ballX, ballY, pinX, pinY…]. */
    frames: number[][];
  } | null;
  throwCount: number;
}

// ── lane geometry & physics (all deterministic) ────────────────────────────
const LANE_L = 180;
const LANE_W = 40;
const CY = LANE_W / 2;
const RB = 3.2; // ball radius
const RP = 2.0; // pin radius
const BALL_M = 5;
const PIN_M = 1.5;
const GUTTER_Y = CY - RB - 0.6; // |y - CY| beyond this = gutter
const HEAD_X = 158;
const START: [number, number] = [8, CY];
const DT = 1 / 120;
const DAMP_B = 0.998; // ball rolls a long way
const DAMP_P = 0.985; // pins shed speed fast
const STOP = 0.6;
const E = 0.62; // restitution
const MAX_STEPS = 3000;
const FRAME_STRIDE = 6;
const MAX_THROWS = 200;
const KNOCK_SLIP = 3.0; // displacement that counts as knocked down

/** Standard 10-pin scoring. `perFrame` holds cumulative totals, -1 = pending. */
export function scoreBowling(rolls: number[]): { perFrame: number[]; total: number } {
  const perFrame: number[] = [];
  let total = 0;
  let i = 0;
  for (let f = 0; f < 10; f++) {
    if (i >= rolls.length) {
      perFrame.push(-1);
      continue;
    }
    const r1 = rolls[i];
    if (r1 === 10) {
      if (i + 2 < rolls.length) {
        total += 10 + rolls[i + 1] + rolls[i + 2];
        perFrame.push(total);
      } else {
        perFrame.push(-1);
      }
      i += 1;
    } else if (i + 1 < rolls.length) {
      const r2 = rolls[i + 1];
      if (r1 + r2 === 10) {
        if (i + 2 < rolls.length) {
          total += 10 + rolls[i + 2];
          perFrame.push(total);
        } else {
          perFrame.push(-1);
        }
      } else {
        total += r1 + r2;
        perFrame.push(total);
      }
      i += 2;
    } else {
      perFrame.push(-1);
      i += 2;
    }
  }
  return { perFrame, total };
}

const freshRack = (): Pin[] => {
  const pins: Pin[] = [];
  const dx = RP * 2 * 1.12;
  const dy = RP * 1.35;
  for (let row = 0; row < 4; row++) {
    for (let j = 0; j <= row; j++) {
      pins.push({ x: HEAD_X + row * dx, y: CY + (j - row / 2) * 2 * dy, down: false });
    }
  }
  return pins;
};

/**
 * Arcade Ten-Pin Bowling for two players, wave-3 rebuild.
 *
 * The engine owns a deterministic lane simulation: the bowler picks an angle
 * and power, the heavy ball rolls down the lane, clips gutter or scatters the
 * light pins with elastic impulses, and any pin shoved off its spot is down.
 * Each player bowls their own frames (fresh rack each frame, deadwood cleared
 * between rolls); strikes and spares score with the standard bonuses and the
 * 10th frame awards its extra rolls. After twenty frames the higher total
 * wins. `lastShot.frames` replays the throw on the 3D board. No hidden
 * information.
 *
 * Bots aim for the pocket beside the head pin with per-difficulty noise —
 * easy bots occasionally heave one into the gutter.
 */
@Injectable()
export class BowlingEngine extends BaseGameEngine {
  readonly slug = 'bowling';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const board: BowlingBoard = {
      pins: freshRack(),
      frameNumber: 1,
      rollsThisFrame: 0,
      frames: config.seats.map(() => []),
      tenthStart: [0, 0],
      lastShot: null,
      throwCount: 0,
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
    if (action.type !== 'throw') return { ok: false, error: 'Unknown action.' };
    const angle = Number(action.payload.angle);
    const power = Number(action.payload.power);
    if (!Number.isFinite(angle) || Math.abs(angle) > 0.45) {
      return { ok: false, error: 'Aim along the lane.' };
    }
    if (!Number.isFinite(power) || power < 0.15 || power > 1) {
      return { ok: false, error: 'Power must be between 15% and 100%.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid throw.');
    const next = this.clone(state);
    const board = next.board as unknown as BowlingBoard;
    const seat = action.seat;
    const angle = Number(action.payload.angle);
    const power = Number(action.payload.power);

    const sim = this.simulate(board, angle, power);
    board.lastShot = {
      seat,
      angle,
      power,
      knocked: sim.knocked,
      gutter: sim.gutter,
      frames: sim.frames,
    };
    board.throwCount += 1;
    board.frames[seat].push(sim.knocked);
    board.rollsThisFrame += 1;
    next.version += 1;

    // Progress guard for freak marathon games.
    if (board.throwCount >= MAX_THROWS) {
      this.finish(next);
      return next;
    }

    const standing = board.pins.filter((p) => !p.down).length;
    const rolls = board.frames[seat];
    const tenth = board.frameNumber === 10;

    if (!tenth) {
      if (board.rollsThisFrame === 1 && standing > 0) {
        next.turnStartedAt = new Date().toISOString(); // second ball
        return next;
      }
      this.advanceFrame(next, seat);
      return next;
    }

    // 10th frame: strikes and spares earn fresh racks and extra rolls.
    const r1 = rolls[board.tenthStart[seat]] ?? 0;
    if (board.rollsThisFrame === 1) {
      if (r1 === 10) board.pins = freshRack();
      next.turnStartedAt = new Date().toISOString();
      return next;
    }
    if (board.rollsThisFrame === 2) {
      const r2 = rolls[board.tenthStart[seat] + 1] ?? 0;
      if (r1 === 10) {
        if (r2 === 10) board.pins = freshRack();
        next.turnStartedAt = new Date().toISOString();
        return next; // third ball either way after an opening strike
      }
      if (r1 + r2 === 10) {
        board.pins = freshRack();
        next.turnStartedAt = new Date().toISOString();
        return next; // spare → bonus ball
      }
      this.advanceFrame(next, seat);
      return next;
    }
    this.advanceFrame(next, seat); // third ball thrown — frame over
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const wild =
      difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.12 : difficulty === 'hard' ? 0.04 : 0.0;
    let angle: number;
    if (Math.random() < wild) {
      angle = (Math.random() - 0.5) * 0.7;
    } else {
      // Aim for the pocket just beside the head pin.
      const side = Math.random() < 0.5 ? -1 : 1;
      const targetY = CY + side * (RP + 0.35);
      angle = Math.atan2(targetY - START[1], HEAD_X - START[0]);
      const noise =
        difficulty === 'easy' ? 0.05 : difficulty === 'medium' ? 0.02 : difficulty === 'hard' ? 0.008 : 0.004;
      angle += (Math.random() - 0.5) * 2 * noise;
    }
    const power = 0.82 + Math.random() * 0.16;
    return {
      action: { seat, type: 'throw', payload: { angle, power } },
      delayMs: this.think(difficulty),
    };
  }

  // ── physics ───────────────────────────────────────────────────────────────

  private simulate(
    board: BowlingBoard,
    angle: number,
    power: number,
  ): { frames: number[][]; knocked: number; gutter: boolean } {
    const sim: SimItem[] = [{ x: START[0], y: START[1], vx: 0, vy: 0, pin: false, idx: -1 }];
    const start: Array<{ x: number; y: number }> = [{ x: START[0], y: START[1] }];
    board.pins.forEach((p, i) => {
      if (!p.down) {
        sim.push({ x: p.x, y: p.y, vx: 0, vy: 0, pin: true, idx: i });
        start.push({ x: p.x, y: p.y });
      }
    });
    const ball = sim[0];
    const speed = 60 + 200 * power;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;

    const frames: number[][] = [this.flatten(sim)];
    let gutter = false;

    for (let step = 1; step <= MAX_STEPS; step++) {
      for (const it of sim) {
        it.x += it.vx * DT;
        it.y += it.vy * DT;
      }

      // Ball reaches the gutter channel before the deck → the roll is lost.
      if (!gutter && ball.x < HEAD_X - 14 && Math.abs(ball.y - CY) > GUTTER_Y) {
        gutter = true;
        ball.y = ball.y > CY ? LANE_W - RB / 2 : RB / 2;
        ball.vy = 0;
      }

      if (!gutter) {
        // Ball-pin and pin-pin collisions (elastic impulse, unequal masses).
        for (let i = 0; i < sim.length; i++) {
          const a = sim[i];
          for (let j = i + 1; j < sim.length; j++) {
            const b = sim[j];
            const ra = a.pin ? RP : RB;
            const rb = b.pin ? RP : RB;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d2 = dx * dx + dy * dy;
            const min = ra + rb;
            if (d2 === 0 || d2 >= min * min) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d;
            const ny = dy / d;
            const overlap = min - d;
            const ma = a.pin ? PIN_M : BALL_M;
            const mb = b.pin ? PIN_M : BALL_M;
            a.x -= (nx * overlap * mb) / (ma + mb);
            a.y -= (ny * overlap * mb) / (ma + mb);
            b.x += (nx * overlap * ma) / (ma + mb);
            b.y += (ny * overlap * ma) / (ma + mb);
            const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rel < 0) {
              const imp = (-(1 + E) * rel) / (1 / ma + 1 / mb);
              a.vx -= (imp * nx) / ma;
              a.vy -= (imp * ny) / ma;
              b.vx += (imp * nx) / mb;
              b.vy += (imp * ny) / mb;
            }
          }
        }
      }

      // Past the gutters the ball rattles between the kickbacks.
      if (!gutter && ball.x >= HEAD_X - 14) {
        if (ball.y < RB) {
          ball.y = RB;
          ball.vy = Math.abs(ball.vy) * 0.5;
        } else if (ball.y > LANE_W - RB) {
          ball.y = LANE_W - RB;
          ball.vy = -Math.abs(ball.vy) * 0.5;
        }
      }

      // Lane walls for pins (they clatter around the deck).
      for (const it of sim) {
        if (!it.pin) continue;
        if (it.y < RP) {
          it.y = RP;
          it.vy = Math.abs(it.vy) * 0.5;
        } else if (it.y > LANE_W - RP) {
          it.y = LANE_W - RP;
          it.vy = -Math.abs(it.vy) * 0.5;
        }
        if (it.x < RP) {
          it.x = RP;
          it.vx = Math.abs(it.vx) * 0.5;
        } else if (it.x > LANE_L + 6) {
          it.x = LANE_L + 6;
          it.vx = -Math.abs(it.vx) * 0.5;
        }
      }

      // Friction & settle check.
      let moving = false;
      for (const it of sim) {
        const damp = it.pin ? DAMP_P : DAMP_B;
        it.vx *= damp;
        it.vy *= damp;
        if (Math.hypot(it.vx, it.vy) < STOP) {
          it.vx = 0;
          it.vy = 0;
        } else {
          moving = true;
        }
      }
      if (ball.x > LANE_L + 10) {
        ball.vx = 0;
        ball.vy = 0;
      }

      if (step % FRAME_STRIDE === 0) frames.push(this.flatten(sim));
      if (!moving) break;
    }
    frames.push(this.flatten(sim));

    // Knocked: any standing pin displaced from its spot.
    let knocked = 0;
    sim.forEach((it, i) => {
      if (!it.pin) return;
      const s = start[i];
      if (Math.hypot(it.x - s.x, it.y - s.y) > KNOCK_SLIP) {
        board.pins[it.idx].down = true;
        knocked += 1;
      } else {
        board.pins[it.idx].x = it.x;
        board.pins[it.idx].y = it.y; // standing pins stay where they stand
      }
    });
    return { frames, knocked, gutter };
  }

  private flatten(sim: SimItem[]): number[] {
    const out: number[] = [];
    for (const it of sim) out.push(it.x, it.y);
    return out;
  }

  // ── frame flow ────────────────────────────────────────────────────────────

  private advanceFrame(next: GameState, seat: number): void {
    const board = next.board as unknown as BowlingBoard;
    if (board.frameNumber < 10 && seat === 0) {
      // Hand the same frame to the other player.
      next.currentSeat = 1;
      board.rollsThisFrame = 0;
      board.pins = freshRack();
    } else if (board.frameNumber < 10) {
      next.currentSeat = 0;
      board.frameNumber += 1;
      board.rollsThisFrame = 0;
      board.pins = freshRack();
      if (board.frameNumber === 10) board.tenthStart = [board.frames[0].length, 0];
    } else if (seat === 0) {
      next.currentSeat = 1;
      board.rollsThisFrame = 0;
      board.pins = freshRack();
      board.tenthStart[1] = board.frames[1].length;
    } else {
      this.finish(next);
      return;
    }
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
  }

  private finish(state: GameState): void {
    const board = state.board as unknown as BowlingBoard;
    const totals = board.frames.map((rolls) => scoreBowling(rolls).total);
    const a = totals[0] ?? 0;
    const b = totals[1] ?? 0;
    const winner = a > b ? 0 : b > a ? 1 : null;
    state.phase = 'completed';
    state.winnerSeat = winner;
    state.currentSeat = -1;
    state.scores = [a, b];
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  // ── shared helpers ────────────────────────────────────────────────────────

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1400 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 750 : 500;
    return base + extra + Math.floor(Math.random() * 800);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as BowlingBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        pins: board.pins.map((p) => ({ ...p })),
        frames: board.frames.map((f) => [...f]),
        tenthStart: [...board.tenthStart] as [number, number],
        lastShot: board.lastShot
          ? { ...board.lastShot, frames: board.lastShot.frames.map((f) => [...f]) }
          : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
