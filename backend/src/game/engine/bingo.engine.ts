import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface BingoBoard extends Record<string, unknown> {
  /** cards[seat][row][col]: 1..75; 0 marks the FREE centre. */
  cards: number[][][];
  /** marks[seat][row][col]: auto-dabbed when the number is drawn. */
  marks: boolean[][][];
  /** All drawn balls, in order. */
  drawn: number[];
  /** Balls left in the cage (sorted; draws pick a random index). */
  pool: number[];
  lastBall: number | null;
  lastWin: { seat: number; line: Array<[number, number]> } | null;
}

const SIZE = 5;
const COL_MAX = [15, 30, 45, 60, 75]; // column b ranges: 1-15, 16-30, …

/**
 * Bingo (75-ball) for 2–4 players, wave-3 rebuild.
 *
 * Every seat gets a private 5×5 card with a FREE centre; on your turn you
 * draw the next ball from the cage and every card auto-dabs the match. First
 * seat to complete a row, column or diagonal shouts Bingo and wins — the
 * drawer wins ties, then seat order. Cards are hidden information: a player
 * sees their own card and the drawn balls, others only card progress.
 */
@Injectable()
export class BingoEngine extends BaseGameEngine {
  readonly slug = 'bingo';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const seats = config.seats.length;
    const cards: number[][][] = [];
    const marks: boolean[][][] = [];
    for (let s = 0; s < seats; s++) {
      const card: number[][] = [];
      const mark: boolean[][] = [];
      for (let r = 0; r < SIZE; r++) {
        const row: number[] = [];
        const mrow: boolean[] = [];
        for (let c = 0; c < SIZE; c++) {
          if (r === 2 && c === 2) {
            row.push(0); // FREE
            mrow.push(true);
          } else {
            const lo = c === 0 ? 1 : COL_MAX[c - 1] + 1;
            row.push(lo + Math.floor(Math.random() * (COL_MAX[c] - lo + 1)));
            mrow.push(false);
          }
        }
        card.push(row);
        mark.push(mrow);
      }
      // De-duplicate within each column (re-roll collisions).
      for (let c = 0; c < SIZE; c++) {
        const seen = new Set<number>();
        for (let r = 0; r < SIZE; r++) {
          if (card[r][c] === 0) continue;
          while (seen.has(card[r][c])) {
            const lo = c === 0 ? 1 : COL_MAX[c - 1] + 1;
            card[r][c] = lo + Math.floor(Math.random() * (COL_MAX[c] - lo + 1));
          }
          seen.add(card[r][c]);
        }
      }
      cards.push(card);
      marks.push(mark);
    }
    const pool = Array.from({ length: 75 }, (_, i) => i + 1);
    const board: BingoBoard = {
      cards,
      marks,
      drawn: [],
      pool,
      lastBall: null,
      lastWin: null,
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
    if (action.type !== 'draw') return { ok: false, error: 'Unknown action.' };
    const board = state.board as unknown as BingoBoard;
    if (board.pool.length === 0) return { ok: false, error: 'The cage is empty.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as BingoBoard;

    // Draw a random ball from the cage.
    const idx = Math.floor(Math.random() * board.pool.length);
    const ball = board.pool[idx];
    board.pool.splice(idx, 1);
    board.drawn.push(ball);
    board.lastBall = ball;

    // Auto-dab every card.
    for (let s = 0; s < board.cards.length; s++) {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (board.cards[s][r][c] === ball) board.marks[s][r][c] = true;
        }
      }
    }
    next.version += 1;

    // Bingo check: the drawer first, then the rest in seat order.
    const order = [action.seat, ...board.cards.map((_, i) => i).filter((i) => i !== action.seat)];
    for (const seat of order) {
      const line = this.findLine(board.marks[seat]);
      if (line) {
        board.lastWin = { seat, line };
        this.finish(next, seat);
        return next;
      }
    }

    next.currentSeat = (action.seat + 1) % next.seats.length;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    return { action: { seat, type: 'draw', payload: {} }, delayMs: this.think(difficulty) };
  }

  // ── hidden information ────────────────────────────────────────────────────

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as BingoBoard;
    const view = this.clone(state);
    const vb = view.board as unknown as BingoBoard;
    vb.cards = board.cards.map((card, s) => (s === seat ? card.map((r) => [...r]) : []));
    vb.marks = board.marks.map((mark, s) => (s === seat ? mark.map((r) => [...r]) : []));
    return view;
  }

  // ── rules helpers ─────────────────────────────────────────────────────────

  private findLine(marks: boolean[][]): Array<[number, number]> | null {
    for (let r = 0; r < SIZE; r++) {
      if (marks[r].every(Boolean)) return marks[r].map((_, c) => [r, c] as [number, number]);
    }
    for (let c = 0; c < SIZE; c++) {
      let full = true;
      for (let r = 0; r < SIZE; r++) full = full && marks[r][c];
      if (full) return marks.map((_, r) => [r, c] as [number, number]);
    }
    let diag = true;
    for (let i = 0; i < SIZE; i++) diag = diag && marks[i][i];
    if (diag) return marks.map((_, i) => [i, i] as [number, number]);
    let anti = true;
    for (let i = 0; i < SIZE; i++) anti = anti && marks[i][SIZE - 1 - i];
    if (anti) return marks.map((_, i) => [i, SIZE - 1 - i] as [number, number]);
    return null;
  }

  private finish(state: GameState, winnerSeat: number): void {
    const board = state.board as unknown as BingoBoard;
    // Score: winner by marks, others keep their dab count.
    const scores = board.marks.map((mark) => mark.flat().filter(Boolean).length);
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
    const board = state.board as unknown as BingoBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        cards: board.cards.map((card) => card.map((row) => [...row])),
        marks: board.marks.map((mark) => mark.map((row) => [...row])),
        drawn: [...board.drawn],
        pool: [...board.pool],
        lastBall: board.lastBall,
        lastWin: board.lastWin
          ? { seat: board.lastWin.seat, line: board.lastWin.line.map((p) => [...p] as [number, number]) }
          : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
