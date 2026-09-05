import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface CarromPiece {
  id: number; // 1-9 white, 10-18 black, 99 queen, 0 striker
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  color: 'white' | 'black' | 'queen' | 'striker';
}

interface CarromBoard extends Record<string, unknown> {
  pieces: CarromPiece[];
  turnSeat: number;
  // 0 = white, 1 = black
  colors: string[];
  phase: 'aim' | 'sim' | 'ended';
  pocketedThisShot: number[];
  queenClaimedBy: number | null; // seat that pocketed & covered the queen
  queenCovered: boolean;
  foul: boolean;
  botWait: number;
  botSeats: boolean[];
  difficulty: Array<SeatInfo['botDifficulty']>;
}

const C_POCKET_R = 0.09;
const C_PIECE_R = 0.032;
const STRIKER_R = 0.045;
const C_FRICTION = 0.995;
const C_STOP = 0.0016;
const C_POCKETS: Array<[number, number]> = [
  [0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92],
];

/**
 * Carrom for two players, LIVE. Flick the striker at the pieces; pocket your
 * colour (white/black) to score. The queen (red) is worth extra once "covered"
 * by pocketing one of your own pieces immediately after. Pocketing the striker
 * is a foul (returns a piece). First to clear their colour wins; covering the
 * queen adds a bonus. Bots aim and strike automatically with skill error.
 */
@Injectable()
export class CarromEngine extends BaseGameEngine {
  readonly slug = 'carrom';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = true;

  createInitialState(config: MatchConfig): GameState {
    const pieces = this.setup();
    const board: CarromBoard = {
      pieces,
      turnSeat: 0,
      colors: ['white', 'black'],
      phase: 'aim',
      pocketedThisShot: [],
      queenClaimedBy: null,
      queenCovered: false,
      foul: false,
      botWait: 0,
      botSeats: config.seats.map((s) => s.isBot),
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

  private setup(): CarromPiece[] {
    const pieces: CarromPiece[] = [];
    let id = 1;
    const mk = (color: CarromPiece['color'], x: number, y: number): void => {
      pieces.push({ id: color === 'queen' ? 99 : id++, x, y, vx: 0, vy: 0, active: true, color });
    };
    // Concentric hex-ish cluster around the centre.
    mk('queen', 0.5, 0.5);
    const ring1: Array<[number, number]> = [
      [0.5 + 0.05, 0.5], [0.5 - 0.05, 0.5], [0.5, 0.5 + 0.05], [0.5, 0.5 - 0.05],
      [0.5 + 0.035, 0.5 + 0.035], [0.5 - 0.035, 0.5 - 0.035],
    ];
    ring1.forEach(([x, y], i) => mk(i % 2 === 0 ? 'white' : 'black', x, y));
    const ring2: Array<[number, number]> = [
      [0.5 + 0.1, 0.5], [0.5 - 0.1, 0.5], [0.5, 0.5 + 0.1], [0.5, 0.5 - 0.1],
      [0.5 + 0.07, 0.5 + 0.07], [0.5 - 0.07, 0.5 - 0.07],
      [0.5 + 0.07, 0.5 - 0.07], [0.5 - 0.07, 0.5 + 0.07],
    ];
    ring2.forEach(([x, y], i) => mk(i % 2 === 0 ? 'black' : 'white', x, y));
    // More whites/blacks to reach 9 each.
    const extra: Array<[number, number]> = [
      [0.5 + 0.13, 0.5 + 0.05], [0.5 - 0.13, 0.5 - 0.05],
      [0.5 + 0.13, 0.5 - 0.05], [0.5 - 0.13, 0.5 + 0.05],
    ];
    extra.forEach(([x, y], i) => mk(i % 2 === 0 ? 'white' : 'black', x, y));
    // Striker placed on the player's baseline, respot each turn.
    pieces.push({ id: 0, x: 0.5, y: 0.85, vx: 0, vy: 0, active: true, color: 'striker' });
    return pieces;
  }

  private respotStriker(board: CarromBoard): void {
    const striker = board.pieces.find((p) => p.color === 'striker')!;
    striker.active = true;
    striker.x = 0.5;
    striker.y = board.turnSeat === 0 ? 0.85 : 0.15;
    striker.vx = 0;
    striker.vy = 0;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is over.' };
    const board = state.board as unknown as CarromBoard;
    if (action.type !== 'strike') return { ok: false, error: 'Unknown action.' };
    if (action.seat !== board.turnSeat) return { ok: false, error: 'Not your turn.' };
    if (board.phase !== 'aim') return { ok: false, error: 'Wait for pieces to settle.' };
    const angle = Number((action.payload as { angle?: unknown }).angle);
    const power = Number((action.payload as { power?: unknown }).power);
    const sx = (action.payload as { x?: unknown }).x;
    if (!Number.isFinite(angle)) return { ok: false, error: 'Aim angle required.' };
    if (!Number.isFinite(power) || power < 0.1 || power > 1) return { ok: false, error: 'Power out of range.' };
    if (sx !== undefined && (Number(sx) < 0.15 || Number(sx) > 0.85)) {
      return { ok: false, error: 'Striker position out of bounds.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid strike.');
    const board = state.board as unknown as CarromBoard;
    const angle = Number((action.payload as { angle: number }).angle);
    const power = Number((action.payload as { power: number }).power);
    const sx = (action.payload as { x?: number }).x;
    const striker = board.pieces.find((p) => p.color === 'striker')!;
    if (sx !== undefined) striker.x = Number(sx);
    striker.y = board.turnSeat === 0 ? 0.85 : 0.15;
    const speed = 0.02 * power;
    striker.vx = Math.cos(angle) * speed;
    striker.vy = Math.sin(angle) * speed;
    board.phase = 'sim';
    board.pocketedThisShot = [];
    board.foul = false;
    state.version += 1;
    return state;
  }

  tick(state: GameState): GameState {
    if (state.phase !== 'in_progress') return state;
    const board = state.board as unknown as CarromBoard;
    if (board.phase !== 'sim') {
      this.botStrike(state, board);
      return state;
    }
    for (let i = 0; i < 4; i++) this.step(board);
    state.version += 1;
    const moving = board.pieces.some((p) => p.active && (Math.abs(p.vx) > C_STOP || Math.abs(p.vy) > C_STOP));
    if (!moving) this.resolve(state, board);
    return state;
  }

  private step(board: CarromBoard): void {
    const pieces = board.pieces.filter((p) => p.active);
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= C_FRICTION;
      p.vy *= C_FRICTION;
    }
    // Walls.
    for (const p of pieces) {
      const r = p.color === 'striker' ? STRIKER_R : C_PIECE_R;
      if (p.y < r) { p.y = r; p.vy = -p.vy; }
      if (p.y > 1 - r) { p.y = 1 - r; p.vy = -p.vy; }
      if (p.x < r) { p.x = r; p.vx = -p.vx; }
      if (p.x > 1 - r) { p.x = 1 - r; p.vx = -p.vx; }
    }
    // Pockets.
    for (const p of pieces) {
      for (const [px, py] of C_POCKETS) {
        if (Math.hypot(p.x - px, p.y - py) < C_POCKET_R) {
          p.active = false;
          p.vx = 0;
          p.vy = 0;
          board.pocketedThisShot.push(p.id);
          break;
        }
      }
    }
    // Collisions.
    const act = board.pieces.filter((p) => p.active);
    for (let i = 0; i < act.length; i++) {
      for (let j = i + 1; j < act.length; j++) {
        const a = act[i];
        const b = act[j];
        const ra = a.color === 'striker' ? STRIKER_R : C_PIECE_R;
        const rb = b.color === 'striker' ? STRIKER_R : C_PIECE_R;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = ra + rb;
        if (dist > 0 && dist < min) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = min - dist;
          a.x -= (nx * overlap) / 2;
          a.y -= (ny * overlap) / 2;
          b.x += (nx * overlap) / 2;
          b.y += (ny * overlap) / 2;
          const dvx = b.vx - a.vx;
          const dvy = b.vy - a.vy;
          const dot = dvx * nx + dvy * ny;
          if (dot < 0) {
            a.vx += dot * nx;
            a.vy += dot * ny;
            b.vx -= dot * nx;
            b.vy -= dot * ny;
          }
        }
      }
    }
  }

  private resolve(state: GameState, board: CarromBoard): void {
    const seat = board.turnSeat;
    const opp = 1 - seat;
    const myColor = board.colors[seat];
    const strikerPocketed = board.pocketedThisShot.includes(0);
    const queenPocketed = board.pocketedThisShot.includes(99);
    const pottedMine = board.pocketedThisShot.some((id) => {
      const p = board.pieces.find((x) => x.id === id);
      return p && p.color === myColor;
    });

    let continueTurn = pottedMine && !strikerPocketed;

    // Queen cover: queen must be followed by pocketing own colour.
    if (queenPocketed && !board.queenCovered) {
      if (pottedMine && !strikerPocketed) {
        board.queenCovered = true;
        board.queenClaimedBy = seat;
      } else {
        // Queen returns to centre (not covered).
        const queen = board.pieces.find((p) => p.color === 'queen')!;
        queen.active = true;
        queen.x = 0.5;
        queen.y = 0.5;
      }
    }

    if (strikerPocketed) {
      board.foul = true;
      continueTurn = false;
      // Return one of your pocketed pieces to the centre.
      const myPocketed = board.pieces.find((p) => p.color === myColor && !p.active);
      if (myPocketed) {
        myPocketed.active = true;
        myPocketed.x = 0.5 + (Math.random() - 0.5) * 0.1;
        myPocketed.y = 0.5 + (Math.random() - 0.5) * 0.1;
      }
    }

    // Win: cleared all of your colour (and queen covered if you took it).
    const remainingMine = board.pieces.some((p) => p.active && p.color === myColor);
    const remainingOpp = board.pieces.some((p) => p.active && p.color === board.colors[opp]);
    if (!remainingMine && (!queenPocketed || board.queenCovered)) {
      this.finish(state, seat, board);
      return;
    }
    if (!remainingOpp && strikerPocketed) {
      // Opponent cleared but you fouled — opponent still wins.
      this.finish(state, opp, board);
      return;
    }

    if (!continueTurn) {
      board.turnSeat = opp;
      state.currentSeat = opp;
      state.turn += 1;
      state.turnStartedAt = new Date().toISOString();
    }
    board.phase = 'aim';
    for (const p of board.pieces) {
      if (p.color !== 'striker') {
        p.vx = 0;
        p.vy = 0;
      }
    }
    this.respotStriker(board);
    state.version += 1;
  }

  private botStrike(state: GameState, board: CarromBoard): void {
    const takenOver =
      ((state as unknown as { __autoSeats?: boolean[] }).__autoSeats?.[board.turnSeat]) ?? false;
    if (!board.botSeats[board.turnSeat] && !takenOver) return;
    board.botWait += 1;
    const difficulty = board.difficulty[board.turnSeat] ?? 'medium';
    const wait = difficulty === 'easy' ? 22 : difficulty === 'medium' ? 16 : difficulty === 'hard' ? 10 : 6;
    if (board.botWait < wait) return;
    board.botWait = 0;
    const striker = board.pieces.find((p) => p.color === 'striker')!;
    striker.y = board.turnSeat === 0 ? 0.85 : 0.15;
    const myColor = board.colors[board.turnSeat];
    let targets = board.pieces.filter((p) => p.active && (p.color === myColor || (!board.queenCovered && p.color === 'queen')));
    if (targets.length === 0) targets = board.pieces.filter((p) => p.active && p.color !== 'striker');
    if (targets.length === 0) { this.finish(state, board.turnSeat, board); return; }

    let bestAngle = 0;
    let bestScore = -Infinity;
    for (const target of targets) {
      for (const pk of C_POCKETS) {
        const tx = pk[0] - target.x;
        const ty = pk[1] - target.y;
        const tlen = Math.hypot(tx, ty) || 1;
        const ghostX = target.x - (tx / tlen) * (C_PIECE_R + STRIKER_R);
        const ghostY = target.y - (ty / tlen) * (C_PIECE_R + STRIKER_R);
        const aimAng = Math.atan2(ghostY - striker.y, ghostX - striker.x);
        const toPocket = Math.atan2(ty, tx);
        let cut = Math.abs(((aimAng - toPocket + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (cut > Math.PI / 2) cut = Math.PI - cut;
        if (this.pathBlocked(board, striker.x, striker.y, ghostX, ghostY, target.id)) continue;
        const distCue = Math.hypot(ghostX - striker.x, ghostY - striker.y);
        const score = -cut * 3 - distCue * 0.4 - tlen * 0.4;
        if (score > bestScore) { bestScore = score; bestAngle = aimAng; }
      }
    }
    let angle = bestAngle;
    const error = difficulty === 'easy' ? 0.4 : difficulty === 'medium' ? 0.2 : difficulty === 'hard' ? 0.08 : 0.03;
    angle += (Math.random() - 0.5) * 2 * error;
    const power = Math.min(1, 0.7 + Math.random() * 0.25);
    const speed = 0.02 * power;
    striker.vx = Math.cos(angle) * speed;
    striker.vy = Math.sin(angle) * speed;
    board.phase = 'sim';
    board.pocketedThisShot = [];
    board.foul = false;
    state.version += 1;
  }

  private pathBlocked(board: CarromBoard, x0: number, y0: number, x1: number, y1: number, ignoreId: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    for (const p of board.pieces) {
      if (!p.active || p.color === 'striker' || p.id === ignoreId) continue;
      const t = (p.x - x0) * nx + (p.y - y0) * ny;
      if (t < 0 || t > len) continue;
      const px = x0 + nx * t;
      const py = y0 + ny * t;
      if (Math.hypot(p.x - px, p.y - py) < (C_PIECE_R + STRIKER_R) * 0.9) return true;
    }
    return false;
  }

  private finish(state: GameState, winnerSeat: number, board: CarromBoard): void {
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
    const board = state.board as unknown as CarromBoard;
    const safe = {
      pieces: board.pieces.map((p) => ({ id: p.id, x: p.x, y: p.y, active: p.active, color: p.color })),
      turnSeat: board.turnSeat,
      colors: board.colors,
      phase: board.phase,
      queenClaimedBy: board.queenClaimedBy,
      queenCovered: board.queenCovered,
      foul: board.foul,
    };
    return { ...state, board: safe as unknown as Record<string, unknown> };
  }
}
