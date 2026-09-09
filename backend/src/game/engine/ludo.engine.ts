import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/**
 * Token progress encoding (documented for the board UI):
 * - 0        → home yard (not yet on the track)
 * - 1..51    → steps travelled on the 52-cell shared ring
 * - 52..57   → the seat's private 6-cell home column
 * - 58       → finished (home)
 *
 * The absolute ring cell for a token of seat `s` at progress `p` (1..51) is
 * `(s * 13 + p - 1) % 52`.
 */
interface LudoBoard extends Record<string, unknown> {
  /** tokens[seat][tokenIndex] → progress value (see above). */
  tokens: number[][];
  /** 'roll' → the active seat must roll; 'move' → it must move a token. */
  subPhase: 'roll' | 'move';
  /** The pending roll awaiting a move (null while subPhase is 'roll'). */
  dice: number | null;
  /** Last roll for display: `{ seat, value }`. */
  lastRoll: { seat: number; value: number } | null;
  /** Consecutive sixes rolled by the active seat in this turn streak. */
  sixStreak: number;
  /** The most recent move (for animation/highlight). */
  lastMove: { seat: number; token: number; from: number; to: number; captured: number[] } | null;
  startOffsets: number[];
  safeCells: number[];
}

const RING = 52;
const RING_STEPS = 51; // progress 1..51 on the shared ring
const COLUMN = 6; // progress 52..57 in the private home column
const FINISH = RING_STEPS + COLUMN + 1; // 58 — home
const TOKENS_PER_SEAT = 4;

/** Absolute ring index of a seat's start cell. */
const startCell = (seat: number) => (seat * 13) % RING;

/** The 8 safe cells: the four starts plus the four stars (start + 8). */
function safeCellsFor(seatCount: number): number[] {
  const cells = new Set<number>();
  for (let s = 0; s < seatCount; s++) {
    cells.add(startCell(s));
    cells.add((startCell(s) + 8) % RING);
  }
  return [...cells].sort((a, b) => a - b);
}

/** Absolute ring cell for a token (progress 1..51), else -1. */
function absCell(seat: number, progress: number): number {
  if (progress < 1 || progress > 51) return -1;
  return (seat * 13 + progress - 1) % RING;
}

/**
 * Ludo for 2–4 players, wave-1 rebuild.
 *
 * Rules (mirrored by the in-app tutorial):
 * - Roll a 6 to bring a token out of the yard. A 6 always grants another roll
 *   after your move — but three sixes in a row forfeit the whole turn.
 * - Tokens race 51 cells around the shared ring, then climb their private
 *   6-cell home column. Landing exactly on 58 (home) finishes the token.
 * - Landing on an opponent's token captures it back to their yard — unless the
 *   cell is a start cell or a star (marked safe), where everyone may rest.
 * - A roll with no legal move passes the turn automatically.
 * - First seat to bring all four tokens home wins; scores are tokens home.
 *
 * Ludo has no hidden information — every view is the full board.
 */
@Injectable()
export class LudoEngine extends BaseGameEngine {
  readonly slug = 'ludo';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const seatCount = config.seats.length;
    const board: LudoBoard = {
      tokens: Array.from({ length: seatCount }, () => Array<number>(TOKENS_PER_SEAT).fill(0)),
      subPhase: 'roll',
      dice: null,
      lastRoll: null,
      sixStreak: 0,
      lastMove: null,
      startOffsets: Array.from({ length: seatCount }, (_, i) => startCell(i)),
      safeCells: safeCellsFor(seatCount),
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
    const board = state.board as unknown as LudoBoard;

    if (action.type === 'roll') {
      if (board.subPhase !== 'roll') return { ok: false, error: 'Move your token first.' };
      return { ok: true };
    }

    if (action.type === 'move') {
      if (board.subPhase !== 'move') return { ok: false, error: 'Roll the dice first.' };
      const token = Number(action.payload.token);
      if (!Number.isInteger(token) || token < 0 || token >= TOKENS_PER_SEAT) {
        return { ok: false, error: 'Choose one of your four tokens.' };
      }
      const dice = board.dice as number;
      const from = board.tokens[action.seat][token];
      if (!this.isLegalStep(from, dice)) {
        return { ok: false, error: 'That token cannot move with this roll.' };
      }
      return { ok: true };
    }

    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as LudoBoard;

    if (action.type === 'roll') {
      const dice = 1 + Math.floor(Math.random() * 6);
      board.lastRoll = { seat: action.seat, value: dice };

      // Three sixes in a row burn the turn — no move at all.
      if (dice === 6) {
        board.sixStreak += 1;
        if (board.sixStreak >= 3) {
          board.dice = null;
          board.subPhase = 'roll';
          board.sixStreak = 0;
          next.version += 1;
          this.advance(next);
          return next;
        }
      } else {
        board.sixStreak = 0;
      }

      board.dice = dice;
      board.subPhase = 'move';
      next.version += 1;

      // A roll with no legal move passes immediately (the UI shows lastRoll).
      if (!this.legalTokens(board, action.seat).length) {
        board.dice = null;
        board.subPhase = 'roll';
        board.sixStreak = 0;
        this.advance(next);
      }
      return next;
    }

    // move
    const token = Number(action.payload.token);
    const dice = board.dice as number;
    const from = board.tokens[action.seat][token];
    const to = from === 0 ? 1 : from + dice;
    board.tokens[action.seat][token] = to;

    // Captures: landing on an opponent's ring cell that is not safe.
    const captured: number[] = [];
    const cell = absCell(action.seat, to);
    if (cell >= 0 && !board.safeCells.includes(cell)) {
      for (let seat = 0; seat < board.tokens.length; seat++) {
        if (seat === action.seat) continue;
        let hit = false;
        for (let t = 0; t < board.tokens[seat].length; t++) {
          if (absCell(seat, board.tokens[seat][t]) === cell) {
            board.tokens[seat][t] = 0;
            hit = true;
          }
        }
        if (hit) captured.push(seat);
      }
    }
    board.lastMove = { seat: action.seat, token, from, to, captured };
    board.dice = null;
    next.version += 1;

    // Finished the whole army? → win.
    if (board.tokens[action.seat].every((p) => p === FINISH)) {
      this.finish(next, action.seat);
      return next;
    }

    // A used six rolls again; otherwise the turn passes.
    if (dice === 6) {
      board.subPhase = 'roll';
      next.turnStartedAt = new Date().toISOString();
    } else {
      board.subPhase = 'roll';
      board.sixStreak = 0;
      this.advance(next);
    }
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as LudoBoard;

    if (board.subPhase === 'roll') {
      return { action: { seat, type: 'roll', payload: {} }, delayMs: this.think(difficulty, 500) };
    }

    const dice = board.dice as number;
    const legal = this.legalTokens(board, seat);
    let token: number;
    if (difficulty === 'easy' || legal.length === 1) {
      token = legal[Math.floor(Math.random() * legal.length)];
    } else {
      token = legal.reduce((best, t) =>
        this.scoreMove(board, seat, t, dice) >= this.scoreMove(board, seat, best, dice) ? t : best,
      );
    }
    return {
      action: { seat, type: 'move', payload: { token } },
      delayMs: this.think(difficulty, 350),
    };
  }

  // ── rules helpers ────────────────────────────────────────────────────────

  private isLegalStep(from: number, dice: number): boolean {
    if (from === 0) return dice === 6;
    return from + dice <= FINISH;
  }

  private legalTokens(board: LudoBoard, seat: number): number[] {
    const dice = board.dice as number;
    const out: number[] = [];
    board.tokens[seat].forEach((p, t) => {
      if (this.isLegalStep(p, dice)) out.push(t);
    });
    return out;
  }

  /**
   * Heuristic value of moving `token` with `dice`: captures first, finishing
   * tokens second, freeing yard tokens third — then progress, tempered by
   * danger (an enemy 1–6 cells behind the landing cell) for strong bots.
   */
  private scoreMove(board: LudoBoard, seat: number, token: number, dice: number): number {
    const from = board.tokens[seat][token];
    const to = from === 0 ? 1 : from + dice;
    let score = 0;

    const cell = absCell(seat, to);
    if (cell >= 0 && !board.safeCells.includes(cell)) {
      for (let s = 0; s < board.tokens.length; s++) {
        if (s === seat) continue;
        for (const p of board.tokens[s]) {
          if (absCell(s, p) === cell) score += 1000;
        }
      }
    }
    if (to === FINISH) score += 600;
    if (from === 0) score += 320;
    score += to * 2; // prefer advancing the leader… balanced by danger below

    if (cell >= 0) {
      const safe = board.safeCells.includes(cell);
      if (safe) score += 40;
      // Danger: any enemy token 1..6 ring-cells behind the landing spot.
      let threats = 0;
      for (let s = 0; s < board.tokens.length; s++) {
        if (s === seat) continue;
        for (const p of board.tokens[s]) {
          const enemyCell = absCell(s, p);
          if (enemyCell < 0) continue;
          const gap = (cell - enemyCell + RING) % RING;
          if (gap >= 1 && gap <= 6) threats += 1;
        }
      }
      if (!safe) score -= threats * 130;
    }
    return score;
  }

  private advance(state: GameState): void {
    state.currentSeat = (state.currentSeat + 1) % state.seats.length;
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
  }

  private finish(state: GameState, winnerSeat: number): void {
    const board = state.board as unknown as LudoBoard;
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = board.tokens.map((tokens) => tokens.filter((p) => p === FINISH).length);
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra: number): number {
    const base = difficulty === 'easy' ? 900 : difficulty === 'medium' ? 700 : difficulty === 'hard' ? 520 : 380;
    return base + Math.floor(Math.random() * 600) + extra;
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as LudoBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        tokens: board.tokens.map((tokens) => [...tokens]),
        subPhase: board.subPhase,
        dice: board.dice,
        lastRoll: board.lastRoll ? { ...board.lastRoll } : null,
        sixStreak: board.sixStreak,
        lastMove: board.lastMove ? { ...board.lastMove, captured: [...board.lastMove.captured] } : null,
        startOffsets: [...board.startOffsets],
        safeCells: [...board.safeCells],
      } as unknown as Record<string, unknown>,
    };
  }
}
