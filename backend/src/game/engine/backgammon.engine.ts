import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/**
 * Board representation: `points[0..23]` hold a signed checker count —
 * positive = seat 0 checkers, negative = seat 1. Seat 0 moves from point 23
 * towards point 0 and bears off past 0; seat 1 moves 0 → 23 and bears off past
 * 23. `bar` and `off` hold per-seat counts. Point indices are 0-based.
 */
interface BgBoard extends Record<string, unknown> {
  points: number[];
  bar: [number, number];
  off: [number, number];
  dice: number[]; // dice rolled this turn (2 values, or 4 on doubles)
  remaining: number[]; // dice values still unused this turn
  hasRolled: boolean;
  lastMove: { seat: number; from: number; to: number; hit: boolean } | null;
  /** Pre-computed legal (from,die) pairs for the current seat given `remaining`. */
  legal: Array<{ from: number; to: number; die: number }>;
  /** Opening-roll bookkeeping: each seat rolls one die; higher starts. */
  opening: { rolls: [number | null, number | null] } | null;
  pipCount: [number, number];
}

const BAR = -1; // `from` for entering from the bar
const OFF = 24; // `to` for bearing off (normalised)

/**
 * Backgammon for two players — full standard rules: opening roll, hitting,
 * the bar, forced entry, bearing off only when every checker is home, doubles
 * play four moves, and the "use both dice / larger die" obligation. No
 * doubling cube (kept simple for ranked fairness). Gammons/backgammons score
 * 2×/3× points. Bots evaluate hits, made points, blots and race with a
 * difficulty-scaled heuristic.
 */
@Injectable()
export class BackgammonEngine extends BaseGameEngine {
  readonly slug = 'backgammon';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const points = Array<number>(24).fill(0);
    // Standard setup (seat 0 = positive, moving 23 → 0).
    points[23] = 2;
    points[12] = 5;
    points[7] = 3;
    points[5] = 5;
    points[0] = -2;
    points[11] = -5;
    points[16] = -3;
    points[18] = -5;
    const board: BgBoard = {
      points,
      bar: [0, 0],
      off: [0, 0],
      dice: [],
      remaining: [],
      hasRolled: false,
      lastMove: null,
      legal: [],
      opening: { rolls: [null, null] },
      pipCount: [167, 167],
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
    const board = state.board as unknown as BgBoard;
    if (action.type === 'roll') {
      if (board.hasRolled) return { ok: false, error: 'You already rolled — move a checker.' };
      return { ok: true };
    }
    if (action.type === 'move') {
      if (!board.hasRolled) return { ok: false, error: 'Roll the dice first.' };
      const from = Number(action.payload.from);
      const die = Number(action.payload.die);
      if (!Number.isInteger(from) || !Number.isInteger(die)) return { ok: false, error: 'Choose a checker and a die.' };
      const legal = board.legal.find((m) => m.from === from && m.die === die);
      if (!legal) {
        if (board.bar[action.seat] > 0 && from !== BAR) return { ok: false, error: 'Enter your checker from the bar first.' };
        return { ok: false, error: 'That move is not legal with the dice you have.' };
      }
      return { ok: true };
    }
    if (action.type === 'pass') {
      if (!board.hasRolled) return { ok: false, error: 'Roll the dice first.' };
      if (board.legal.length > 0) return { ok: false, error: 'You still have a legal move.' };
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as BgBoard;
    const seat = action.seat;

    if (action.type === 'roll') {
      if (board.opening) {
        // Opening: each seat rolls one die; ties re-roll; higher moves first with both dice.
        const d = this.die();
        board.opening.rolls[seat] = d;
        const [a, b] = board.opening.rolls;
        next.version += 1;
        if (a != null && b != null) {
          if (a === b) {
            board.opening.rolls = [null, null];
            next.currentSeat = 0;
          } else {
            const starter = a > b ? 0 : 1;
            board.opening = null;
            board.dice = [a, b];
            board.remaining = [a, b];
            board.hasRolled = true;
            next.currentSeat = starter;
            board.legal = this.legalMoves(board, starter);
            if (board.legal.length === 0) this.endTurn(next, starter);
          }
        } else {
          next.currentSeat = (seat + 1) % 2;
        }
        next.turnStartedAt = new Date().toISOString();
        return next;
      }
      const d1 = this.die();
      const d2 = this.die();
      board.dice = [d1, d2];
      board.remaining = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      board.hasRolled = true;
      board.legal = this.legalMoves(board, seat);
      next.version += 1;
      // No legal move at all: the turn passes automatically (client shows the dice briefly).
      if (board.legal.length === 0) this.endTurn(next, seat);
      return next;
    }

    if (action.type === 'move') {
      const from = Number(action.payload.from);
      const die = Number(action.payload.die);
      const move = board.legal.find((m) => m.from === from && m.die === die)!;
      this.play(board, seat, move);
      const idx = board.remaining.indexOf(die);
      board.remaining.splice(idx, 1);
      next.version += 1;
      if (board.off[seat] === 15) {
        this.finish(next, seat);
        return next;
      }
      board.legal = board.remaining.length > 0 ? this.legalMoves(board, seat) : [];
      if (board.legal.length === 0) this.endTurn(next, seat);
      return next;
    }

    // pass
    next.version += 1;
    this.endTurn(next, seat);
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as BgBoard;
    const think = this.think(difficulty);
    if (!board.hasRolled) return { action: { seat, type: 'roll', payload: {} }, delayMs: think };
    if (board.legal.length === 0) return { action: { seat, type: 'pass', payload: {} }, delayMs: 400 };
    const mistake = difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.15 : difficulty === 'hard' ? 0.05 : 0;
    let pick = board.legal[0];
    if (Math.random() < mistake) {
      pick = board.legal[Math.floor(Math.random() * board.legal.length)];
    } else {
      let best = -Infinity;
      for (const m of board.legal) {
        const sim = this.simulate(board, seat, m);
        const score = this.evaluate(sim, seat) + Math.random() * 2;
        if (score > best) {
          best = score;
          pick = m;
        }
      }
    }
    return { action: { seat, type: 'move', payload: { from: pick.from, die: pick.die } }, delayMs: Math.round(think * 0.6) };
  }

  // ── Rules ─────────────────────────────────────────────────────────────────

  private die(): number {
    return 1 + Math.floor(Math.random() * 6);
  }

  private sign(seat: number): number {
    return seat === 0 ? 1 : -1;
  }

  private dir(seat: number): number {
    return seat === 0 ? -1 : 1;
  }

  /** Home board points for a seat (seat 0: 0–5, seat 1: 18–23). */
  private isHome(seat: number, point: number): boolean {
    return seat === 0 ? point >= 0 && point <= 5 : point >= 18 && point <= 23;
  }

  private allHome(board: BgBoard, seat: number): boolean {
    if (board.bar[seat] > 0) return false;
    const s = this.sign(seat);
    for (let p = 0; p < 24; p++) {
      if (board.points[p] * s > 0 && !this.isHome(seat, p)) return false;
    }
    return true;
  }

  /** Entry point index when entering from the bar with `die`. */
  private entryPoint(seat: number, die: number): number {
    return seat === 0 ? 24 - die : die - 1;
  }

  /** Distance from `point` to bearing off for a seat (1..24). */
  private pipsToOff(seat: number, point: number): number {
    return seat === 0 ? point + 1 : 24 - point;
  }

  private canLand(board: BgBoard, seat: number, point: number): boolean {
    const v = board.points[point] * this.sign(seat);
    return v >= -1; // empty, own, or a single enemy blot
  }

  /** Every legal single-die move for the seat under the "must use dice" rules. */
  private legalMoves(board: BgBoard, seat: number): Array<{ from: number; to: number; die: number }> {
    const dice = [...new Set(board.remaining)];
    const raw = this.singleMoves(board, seat, dice);
    if (raw.length === 0) return [];
    // Obligation: if both dice can be played in some order, a move that leaves
    // the other die unplayable is illegal; if only one die can be played, the
    // larger must be used when possible.
    if (board.remaining.length === 2 && board.remaining[0] !== board.remaining[1]) {
      const [a, b] = board.remaining;
      const canBoth = raw.some((m) => {
        const after = this.simulate(board, seat, m);
        after.remaining = [m.die === a ? b : a];
        return this.singleMoves(after, seat, after.remaining).length > 0;
      });
      if (canBoth) {
        return raw.filter((m) => {
          const after = this.simulate(board, seat, m);
          after.remaining = [m.die === a ? b : a];
          return this.singleMoves(after, seat, after.remaining).length > 0;
        });
      }
      const larger = Math.max(a, b);
      const withLarger = raw.filter((m) => m.die === larger);
      if (withLarger.length > 0) return withLarger;
    }
    return raw;
  }

  private singleMoves(board: BgBoard, seat: number, dice: number[]): Array<{ from: number; to: number; die: number }> {
    const out: Array<{ from: number; to: number; die: number }> = [];
    const s = this.sign(seat);
    if (board.bar[seat] > 0) {
      for (const die of dice) {
        const p = this.entryPoint(seat, die);
        if (this.canLand(board, seat, p)) out.push({ from: BAR, to: p, die });
      }
      return out;
    }
    const home = this.allHome(board, seat);
    for (let p = 0; p < 24; p++) {
      if (board.points[p] * s <= 0) continue;
      for (const die of dice) {
        const target = p + this.dir(seat) * die;
        if (target >= 0 && target < 24) {
          if (this.canLand(board, seat, target)) out.push({ from: p, to: target, die });
        } else if (home) {
          const need = this.pipsToOff(seat, p);
          if (die === need) out.push({ from: p, to: OFF, die });
          else if (die > need && !this.hasCheckerBehind(board, seat, p)) out.push({ from: p, to: OFF, die });
        }
      }
    }
    return out;
  }

  /** True if the seat has a checker farther from off than `point` (blocks over-bearing). */
  private hasCheckerBehind(board: BgBoard, seat: number, point: number): boolean {
    const s = this.sign(seat);
    if (seat === 0) {
      for (let p = point + 1; p <= 5; p++) if (board.points[p] * s > 0) return true;
    } else {
      for (let p = point - 1; p >= 18; p--) if (board.points[p] * s > 0) return true;
    }
    return false;
  }

  private play(board: BgBoard, seat: number, m: { from: number; to: number; die: number }): void {
    const s = this.sign(seat);
    if (m.from === BAR) board.bar[seat] -= 1;
    else board.points[m.from] -= s;
    let hit = false;
    if (m.to === OFF) {
      board.off[seat] += 1;
    } else {
      if (board.points[m.to] * s === -1) {
        board.points[m.to] = 0;
        board.bar[(seat + 1) % 2] += 1;
        hit = true;
      }
      board.points[m.to] += s;
    }
    board.lastMove = { seat, from: m.from, to: m.to, hit };
    board.pipCount = this.pips(board);
  }

  private pips(board: BgBoard): [number, number] {
    let a = board.bar[0] * 25;
    let b = board.bar[1] * 25;
    for (let p = 0; p < 24; p++) {
      const v = board.points[p];
      if (v > 0) a += v * (p + 1);
      else if (v < 0) b += -v * (24 - p);
    }
    return [a, b];
  }

  private simulate(board: BgBoard, seat: number, m: { from: number; to: number; die: number }): BgBoard {
    const copy: BgBoard = {
      ...board,
      points: [...board.points],
      bar: [board.bar[0], board.bar[1]],
      off: [board.off[0], board.off[1]],
      remaining: [...board.remaining],
      legal: [],
    };
    this.play(copy, seat, m);
    return copy;
  }

  private endTurn(state: GameState, seat: number): void {
    const board = state.board as unknown as BgBoard;
    board.dice = [];
    board.remaining = [];
    board.hasRolled = false;
    board.legal = [];
    state.currentSeat = (seat + 1) % 2;
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
  }

  // ── AI ────────────────────────────────────────────────────────────────────

  private evaluate(board: BgBoard, seat: number): number {
    const opp = (seat + 1) % 2;
    const s = this.sign(seat);
    let score = 0;
    score += (board.pipCount[opp] - board.pipCount[seat]) * 1.0; // race lead
    score += board.off[seat] * 12;
    score += board.bar[opp] * 18; // hits are strong
    score -= board.bar[seat] * 20;
    for (let p = 0; p < 24; p++) {
      const v = board.points[p] * s;
      if (v === 1) {
        // Blot: risk scales with how deep in enemy territory it sits.
        const exposure = seat === 0 ? 24 - p : p + 1;
        score -= 4 + exposure * 0.4;
      } else if (v >= 2) {
        score += 3;
        if (this.isHome(seat, p)) score += 3; // made home points block entry
      }
    }
    return score;
  }

  // ── Views / lifecycle ─────────────────────────────────────────────────────

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as BgBoard;
    const safe: Record<string, unknown> = {
      points: board.points,
      bar: board.bar,
      off: board.off,
      dice: board.dice,
      remaining: board.remaining,
      hasRolled: board.hasRolled,
      lastMove: board.lastMove,
      opening: board.opening,
      pipCount: board.pipCount,
      legal: seat === state.currentSeat ? board.legal : [],
    };
    return { ...state, board: safe };
  }

  private finish(state: GameState, winnerSeat: number): void {
    const board = state.board as unknown as BgBoard;
    const loser = (winnerSeat + 1) % 2;
    // Gammon: loser bore off nothing (2 pts); backgammon: also has a checker on the bar / in winner's home (3 pts).
    let points = 1;
    if (board.off[loser] === 0) {
      points = 2;
      const s = this.sign(loser);
      const inWinnerHome = board.points.some((v, p) => v * s > 0 && this.isHome(winnerSeat, p));
      if (board.bar[loser] > 0 || inWinnerHome) points = 3;
    }
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = state.scores.map((_, i) => (i === winnerSeat ? points * 25 + board.off[i] : board.off[i]));
    (state.board as Record<string, unknown>).result = points === 1 ? 'single' : points === 2 ? 'gammon' : 'backgammon';
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1400 : difficulty === 'medium' ? 1100 : difficulty === 'hard' ? 900 : 700;
    return base + Math.floor(Math.random() * 900);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as BgBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        points: [...board.points],
        bar: [board.bar[0], board.bar[1]],
        off: [board.off[0], board.off[1]],
        dice: [...board.dice],
        remaining: [...board.remaining],
        legal: [...board.legal],
        opening: board.opening ? { rolls: [board.opening.rolls[0], board.opening.rolls[1]] } : null,
        pipCount: [board.pipCount[0], board.pipCount[1]],
      } as unknown as Record<string, unknown>,
    };
  }
}
