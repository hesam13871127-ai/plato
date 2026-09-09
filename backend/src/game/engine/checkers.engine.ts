import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Piece {
  /** Owning seat. */
  s: number;
  /** 0 = man, 1 = king. */
  k: 0 | 1;
}

interface CheckersBoard extends Record<string, unknown> {
  /** cells[row][col] on an 8×8 board; row 0 is seat 0's back rank. */
  cells: Array<Array<Piece | null>>;
  /** Set while a multi-jump chain continues: the next jump must leave here. */
  mustJumpFrom: [number, number] | null;
  lastMove: {
    seat: number;
    from: [number, number];
    to: [number, number];
    captured: [number, number] | null;
    promoted: boolean;
  } | null;
  /** Plies since the last capture or promotion — 50 each side draws. */
  noProgress: number;
  moveCount: number;
}

const SIZE = 8;
/** Seat 0 marches down the board (row +1); seat 1 marches up (row -1). */
const forward = (seat: number) => (seat === 0 ? 1 : -1);
const backRow = (seat: number) => (seat === 0 ? SIZE - 1 : 0);
const inBoard = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const DARK = (r: number, c: number) => (r + c) % 2 === 1;

interface Step {
  to: [number, number];
  capture: [number, number] | null;
}

/**
 * English Draughts (Checkers) for two players, wave-1 rebuild.
 *
 * Rules (mirrored by the in-app tutorial):
 * - Men step one square diagonally forward; kings step diagonally both ways.
 * - Captures are jumps over an adjacent enemy piece onto the empty square
 *   behind it, and are mandatory. Chains continue while further jumps exist;
 *   the jumping piece keeps moving until it runs dry. Reaching the back rank
 *   promotes to king and ends the turn immediately.
 * - A seat with no pieces or no legal move loses. Fifty plies without a
 *   capture or promotion is a draw.
 *
 * No hidden information — every view is the full board.
 */
@Injectable()
export class CheckersEngine extends BaseGameEngine {
  readonly slug = 'checkers';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const cells: Array<Array<Piece | null>> = Array.from({ length: SIZE }, () =>
      Array<Piece | null>(SIZE).fill(null),
    );
    // Seat 0 occupies rows 0–2, seat 1 rows 5–7, on dark squares only.
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (DARK(r, c)) cells[r][c] = { s: 0, k: 0 };
      }
    }
    for (let r = SIZE - 3; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (DARK(r, c)) cells[r][c] = { s: 1, k: 0 };
      }
    }
    const board: CheckersBoard = {
      cells,
      mustJumpFrom: null,
      lastMove: null,
      noProgress: 0,
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
    if (action.type !== 'move') return { ok: false, error: 'Unknown action.' };

    const board = state.board as unknown as CheckersBoard;
    const from = parseSquare(action.payload.from);
    const to = parseSquare(action.payload.to);
    if (!from || !to) return { ok: false, error: 'Choose squares on the board.' };

    const piece = board.cells[from[0]][from[1]];
    if (!piece || piece.s !== action.seat) {
      return { ok: false, error: 'That is not your piece.' };
    }
    if (board.mustJumpFrom && (from[0] !== board.mustJumpFrom[0] || from[1] !== board.mustJumpFrom[1])) {
      return { ok: false, error: 'You must continue the jump chain.' };
    }

    const legal = this.stepsFor(board, action.seat, from[0], from[1], piece);
    const step = legal.find((s) => s.to[0] === to[0] && s.to[1] === to[1]);
    if (!step) return { ok: false, error: 'That move is not legal.' };

    // Captures are mandatory: a plain step is illegal while any jump exists.
    if (!step.capture) {
      if (board.mustJumpFrom) return { ok: false, error: 'You must continue jumping.' };
      const allJumps = this.allJumps(board, action.seat);
      if (allJumps.length > 0) {
        return { ok: false, error: 'A capture is available — jumps are mandatory.' };
      }
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as CheckersBoard;
    const from = parseSquare(action.payload.from) as [number, number];
    const to = parseSquare(action.payload.to) as [number, number];

    const piece = board.cells[from[0]][from[1]] as Piece;
    const capturedSquare: [number, number] | null =
      Math.abs(to[0] - from[0]) === 2
        ? [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
        : null;

    board.cells[from[0]][from[1]] = null;
    if (capturedSquare) board.cells[capturedSquare[0]][capturedSquare[1]] = null;
    board.cells[to[0]][to[1]] = piece;

    const promoted = piece.k === 0 && to[0] === backRow(action.seat);
    if (promoted) piece.k = 1;

    board.lastMove = { seat: action.seat, from, to, captured: capturedSquare, promoted };
    board.moveCount += 1;
    next.version += 1;

    if (capturedSquare || promoted) {
      board.noProgress = 0;
    } else {
      board.noProgress += 1;
    }

    // Promotion ends the turn immediately (English rule).
    const chainContinues =
      capturedSquare != null && !promoted && this.stepsFor(board, action.seat, to[0], to[1], piece).some((s) => s.capture);

    if (chainContinues) {
      board.mustJumpFrom = to;
      next.turnStartedAt = new Date().toISOString();
      return next; // same seat jumps again
    }
    board.mustJumpFrom = null;

    // Draw guard: fifty plies with zero progress.
    if (board.noProgress >= 100) {
      this.finish(next, null, false);
      return next;
    }

    // Next seat: no pieces or no legal move at all → they lose.
    const opponent = (action.seat + 1) % 2;
    if (!this.hasAnyMove(board, opponent)) {
      this.finish(next, action.seat, true);
      return next;
    }

    next.currentSeat = opponent;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as CheckersBoard;
    const from = board.mustJumpFrom;
    const moves: Array<{ from: [number, number]; to: [number, number]; score: number }> = [];

    const origins: Array<[number, number]> = from
      ? [from]
      : this.ownedSquares(board, seat);

    for (const [r, c] of origins) {
      const piece = board.cells[r][c] as Piece;
      const steps = this.stepsFor(board, seat, r, c, piece);
      const anyJumpAnywhere = from != null || this.allJumps(board, seat).length > 0;
      for (const step of steps) {
        if (anyJumpAnywhere && !step.capture) continue;
        moves.push({
          from: [r, c],
          to: step.to,
          score: this.scoreMove(board, seat, piece, [r, c], step, difficulty),
        });
      }
    }

    if (moves.length === 0) {
      // Defensive: the service never asks a stuck engine, but never crash.
      return { action: { seat, type: 'move', payload: { from: [0, 0], to: [0, 0] } }, delayMs: 400 };
    }

    moves.sort((a, b) => b.score - a.score);
    const pick =
      difficulty === 'easy' && moves.length > 1 && Math.random() < 0.4
        ? moves[Math.floor(Math.random() * moves.length)]
        : moves[0];
    return {
      action: { seat, type: 'move', payload: { from: pick.from, to: pick.to } },
      delayMs: this.think(difficulty),
    };
  }

  // ── rules helpers ────────────────────────────────────────────────────────

  /** Legal single steps (and jumps) for one piece; jumps only when forced. */
  private stepsFor(board: CheckersBoard, seat: number, r: number, c: number, piece: Piece): Step[] {
    const dirs: Array<[number, number]> = [];
    const f = forward(seat);
    if (piece.k) {
      dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    } else {
      dirs.push([f, 1], [f, -1]);
    }
    const out: Step[] = [];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBoard(nr, nc)) continue;
      const target = board.cells[nr][nc];
      if (!target) {
        out.push({ to: [nr, nc], capture: null });
      } else if (target.s !== seat) {
        const jr = r + 2 * dr;
        const jc = c + 2 * dc;
        if (inBoard(jr, jc) && board.cells[jr][jc] === null) {
          out.push({ to: [jr, jc], capture: [nr, nc] });
        }
      }
    }
    return out;
  }

  private allJumps(board: CheckersBoard, seat: number): Array<{ from: [number, number]; to: [number, number] }> {
    const out: Array<{ from: [number, number]; to: [number, number] }> = [];
    for (const [r, c] of this.ownedSquares(board, seat)) {
      const piece = board.cells[r][c] as Piece;
      for (const step of this.stepsFor(board, seat, r, c, piece)) {
        if (step.capture) out.push({ from: [r, c], to: step.to });
      }
    }
    return out;
  }

  private ownedSquares(board: CheckersBoard, seat: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const piece = board.cells[r][c];
        if (piece && piece.s === seat) out.push([r, c]);
      }
    }
    return out;
  }

  private hasAnyMove(board: CheckersBoard, seat: number): boolean {
    for (const [r, c] of this.ownedSquares(board, seat)) {
      const piece = board.cells[r][c] as Piece;
      if (this.stepsFor(board, seat, r, c, piece).length > 0) return true;
    }
    return false;
  }

  /**
   * Bot evaluation: longest capture chain first (via lookahead of the chain),
   * then promotions, then safe advances; strong bots avoid landing where an
   * enemy can immediately jump them.
   */
  private scoreMove(
    board: CheckersBoard,
    seat: number,
    piece: Piece,
    from: [number, number],
    step: Step,
    difficulty: SeatInfo['botDifficulty'],
  ): number {
    let score = 0;

    if (step.capture) {
      // Look ahead through the whole chain to value multi-jumps correctly.
      score += 100 + 90 * this.chainDepth(board, seat, piece, from, step);
    }
    const promotes = piece.k === 0 && step.to[0] === backRow(seat);
    if (promotes) score += 140;
    if (piece.k) score += 4; // keep kings active
    score += (piece.k ? 2 : 1) * (seat === 0 ? step.to[0] : SIZE - 1 - step.to[0]); // advance

    if (difficulty === 'hard' || difficulty === 'expert') {
      // Danger: could an enemy jump the landing square next ply?
      const probe: Array<Array<Piece | null>> = board.cells.map((row) => row.map((p) => (p ? { ...p } : null)));
      const moving = probe[from[0]][from[1]] as Piece;
      probe[from[0]][from[1]] = null;
      if (step.capture) {
        probe[step.capture[0]][step.capture[1]] = null;
      }
      if (promotes) moving.k = 1;
      probe[step.to[0]][step.to[1]] = moving;
      const enemy = (seat + 1) % 2;
      const probeBoard = { ...board, cells: probe } as CheckersBoard;
      for (const [r, c] of this.ownedSquares(probeBoard, enemy)) {
        const enemyPiece = probe[r][c] as Piece;
        for (const s of this.stepsFor(probeBoard, enemy, r, c, enemyPiece)) {
          if (s.capture && s.capture[0] === step.to[0] && s.capture[1] === step.to[1]) {
            score -= piece.k ? 160 : 90;
          }
        }
      }
      // Back-rank safety for unpromoted men.
      if (!piece.k && (step.to[0] === 0 || step.to[0] === SIZE - 1)) score += 12;
    }
    return score;
  }

  /** How many additional captures follow if this jump is taken (best line). */
  private chainDepth(
    board: CheckersBoard,
    seat: number,
    piece: Piece,
    from: [number, number],
    first: Step,
  ): number {
    const cells = board.cells.map((row) => row.map((p) => (p ? { ...p } : null)));
    let [r, c] = first.to;
    cells[from[0]][from[1]] = null;
    cells[first.capture![0]][first.capture![1]] = null;
    const moving = { ...piece };
    // Promotion mid-chain would stop it — only the final landing matters here
    // for depth; approximate with the man staying a man unless it promotes.
    cells[r][c] = moving;

    let depth = 0;
    for (;;) {
      if (moving.k === 0 && r === backRow(seat)) break; // promotion ends chain
      const steps = this.stepsFor({ ...board, cells } as CheckersBoard, seat, r, c, moving).filter((s) => s.capture);
      if (steps.length === 0) break;
      const jump = steps[0];
      cells[jump.capture![0]][jump.capture![1]] = null;
      r = jump.to[0];
      c = jump.to[1];
      if (moving.k === 0 && r === backRow(seat)) moving.k = 1;
      depth += 1;
      if (depth > 11) break; // safety cap
    }
    return depth;
  }

  private finish(state: GameState, winnerSeat: number | null, won: boolean): void {
    const board = state.board as unknown as CheckersBoard;
    let scores = state.scores.map(() => 0);
    if (won && winnerSeat != null) {
      const captured = board.cells.flat().filter((p) => p && p.s !== winnerSeat).length;
      scores = state.scores.map((_, i) => (i === winnerSeat ? 12 - captured : 0));
    }
    state.phase = 'completed';
    state.winnerSeat = winnerSeat;
    state.currentSeat = -1;
    state.scores = scores;
    state.seats = state.seats.map((s, i) => ({ ...s, score: scores[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1500 : difficulty === 'medium' ? 1100 : difficulty === 'hard' ? 800 : 550;
    return base + Math.floor(Math.random() * 900);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as CheckersBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        cells: board.cells.map((row) => row.map((p) => (p ? { ...p } : null))),
        mustJumpFrom: board.mustJumpFrom ? ([...board.mustJumpFrom] as [number, number]) : null,
        lastMove: board.lastMove
          ? {
              ...board.lastMove,
              from: [...board.lastMove.from] as [number, number],
              to: [...board.lastMove.to] as [number, number],
              captured: board.lastMove.captured ? ([...board.lastMove.captured] as [number, number]) : null,
            }
          : null,
        noProgress: board.noProgress,
        moveCount: board.moveCount,
      } as unknown as Record<string, unknown>,
    };
  }
}

function parseSquare(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const r = Number(raw[0]);
  const c = Number(raw[1]);
  if (!Number.isInteger(r) || !Number.isInteger(c) || !inBoard(r, c)) return null;
  return [r, c];
}
