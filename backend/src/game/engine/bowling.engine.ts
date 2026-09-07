import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface BowlFrame {
  rolls: number[];
  /** Cumulative score once it can be determined, else null. */
  score: number | null;
}

interface BowlPlayer {
  frames: BowlFrame[];
  /** 0-based index of the frame being bowled (== frames.length when done). */
  frame: number;
  /** Ball number inside the frame (1..3). */
  ball: number;
  /** Standing pins for the current frame (index 1..10). */
  standing: boolean[];
  total: number;
  strikes: number;
  spares: number;
  done: boolean;
}

interface BowlRoll {
  seat: number;
  frame: number;
  ball: number;
  x: number;
  curve: number;
  power: number;
  /** Lateral position where the ball met the pin deck (-1..1; |x|>1 = gutter). */
  arrival: number;
  knocked: number[];
  count: number;
  strike: boolean;
  spare: boolean;
  gutter: boolean;
  /** Pins still standing after this ball. */
  standing: number[];
}

interface BowlBoard extends Record<string, unknown> {
  frameCount: number;
  players: BowlPlayer[];
  lastRoll: BowlRoll | null;
  /** Standing pins for the seat to move (mirrors players[current].standing as a list). */
  pins: number[];
}

/** Pin deck geometry: unit = pin spacing. Lane half-width in these units. */
const PIN_X: Record<number, number> = { 1: 0, 2: -0.5, 3: 0.5, 4: -1, 5: 0, 6: 1, 7: -1.5, 8: -0.5, 9: 0.5, 10: 1.5 };
const PIN_ROWS = [[1], [2, 3], [4, 5, 6], [7, 8, 9, 10]];
const LANE_HALF = 1.75;
const BALL_R = 0.36;
const PIN_R = 0.2;
const FRAMES = 5;

/**
 * Bowling for 2–4 players over five frames (the last frame grants bonus balls
 * after a strike or spare, exactly like the real thing). Each player bowls a
 * whole frame before passing the lane. Clients position the ball, then swipe
 * to release; power and side-spin bend the ball into the pins. The server
 * resolves the pin action with a lightweight deck model (ball collisions plus
 * pin-on-pin chain reactions), so the pocket rewards accuracy and a dead-on
 * centre hit can leave a split. Bots aim for the pocket, or the centroid of
 * the standing pins on spare attempts, with difficulty-scaled scatter.
 */
@Injectable()
export class BowlingEngine extends BaseGameEngine {
  readonly slug = 'bowling';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const frameCount = Number((config.settings as { frames?: number } | undefined)?.frames) || FRAMES;
    const board: BowlBoard = {
      frameCount,
      players: config.seats.map(() => this.newPlayer()),
      lastRoll: null,
      pins: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
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

  private newPlayer(): BowlPlayer {
    return { frames: [], frame: 0, ball: 1, standing: this.fullRack(), total: 0, strikes: 0, spares: 0, done: false };
  }

  private fullRack(): boolean[] {
    const s = Array<boolean>(11).fill(true);
    s[0] = false;
    return s;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    if (action.type !== 'bowl') return { ok: false, error: 'Unknown action.' };
    const x = Number(action.payload.x);
    const curve = Number(action.payload.curve ?? 0);
    const power = Number(action.payload.power ?? 0.8);
    if (!Number.isFinite(x) || Math.abs(x) > 1) return { ok: false, error: 'Release position must be between -1 and 1.' };
    if (!Number.isFinite(curve) || Math.abs(curve) > 1) return { ok: false, error: 'Curve must be between -1 and 1.' };
    if (!Number.isFinite(power) || power < 0.3 || power > 1) return { ok: false, error: 'Power must be between 0.3 and 1.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid roll.');
    const next = this.clone(state);
    const board = next.board as unknown as BowlBoard;
    const seat = action.seat;
    const player = board.players[seat];
    const x = Number(action.payload.x);
    const curve = Number(action.payload.curve ?? 0);
    const power = Number(action.payload.power ?? 0.8);

    const { arrival, knocked } = this.rollBall(player.standing, x, curve, power);
    for (const pin of knocked) player.standing[pin] = false;
    const count = knocked.length;
    const frameIndex = player.frame;
    const isLast = frameIndex === board.frameCount - 1;
    if (!player.frames[frameIndex]) player.frames[frameIndex] = { rolls: [], score: null };
    const frame = player.frames[frameIndex];
    frame.rolls.push(count);

    const standingCount = player.standing.filter(Boolean).length;
    const strike = player.ball === 1 && count === 10 || (isLast && player.ball > 1 && count === 10 && this.rackWasFull(frame, player.ball));
    const spare = !strike && standingCount === 0 && (player.ball === 2 || (isLast && player.ball === 3 && !this.rackWasFull(frame, 3)));
    if (strike) player.strikes += 1;
    if (spare) player.spares += 1;

    board.lastRoll = {
      seat,
      frame: frameIndex,
      ball: player.ball,
      x: +x.toFixed(3),
      curve: +curve.toFixed(3),
      power: +power.toFixed(3),
      arrival: +arrival.toFixed(3),
      knocked,
      count,
      strike,
      spare,
      gutter: count === 0 && Math.abs(arrival) > LANE_HALF - BALL_R * 0.5,
      standing: this.standingList(player.standing),
    };
    next.version += 1;

    // Frame flow.
    let frameOver = false;
    if (!isLast) {
      if (standingCount === 0 || player.ball === 2) frameOver = true;
      else player.ball = 2;
    } else {
      // Last frame: a strike or spare earns bonus balls, up to three in total.
      if (player.ball === 1) {
        if (standingCount === 0) player.standing = this.fullRack();
        player.ball = 2;
      } else if (player.ball === 2) {
        const bonusEarned = frame.rolls[0] === 10 || frame.rolls[0] + frame.rolls[1] === 10;
        if (bonusEarned) {
          if (standingCount === 0) player.standing = this.fullRack();
          player.ball = 3;
        } else {
          frameOver = true;
        }
      } else {
        frameOver = true;
      }
    }

    this.rescore(board, player);
    if (frameOver) {
      player.frame += 1;
      player.ball = 1;
      player.standing = this.fullRack();
      if (player.frame >= board.frameCount) player.done = true;
      this.advance(next, seat);
    } else {
      board.pins = this.standingList(player.standing);
    }
    next.scores = board.players.map((p) => p.total);
    next.seats.forEach((s, i) => (s.score = next.scores[i]));
    return next;
  }

  private rackWasFull(frame: BowlFrame, ball: number): boolean {
    // In the last frame the rack is reset after a strike (ball 1) or a spare/strike (ball 2).
    if (ball === 2) return frame.rolls[0] === 10;
    if (ball === 3) return frame.rolls[1] === 10 || frame.rolls[0] + frame.rolls[1] === 10;
    return true;
  }

  private advance(state: GameState, from: number): void {
    const board = state.board as unknown as BowlBoard;
    const n = state.seats.length;
    for (let i = 1; i <= n; i++) {
      const seat = (from + i) % n;
      if (!board.players[seat].done) {
        state.currentSeat = seat;
        state.turn += 1;
        state.turnStartedAt = new Date().toISOString();
        board.pins = this.standingList(board.players[seat].standing);
        return;
      }
    }
    // Everyone has finished.
    state.phase = 'completed';
    state.currentSeat = -1;
    board.pins = [];
    const totals = board.players.map((p) => p.total);
    const max = Math.max(...totals);
    const leaders = totals.map((t, i) => (t === max ? i : -1)).filter((i) => i >= 0);
    state.winnerSeat = leaders.length === 1 ? leaders[0] : null;
    state.winnerSeats = leaders;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as BowlBoard;
    const player = board.players[seat];
    const standing = this.standingList(player.standing);
    let target: number;
    if (standing.length === 10) {
      target = Math.random() < 0.5 ? 0.3 : -0.3; // the pocket, either side
    } else {
      const xs = standing.map((p) => PIN_X[p]);
      const left = xs.filter((v) => v < 0);
      const right = xs.filter((v) => v > 0);
      const spread = Math.max(...xs) - Math.min(...xs);
      if (spread > 1.6 && left.length && right.length) {
        // A split: take the bigger side.
        const side = left.length >= right.length ? left : right;
        target = side.reduce((a, b) => a + b, 0) / side.length / LANE_HALF;
      } else {
        target = xs.reduce((a, b) => a + b, 0) / xs.length / LANE_HALF;
      }
    }
    const sigma = difficulty === 'easy' ? 0.22 : difficulty === 'medium' ? 0.14 : difficulty === 'hard' ? 0.09 : 0.06;
    const curve = +(Math.random() * 0.8 - 0.4).toFixed(3);
    const arrival = target + this.gauss() * sigma;
    const x = Math.max(-1, Math.min(1, arrival - curve * 0.7));
    const power = +(0.75 + Math.random() * 0.25).toFixed(3);
    const delay = difficulty === 'easy' ? 1800 : 1400;
    return { action: { seat, type: 'bowl', payload: { x: +x.toFixed(3), curve, power } }, delayMs: delay + Math.floor(Math.random() * 700) };
  }

  // ── Pin physics ───────────────────────────────────────────────────────────

  /**
   * Resolves one ball. `x` is the release position and `curve` bends the
   * ball across the lane on its way down; the ball then ploughs through the
   * four pin rows, deflecting slightly on each contact and losing energy,
   * while every felled pin gets a chance to take out the pins behind it.
   */
  private rollBall(standing: boolean[], x: number, curve: number, power: number): { arrival: number; knocked: number[] } {
    const arrival = x * LANE_HALF + curve * 0.7 * LANE_HALF * (1.15 - power * 0.3);
    const knocked = new Set<number>();
    if (Math.abs(arrival) > LANE_HALF + BALL_R * 0.4) return { arrival: arrival / LANE_HALF, knocked: [] };

    let bx = arrival;
    let energy = 0.55 + power * 0.6;
    type Flying = { fromX: number; dir: number; energy: number; rowsLeft: number };
    let flying: Flying[] = [];

    for (let row = 0; row < PIN_ROWS.length; row++) {
      const nextFlying: Flying[] = [];
      // Pins already in flight strike this row.
      for (const f of flying) {
        for (const pin of PIN_ROWS[row]) {
          if (!standing[pin] || knocked.has(pin)) continue;
          const d = PIN_X[pin] - f.fromX;
          const p = f.energy * Math.max(0, 1 - Math.abs(d - f.dir) / 1.15);
          if (Math.random() < p) {
            knocked.add(pin);
            nextFlying.push({ fromX: PIN_X[pin], dir: d === 0 ? f.dir : Math.sign(d) * 0.6 + f.dir * 0.4, energy: f.energy * 0.72, rowsLeft: 2 });
          }
        }
        if (f.rowsLeft > 1) nextFlying.push({ ...f, rowsLeft: f.rowsLeft - 1, energy: f.energy * 0.6 });
      }
      // The ball itself.
      for (const pin of PIN_ROWS[row]) {
        if (!standing[pin] || knocked.has(pin)) continue;
        const dx = bx - PIN_X[pin];
        if (Math.abs(dx) < BALL_R + PIN_R && energy > 0.08) {
          knocked.add(pin);
          const dir = dx === 0 ? (Math.random() < 0.5 ? -0.5 : 0.5) : -Math.sign(dx) * (0.35 + Math.min(0.55, Math.abs(dx)));
          nextFlying.push({ fromX: PIN_X[pin], dir, energy: energy * 0.95, rowsLeft: 2 });
          bx += dx * 0.3;
          energy *= 0.8;
        }
      }
      flying = nextFlying;
    }
    return { arrival: arrival / LANE_HALF, knocked: [...knocked].sort((a, b) => a - b) };
  }

  private standingList(standing: boolean[]): number[] {
    const out: number[] = [];
    for (let i = 1; i <= 10; i++) if (standing[i]) out.push(i);
    return out;
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  private rescore(board: BowlBoard, player: BowlPlayer): void {
    for (let i = 0; i < player.frames.length; i++) if (!player.frames[i]) player.frames[i] = { rolls: [0, 0], score: null };
    const rolls: number[] = [];
    for (const f of player.frames) rolls.push(...f.rolls);
    let cursor = 0;
    let total = 0;
    for (let i = 0; i < player.frames.length; i++) {
      const frame = player.frames[i];
      const isLast = i === board.frameCount - 1;
      let frameScore: number | null = null;
      if (isLast) {
        const complete = frame.rolls.length === 3 || (frame.rolls.length === 2 && frame.rolls[0] + frame.rolls[1] < 10);
        if (complete) frameScore = frame.rolls.reduce((a, b) => a + b, 0);
        cursor += frame.rolls.length;
      } else if (frame.rolls[0] === 10) {
        if (rolls.length >= cursor + 3) frameScore = 10 + rolls[cursor + 1] + rolls[cursor + 2];
        cursor += 1;
      } else if (frame.rolls.length === 2 && frame.rolls[0] + frame.rolls[1] === 10) {
        if (rolls.length >= cursor + 3) frameScore = 10 + rolls[cursor + 2];
        cursor += 2;
      } else if (frame.rolls.length === 2) {
        frameScore = frame.rolls[0] + frame.rolls[1];
        cursor += 2;
      } else {
        cursor += 1;
      }
      if (frameScore === null) {
        frame.score = null;
        // Later frames can't be totalled until this one is.
        for (let j = i + 1; j < player.frames.length; j++) player.frames[j].score = null;
        break;
      }
      total += frameScore;
      frame.score = total;
    }
    // Running total: count every pin knocked so far plus settled bonuses.
    const settled = [...player.frames].reverse().find((f) => f.score !== null)?.score ?? 0;
    const settledCount = player.frames.filter((f) => f.score !== null).length;
    let pending = 0;
    for (let i = settledCount; i < player.frames.length; i++) pending += player.frames[i].rolls.reduce((a, b) => a + b, 0);
    player.total = settled + pending;
  }

  private gauss(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as BowlBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        players: board.players.map((p) => ({
          ...p,
          frames: p.frames.map((f) => ({ rolls: [...f.rolls], score: f.score })),
          standing: [...p.standing],
        })),
        pins: [...board.pins],
      } as unknown as Record<string, unknown>,
    };
  }
}
