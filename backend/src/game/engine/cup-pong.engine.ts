import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/** A cup on the far end of the table, in unit table coordinates. */
interface Cup {
  id: number;
  x: number; // 0..1 across the table (0.5 = centre)
  y: number; // 0..1 along the table (1 = far end)
  alive: boolean;
}

interface ShotResult {
  seat: number;
  x: number; // landing point
  y: number;
  hitCup: number | null;
  bounce: boolean;
  /** Ball flight for the client's animation (apex height 0..1). */
  arc: number;
  rimmed: boolean; // hit the rim and rolled off (near miss)
}

interface PongPlayer {
  /** Cups this player still has to sink (their opponents' rack index). */
  cupsLeft: number;
  made: number;
  thrown: number;
  streak: number;
  bestStreak: number;
}

interface PongBoard extends Record<string, unknown> {
  /** rack[r] = cups defending rack r; player p shoots at rack targetRack[p]. */
  racks: Cup[][];
  targetRack: number[];
  players: PongPlayer[];
  ballsLeft: number; // balls in the current turn (2 per turn, bonus on double make)
  lastShot: ShotResult | null;
  rerackAvailable: boolean[];
  totalCups: number;
  turnLog: string[];
}

const CUP_R = 0.058; // cup mouth radius (unit table width)
const CUP_SPACING = 0.125;

/**
 * Cup Pong — the party classic, for 2 or 4 players (4 = two teams of two,
 * seats 0+2 vs 1+3). Each side defends a triangle of ten cups; on your turn
 * you get two balls. Drag back to set power and swipe angle; the ball arcs
 * across the table and lands where it lands — the server rolls in a little
 * hand-shake scatter that grows with power, so gentle lobs are safer and
 * long bombs are riskier. Sink both balls in a turn and you get them back.
 * A bounce shot (tap the "bounce" toggle) counts double if it lands, but the
 * opposition can "swat" it: on the server a bounce has a 35% chance of being
 * blocked unless the defender has ≤3 cups left.
 *
 * The first side to clear the opposing rack wins; the losing side's remaining
 * cups become the margin. With ≤3 cups left a side may re-rack once into a
 * tight cluster (client sends 'rerack').
 */
@Injectable()
export class CupPongEngine extends BaseGameEngine {
  readonly slug = 'cup_pong';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    // 2 or 3 players: everyone has their own rack and shoots at the next seat.
    // 4 players: teams (0,2) vs (1,3) share racks 0 and 1.
    const rackCount = n === 4 ? 2 : n;
    const racks = Array.from({ length: rackCount }, () => this.buildRack(10));
    const targetRack = Array.from({ length: n }, (_, seat) => (n === 4 ? (seat % 2 === 0 ? 1 : 0) : (seat + 1) % n));
    const board: PongBoard = {
      racks,
      targetRack,
      players: config.seats.map(() => ({ cupsLeft: 10, made: 0, thrown: 0, streak: 0, bestStreak: 0 })),
      ballsLeft: 2,
      lastShot: null,
      rerackAvailable: Array.from({ length: rackCount }, () => true),
      totalCups: 10,
      turnLog: [],
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

  private buildRack(count: number): Cup[] {
    // Ten-cup triangle pointing at the shooter: rows of 4,3,2,1 from the far end.
    const cups: Cup[] = [];
    const rows = count === 10 ? [4, 3, 2, 1] : count === 6 ? [3, 2, 1] : [2, 1];
    let id = 0;
    let y = 0.93;
    for (const row of rows) {
      const width = (row - 1) * CUP_SPACING;
      for (let i = 0; i < row; i++) {
        cups.push({ id: id++, x: 0.5 - width / 2 + i * CUP_SPACING, y, alive: true });
      }
      y -= CUP_SPACING * 0.87;
    }
    return cups;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as PongBoard;
    if (action.type === 'rerack') {
      const rack = board.targetRack[action.seat];
      const alive = board.racks[rack].filter((c) => c.alive).length;
      if (!board.rerackAvailable[rack]) return { ok: false, error: 'That rack was already re-racked.' };
      if (alive > 3 || alive < 2) return { ok: false, error: 'Re-rack is only allowed with 2 or 3 cups left.' };
      return { ok: true };
    }
    if (action.type !== 'throw') return { ok: false, error: 'Unknown action.' };
    const power = Number(action.payload.power);
    const angle = Number(action.payload.angle);
    if (!Number.isFinite(power) || power < 0.2 || power > 1) return { ok: false, error: 'Power must be between 0.2 and 1.' };
    if (!Number.isFinite(angle) || Math.abs(angle) > 0.6) return { ok: false, error: 'Aim angle is too wide.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid throw.');
    const next = this.clone(state);
    const board = next.board as unknown as PongBoard;
    const seat = action.seat;
    next.version += 1;

    if (action.type === 'rerack') {
      const rack = board.targetRack[seat];
      const alive = board.racks[rack].filter((c) => c.alive).length;
      const fresh = this.buildRack(alive === 3 ? 3 : 2);
      board.racks[rack] = fresh.map((c, i) => ({ ...c, id: 100 + rack * 10 + i, y: c.y - 0.05 }));
      board.rerackAvailable[rack] = false;
      board.turnLog.unshift(`${next.seats[seat].displayName} re-racked ${alive} cups.`);
      board.turnLog = board.turnLog.slice(0, 6);
      return next;
    }

    const power = Number(action.payload.power);
    const angle = Number(action.payload.angle);
    const bounce = action.payload.bounce === true;
    const shot = this.simulate(board, seat, power, angle, bounce);
    board.lastShot = shot;
    const player = board.players[seat];
    player.thrown += 1;
    const rackIdx = board.targetRack[seat];
    const rack = board.racks[rackIdx];

    if (shot.hitCup != null) {
      const cup = rack.find((c) => c.id === shot.hitCup)!;
      cup.alive = false;
      // Bounce shots remove an extra cup (the closest remaining one).
      let removed = 1;
      if (bounce) {
        const extra = rack.filter((c) => c.alive).sort((a, b) => Math.hypot(a.x - cup.x, a.y - cup.y) - Math.hypot(b.x - cup.x, b.y - cup.y))[0];
        if (extra) {
          extra.alive = false;
          removed = 2;
        }
      }
      player.made += 1;
      player.streak += 1;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      board.turnLog.unshift(`${next.seats[seat].displayName} sank ${removed === 2 ? 'a bounce — two cups!' : 'a cup!'}`);
    } else {
      player.streak = 0;
      board.turnLog.unshift(shot.rimmed ? `${next.seats[seat].displayName} rimmed out!` : `${next.seats[seat].displayName} missed.`);
    }
    board.turnLog = board.turnLog.slice(0, 6);
    this.refreshCupsLeft(board);

    // Win check.
    if (rack.every((c) => !c.alive)) {
      this.finish(next, seat);
      return next;
    }

    board.ballsLeft -= 1;
    if (board.ballsLeft <= 0) {
      // Balls back: both balls of the turn made.
      const madeBoth = player.streak >= 2 && shot.hitCup != null;
      if (madeBoth) {
        board.ballsLeft = 2;
        board.turnLog.unshift('Balls back!');
        board.turnLog = board.turnLog.slice(0, 6);
      } else {
        board.ballsLeft = 2;
        player.streak = 0;
        next.currentSeat = (seat + 1) % next.seats.length;
        next.turn += 1;
        next.turnStartedAt = new Date().toISOString();
      }
    }
    return next;
  }

  private refreshCupsLeft(board: PongBoard): void {
    board.players.forEach((p, seat) => {
      p.cupsLeft = board.racks[board.targetRack[seat]].filter((c) => c.alive).length;
    });
  }

  private finish(state: GameState, seat: number): void {
    const board = state.board as unknown as PongBoard;
    state.phase = 'completed';
    state.currentSeat = -1;
    const n = state.seats.length;
    const winners = n === 4 ? [seat, (seat + 2) % 4] : [seat];
    state.winnerSeat = seat;
    state.winnerSeats = winners;
    // Score = cups sunk (+ bonus for the winners' margin).
    state.scores = board.players.map((p, i) => p.made * 10 + (winners.includes(i) ? p.cupsLeft === 0 ? 20 : 0 : 0));
    state.seats.forEach((s, i) => (s.score = state.scores[i]));
  }

  // ── Physics-ish ────────────────────────────────────────────────────────────

  private simulate(board: PongBoard, seat: number, power: number, angle: number, bounce: boolean): ShotResult {
    // Ideal landing distance for a given power: 0.45 (soft) .. 1.05 (overshoot).
    const ideal = 0.42 + power * 0.66;
    const scatter = 0.012 + power * 0.03 + (bounce ? 0.015 : 0);
    const landY = ideal + this.gauss() * scatter * 1.6;
    const landX = 0.5 + Math.sin(angle) * ideal * 0.95 + this.gauss() * scatter;
    const rack = board.racks[board.targetRack[seat]];
    let hitCup: number | null = null;
    let rimmed = false;
    let best = Number.POSITIVE_INFINITY;
    for (const cup of rack) {
      if (!cup.alive) continue;
      const d = Math.hypot(cup.x - landX, cup.y - landY);
      if (d < best) best = d;
      if (d <= CUP_R * 0.82) hitCup = cup.id;
    }
    if (hitCup == null && best <= CUP_R * 1.15) rimmed = true;
    if (hitCup != null && bounce) {
      // Defenders may swat a bounce unless they are nearly out.
      const defenders = rack.filter((c) => c.alive).length;
      if (defenders > 3 && Math.random() < 0.35) {
        hitCup = null;
        rimmed = true;
      }
    }
    return {
      seat,
      x: +Math.min(1, Math.max(0, landX)).toFixed(4),
      y: +Math.min(1.1, Math.max(0, landY)).toFixed(4),
      hitCup,
      bounce,
      arc: +(0.35 + power * 0.5).toFixed(3),
      rimmed,
    };
  }

  private gauss(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as PongBoard;
    const rack = board.racks[board.targetRack[seat]];
    const alive = rack.filter((c) => c.alive);
    if (alive.length > 0 && alive.length <= 3 && board.rerackAvailable[board.targetRack[seat]] && alive.length >= 2) {
      return { action: { seat, type: 'rerack', payload: {} }, delayMs: 900 };
    }
    // Aim at the cup closest to the centre of mass of the remaining cups.
    const cx = alive.reduce((s, c) => s + c.x, 0) / Math.max(1, alive.length);
    const cy = alive.reduce((s, c) => s + c.y, 0) / Math.max(1, alive.length);
    const target = alive.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0] ?? { x: 0.5, y: 0.85 };
    const idealPower = Math.min(1, Math.max(0.2, (target.y - 0.42) / 0.66));
    const idealAngle = Math.asin(Math.min(0.99, Math.max(-0.99, (target.x - 0.5) / (target.y * 0.95))));
    const err = difficulty === 'easy' ? 0.09 : difficulty === 'medium' ? 0.055 : difficulty === 'hard' ? 0.03 : 0.018;
    const power = Math.min(1, Math.max(0.2, idealPower + this.gauss() * err));
    const angle = Math.max(-0.6, Math.min(0.6, idealAngle + this.gauss() * err * 0.6));
    const bounce = alive.length >= 6 && Math.random() < 0.12;
    const delay = difficulty === 'easy' ? 1600 : 1200;
    return { action: { seat, type: 'throw', payload: { power: +power.toFixed(3), angle: +angle.toFixed(3), bounce } }, delayMs: delay + Math.floor(Math.random() * 700) };
  }

  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as PongBoard;
    return {
      ...state,
      board: {
        racks: board.racks,
        targetRack: board.targetRack,
        players: board.players,
        ballsLeft: board.ballsLeft,
        lastShot: board.lastShot,
        rerackAvailable: board.rerackAvailable,
        totalCups: board.totalCups,
        turnLog: board.turnLog,
        teams: state.seats.length === 4,
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
