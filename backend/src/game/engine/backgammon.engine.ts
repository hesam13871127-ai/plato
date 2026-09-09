import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface BgBoard extends Record<string, unknown> {
  /** points[0] = point 1 … points[23] = point 24. Positive = seat 0 checkers, negative = seat 1. */
  points: number[];
  /** Checkers on the bar per seat. */
  bar: [number, number];
  /** Checkers borne off per seat. */
  off: [number, number];
  /** Remaining dice values to play this turn. */
  dice: number[];
  /** The full original roll (for the dice tray UI). */
  rolled: number[];
  subPhase: 'roll' | 'move';
  lastMove: { seat: number; from: number; to: number; die: number; hit: boolean } | null;
  moveCount: number;
}

interface MoveOption {
  from: number; // 0 = bar, else 1..24
  to: number; // 0 = off, else 1..24
  die: number;
  hit: boolean;
}

const POINTS = 24;
const HOME_MIN = (seat: number) => (seat === 0 ? 1 : 19);
const HOME_MAX = (seat: number) => (seat === 0 ? 6 : 24);
const dir = (seat: number) => (seat === 0 ? -1 : 1);

/**
 * Backgammon for two players, wave-3 rebuild.
 *
 * The full classic race on 24 points: both dice each turn (doubles play
 * four times), blocked points, blots get hit onto the bar, bar checkers must
 * re-enter before anything else moves, bearing off needs the whole home board
 * (exact throws first, overshoot only from the rearmost point), and the
 * must-play-the-maximum-dice rule is enforced with a small search. Bearing
 * off all fifteen wins — gammon (opponent bore off none) doubles to 2 points
 * and a backgammon (bar or home invasion) triples to 3. No hidden information.
 *
 * Bots score every legal single-die move: hits, bear-offs, point-making and
 * blot safety first; easy/medium add noise and blunders.
 */
@Injectable()
export class BackgammonEngine extends BaseGameEngine {
  readonly slug = 'backgammon';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    // Standard opening layout (mirrored).
    const points = Array<number>(POINTS).fill(0);
    points[23] = 2; // seat 0: 24
    points[12] = 5; // 13
    points[7] = 3; // 8
    points[5] = 5; // 6
    points[0] = -2; // seat 1: 1
    points[11] = -5; // 12
    points[16] = -3; // 17
    points[18] = -5; // 19
    const board: BgBoard = {
      points,
      bar: [0, 0],
      off: [0, 0],
      dice: [],
      rolled: [],
      subPhase: 'roll',
      lastMove: null,
      moveCount: 0,
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
    const board = state.board as unknown as BgBoard;

    if (action.type === 'roll') {
      if (board.subPhase !== 'roll') return { ok: false, error: 'You already rolled.' };
      return { ok: true };
    }

    if (action.type === 'move') {
      if (board.subPhase !== 'move') return { ok: false, error: 'Roll the dice first.' };
      const from = parseFrom(action.payload.from);
      const die = Number(action.payload.die);
      if (from === null) return { ok: false, error: 'Choose a valid origin.' };
      if (!Number.isInteger(die) || die < 1 || die > 6 || !board.dice.includes(die)) {
        return { ok: false, error: 'Pick one of your remaining dice.' };
      }
      const legal = this.legalMovesFor(board, action.seat);
      const match = legal.find((m) => m.from === from && m.die === die);
      if (!match) return { ok: false, error: 'That move is not legal.' };
      return { ok: true };
    }

    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as BgBoard;

    if (action.type === 'roll') {
      const d1 = 1 + Math.floor(Math.random() * 6);
      const d2 = 1 + Math.floor(Math.random() * 6);
      board.rolled = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      board.dice = [...board.rolled];
      board.subPhase = 'move';
      next.version += 1;
      next.turnStartedAt = new Date().toISOString();
      // Doubles may strand the player — forfeit immediately.
      if (this.legalMovesFor(board, action.seat).length === 0) {
        this.passTurn(next, board, action.seat);
      }
      return next;
    }

    // move
    const from = parseFrom(action.payload.from) as number;
    const die = Number(action.payload.die);
    const legal = this.legalMovesFor(board, action.seat);
    const move = legal.find((m) => m.from === from && m.die === die) as MoveOption;

    this.applyMove(board, action.seat, move);
    board.dice.splice(board.dice.indexOf(die), 1);
    board.lastMove = { seat: action.seat, from: move.from, to: move.to, die, hit: move.hit };
    board.moveCount += 1;
    next.version += 1;

    // Win by bearing off all fifteen.
    if (board.off[action.seat] >= 15) {
      this.finish(next, action.seat);
      return next;
    }

    // Turn ends when the dice run out or nothing legal remains.
    if (board.dice.length === 0 || this.legalMovesFor(board, action.seat).length === 0) {
      this.passTurn(next, board, action.seat);
    } else {
      next.turnStartedAt = new Date().toISOString();
    }
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as BgBoard;
    if (board.subPhase === 'roll') {
      return { action: { seat, type: 'roll', payload: {} }, delayMs: this.think(difficulty, 250) };
    }
    const legal = this.legalMovesFor(board, seat);
    if (legal.length === 0) {
      return { action: { seat, type: 'roll', payload: {} }, delayMs: 500 };
    }
    const mistakeChance =
      difficulty === 'easy' ? 0.40 : difficulty === 'medium' ? 0.15 : difficulty === 'hard' ? 0.05 : 0.0;

    let pick: MoveOption;
    if (Math.random() < mistakeChance) {
      pick = legal[Math.floor(Math.random() * legal.length)];
    } else {
      pick = this.bestMove(board, seat, legal);
    }
    return {
      action: { seat, type: 'move', payload: { from: pick.from, die: pick.die } },
      delayMs: this.think(difficulty),
    };
  }

  // ── move machinery ────────────────────────────────────────────────────────

  /** Legal moves for the seat to act — the client mirror of the rules. */
  legalMoves(state: GameState): Array<{ from: number; to: number; die: number; hit: boolean }> {
    const board = state.board as unknown as BgBoard;
    return this.legalMovesFor(board, state.currentSeat).map((m) => ({ ...m }));
  }

  /** All single-die moves currently legal, honouring max-dice usage. */
  legalMovesFor(board: BgBoard, seat: number): MoveOption[] {
    const raw = this.rawMoves(board, seat, board.dice);
    if (raw.length === 0) return [];
    // Must play as many dice as possible: reject moves that strand more dice
    // than the best achievable line.
    const best = this.maxUsable(board.points, board.bar, seat, [...board.dice]);
    const out: MoveOption[] = [];
    for (const m of raw) {
      const [points, bar] = this.cloneLight(board);
      const move = { ...m };
      this.applyMove({ points, bar, off: [0, 0] } as unknown as BgBoard, seat, move);
      const remaining = [...board.dice];
      remaining.splice(remaining.indexOf(m.die), 1);
      const after = this.maxUsable(points, bar, seat, remaining) + 1;
      if (after === best) out.push(m);
    }
    return out;
  }

  private rawMoves(board: BgBoard, seat: number, dice: number[]): MoveOption[] {
    const out: MoveOption[] = [];
    const enemy = 1 - seat;
    const enemyCount = (p: number) => {
      const v = board.points[p - 1];
      return seat === 0 ? (v < 0 ? -v : 0) : v > 0 ? v : 0;
    };
    const open = (p: number) => enemyCount(p) <= 1;

    // Bar first: nothing else may move while checkers wait there.
    if (board.bar[seat] > 0) {
      const enter = seat === 0 ? (d: number) => 25 - d : (d: number) => d;
      for (const die of new Set(dice)) {
        const to = enter(die);
        if (open(to)) {
          out.push({ from: 0, to, die, hit: enemyCount(to) === 1 });
        }
      }
      return out;
    }

    const allHome = this.allHome(board, seat);
    for (let p = 1; p <= POINTS; p++) {
      const v = board.points[p - 1];
      const mine = seat === 0 ? v > 0 : v < 0;
      if (!mine) continue;
      for (const die of new Set(dice)) {
        const to = p + dir(seat) * die;
        if (to >= 1 && to <= POINTS) {
          if (open(to)) out.push({ from: p, to, die, hit: enemyCount(to) === 1 });
        } else if (allHome) {
          // Bear off: exact, or overshoot from the rearmost occupied point.
          const exact = to === (seat === 0 ? 0 : 25);
          let overshootOk = false;
          if (!exact) {
            // No own checker farther from home than p.
            overshootOk = true;
            for (let q = 1; q <= POINTS; q++) {
              const qv = board.points[q - 1];
              const qMine = seat === 0 ? qv > 0 : qv < 0;
              if (!qMine) continue;
              const farther = seat === 0 ? q > p : q < p;
              if (farther) {
                overshootOk = false;
                break;
              }
            }
          }
          if (exact || overshootOk) out.push({ from: p, to: 0, die, hit: false });
        }
      }
    }
    return out;
  }

  /** DFS: the most dice of `dice` the seat can play from this position. */
  private maxUsable(points: number[], bar: [number, number], seat: number, dice: number[]): number {
    if (dice.length === 0) return 0;
    const fake: BgBoard = {
      points,
      bar,
      off: [0, 0],
      dice,
      rolled: [],
      subPhase: 'move',
      lastMove: null,
      moveCount: 0,
    } as BgBoard;
    const moves = this.rawMoves(fake, seat, dice);
    let best = 0;
    for (const m of moves) {
      const [p2, b2] = this.cloneLight(fake);
      this.applyMove({ points: p2, bar: b2, off: [0, 0] } as unknown as BgBoard, seat, { ...m });
      const rest = [...dice];
      rest.splice(rest.indexOf(m.die), 1);
      best = Math.max(best, 1 + this.maxUsable(p2, b2, seat, rest));
      if (best === dice.length) break;
    }
    return best;
  }

  private applyMove(board: BgBoard, seat: number, m: MoveOption): void {
    const enemy = 1 - seat;
    if (m.from === 0) {
      board.bar[seat] -= 1;
    } else {
      // Remove one of my checkers from the origin point.
      board.points[m.from - 1] -= Math.sign(board.points[m.from - 1]) * 1;
    }
    if (m.to === 0) {
      board.off[seat] += 1;
    } else {
      if (m.hit) {
        board.points[m.to - 1] = 0;
        board.bar[enemy] += 1;
      }
      board.points[m.to - 1] += seat === 0 ? 1 : -1;
    }
  }

  private allHome(board: BgBoard, seat: number): boolean {
    if (board.bar[seat] > 0) return false;
    for (let p = 1; p <= POINTS; p++) {
      const v = board.points[p - 1];
      const mine = seat === 0 ? v > 0 : v < 0;
      if (!mine) continue;
      const inHome = p >= HOME_MIN(seat) && p <= HOME_MAX(seat);
      if (!inHome) return false;
    }
    return true;
  }

  private cloneLight(board: BgBoard): [number[], [number, number]] {
    return [
      [...board.points],
      [board.bar[0], board.bar[1]] as [number, number],
    ];
  }

  private passTurn(next: GameState, board: BgBoard, seat: number): void {
    board.subPhase = 'roll';
    board.dice = [];
    next.currentSeat = (seat + 1) % next.seats.length;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
  }

  // ── bot scoring ───────────────────────────────────────────────────────────

  private bestMove(board: BgBoard, seat: number, legal: MoveOption[]): MoveOption {
    let best = legal[0];
    let bestScore = -Infinity;
    for (const m of legal) {
      let score = Math.random(); // tie-break jitter
      if (m.hit) score += 55;
      if (m.to === 0) score += 40;
      if (m.from === 0) score += 30; // entering is usually forced progress
      // Making a point (two+ on the destination).
      if (m.to !== 0) {
        const v = board.points[m.to - 1];
        const mineThere = seat === 0 ? v : -v;
        if (mineThere >= 1) score += 9;
        if (mineThere >= 2) score += 3;
      }
      // Leaving a blot behind.
      if (m.from !== 0) {
        const v = board.points[m.from - 1];
        const mineFrom = seat === 0 ? v : -v;
        if (mineFrom - 1 === 1) score -= 7;
      }
      // Advancing towards home.
      if (m.to !== 0) score += (seat === 0 ? 24 - m.to : m.to) * 0.15;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  // ── shared helpers ────────────────────────────────────────────────────────

  private finish(state: GameState, winnerSeat: number): void {
    const board = state.board as unknown as BgBoard;
    const loser = 1 - winnerSeat;
    // Gammon: loser bore off nothing. Backgammon: … and still on the bar or
    // inside the winner's home board.
    let points = 1;
    if (board.off[loser] === 0) {
      points = 2;
      const invaded = board.bar[loser] > 0 || this.hasCheckerIn(board, loser, HOME_MIN(winnerSeat), HOME_MAX(winnerSeat));
      if (invaded) points = 3;
    }
    const scores = state.scores.map((_, i) => (i === winnerSeat ? points : 0));
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = scores;
    state.seats = state.seats.map((s, i) => ({ ...s, score: scores[i] }));
  }

  private hasCheckerIn(board: BgBoard, seat: number, lo: number, hi: number): boolean {
    for (let p = lo; p <= hi; p++) {
      const v = board.points[p - 1];
      if (seat === 0 ? v > 0 : v < 0) return true;
    }
    return false;
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1400 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 750 : 500;
    return base + extra + Math.floor(Math.random() * 800);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as BgBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        points: [...board.points],
        bar: [board.bar[0], board.bar[1]] as [number, number],
        off: [board.off[0], board.off[1]] as [number, number],
        dice: [...board.dice],
        rolled: [...board.rolled],
        subPhase: board.subPhase,
        lastMove: board.lastMove ? { ...board.lastMove } : null,
        moveCount: board.moveCount,
      } as unknown as Record<string, unknown>,
    };
  }
}

function parseFrom(raw: unknown): number | null {
  if (raw === 'bar' || raw === 0) return 0;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 1 || v > POINTS) return null;
  return v;
}
