import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/**
 * Board layout (14 cups, counter-clockwise):
 *
 *        12  11  10   9   8   7        ← seat 1's pits
 *   13                           6     ← stores: 13 = seat 1, 6 = seat 0
 *         0   1   2   3   4   5        ← seat 0's pits
 */
interface MancalaBoard extends Record<string, unknown> {
  cups: number[];
  /** Pits the seat to move may sow from (absolute cup indices). */
  legal: number[];
  lastMove: { seat: number; pit: number; path: number[]; captured: number; extraTurn: boolean } | null;
}

const PITS = 6;
const SEED = 4;
const STORE = [6, 13];

/**
 * Mancala (Kalah) for two players. Pick one of your pits and sow its stones
 * counter-clockwise, one per cup, skipping the opponent's store. Landing in
 * your store earns another turn; landing in an empty pit on your side
 * captures that stone plus everything in the opposite pit. When one side is
 * empty the other player banks their remaining stones — most stones wins.
 * Bots run a depth-limited minimax (depth by difficulty) over store margin.
 */
@Injectable()
export class MancalaEngine extends BaseGameEngine {
  readonly slug = 'mancala';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const cups = Array<number>(14).fill(SEED);
    cups[STORE[0]] = 0;
    cups[STORE[1]] = 0;
    const board: MancalaBoard = { cups, legal: this.legalPits(cups, 0), lastMove: null };
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
      scores: [0, 0],
      version: 1,
    };
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    if (action.type !== 'sow') return { ok: false, error: 'Unknown action.' };
    const board = state.board as unknown as MancalaBoard;
    const pit = Number(action.payload.pit);
    if (!Number.isInteger(pit)) return { ok: false, error: 'Choose a pit.' };
    if (!this.ownsPit(action.seat, pit)) return { ok: false, error: 'That pit is not yours.' };
    if (board.cups[pit] === 0) return { ok: false, error: 'That pit is empty.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as MancalaBoard;
    const pit = Number(action.payload.pit);
    const result = this.sow(board.cups, action.seat, pit);
    board.lastMove = { seat: action.seat, pit, ...result };
    next.version += 1;
    this.syncScores(next);

    if (this.sideEmpty(board.cups, 0) || this.sideEmpty(board.cups, 1)) {
      this.sweep(board.cups);
      this.syncScores(next);
      this.finish(next);
      return next;
    }
    const seatToMove = result.extraTurn ? action.seat : 1 - action.seat;
    next.currentSeat = seatToMove;
    board.legal = this.legalPits(board.cups, seatToMove);
    if (!result.extraTurn) next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as MancalaBoard;
    const legal = this.legalPits(board.cups, seat);
    const depth = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 3 : difficulty === 'hard' ? 5 : 7;
    const mistake = difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.12 : 0;
    let pick = legal[0];
    if (Math.random() < mistake) {
      pick = legal[Math.floor(Math.random() * legal.length)];
    } else {
      let best = Number.NEGATIVE_INFINITY;
      for (const pit of legal) {
        const cups = [...board.cups];
        const r = this.sow(cups, seat, pit);
        const value = this.search(cups, r.extraTurn ? seat : 1 - seat, seat, depth - 1, -Infinity, Infinity);
        // Prefer extra turns and captures slightly when values tie.
        const bonus = (r.extraTurn ? 0.5 : 0) + r.captured * 0.1;
        if (value + bonus > best) {
          best = value + bonus;
          pick = pit;
        }
      }
    }
    const base = difficulty === 'easy' ? 1200 : difficulty === 'medium' ? 950 : difficulty === 'hard' ? 800 : 650;
    return { action: { seat, type: 'sow', payload: { pit: pick } }, delayMs: base + Math.floor(Math.random() * 900) };
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as MancalaBoard;
    return {
      ...state,
      board: {
        cups: board.cups,
        stores: [board.cups[STORE[0]], board.cups[STORE[1]]],
        lastMove: board.lastMove,
        legal: state.phase === 'in_progress' && seat === state.currentSeat ? board.legal : [],
      },
    };
  }

  // ── Rules ─────────────────────────────────────────────────────────────────

  private ownsPit(seat: number, pit: number): boolean {
    return seat === 0 ? pit >= 0 && pit < PITS : pit >= 7 && pit < 7 + PITS;
  }

  private legalPits(cups: number[], seat: number): number[] {
    const start = seat === 0 ? 0 : 7;
    const pits: number[] = [];
    for (let i = start; i < start + PITS; i++) if (cups[i] > 0) pits.push(i);
    return pits;
  }

  /** Sows in place. Returns the path, captured stones and whether the turn repeats. */
  private sow(cups: number[], seat: number, pit: number): { path: number[]; captured: number; extraTurn: boolean } {
    let stones = cups[pit];
    cups[pit] = 0;
    let idx = pit;
    const path: number[] = [];
    const skip = STORE[1 - seat];
    while (stones > 0) {
      idx = (idx + 1) % 14;
      if (idx === skip) continue;
      cups[idx] += 1;
      path.push(idx);
      stones -= 1;
    }
    const myStore = STORE[seat];
    if (idx === myStore) return { path, captured: 0, extraTurn: true };
    let captured = 0;
    if (this.ownsPit(seat, idx) && cups[idx] === 1) {
      const opposite = 12 - idx;
      if (cups[opposite] > 0) {
        captured = cups[opposite] + 1;
        cups[myStore] += captured;
        cups[opposite] = 0;
        cups[idx] = 0;
      }
    }
    return { path, captured, extraTurn: false };
  }

  private sideEmpty(cups: number[], seat: number): boolean {
    const start = seat === 0 ? 0 : 7;
    for (let i = start; i < start + PITS; i++) if (cups[i] > 0) return false;
    return true;
  }

  /** End of game: each side banks its remaining stones. */
  private sweep(cups: number[]): void {
    for (let s = 0; s < 2; s++) {
      const start = s === 0 ? 0 : 7;
      for (let i = start; i < start + PITS; i++) {
        cups[STORE[s]] += cups[i];
        cups[i] = 0;
      }
    }
  }

  private syncScores(state: GameState): void {
    const board = state.board as unknown as MancalaBoard;
    state.scores = [board.cups[STORE[0]], board.cups[STORE[1]]];
    state.seats[0].score = state.scores[0];
    state.seats[1].score = state.scores[1];
  }

  private finish(state: GameState): void {
    const board = state.board as unknown as MancalaBoard;
    state.phase = 'completed';
    state.currentSeat = -1;
    board.legal = [];
    const [a, b] = [board.cups[STORE[0]], board.cups[STORE[1]]];
    const winner = a === b ? null : a > b ? 0 : 1;
    state.winnerSeat = winner;
    state.winnerSeats = winner === null ? [0, 1] : [winner];
  }

  // ── Search ────────────────────────────────────────────────────────────────

  private search(cups: number[], toMove: number, me: number, depth: number, alpha: number, beta: number): number {
    if (this.sideEmpty(cups, 0) || this.sideEmpty(cups, 1)) {
      const c = [...cups];
      this.sweep(c);
      const margin = c[STORE[me]] - c[STORE[1 - me]];
      return margin > 0 ? 1000 + margin : margin < 0 ? -1000 + margin : 0;
    }
    if (depth <= 0) return cups[STORE[me]] - cups[STORE[1 - me]];
    const legal = this.legalPits(cups, toMove);
    const maximizing = toMove === me;
    let best = maximizing ? -Infinity : Infinity;
    for (const pit of legal) {
      const c = [...cups];
      const r = this.sow(c, toMove, pit);
      const nextMover = r.extraTurn ? toMove : 1 - toMove;
      const v = this.search(c, nextMover, me, depth - 1, alpha, beta);
      if (maximizing) {
        best = Math.max(best, v);
        alpha = Math.max(alpha, v);
      } else {
        best = Math.min(best, v);
        beta = Math.min(beta, v);
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as MancalaBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: { cups: [...board.cups], legal: [...board.legal], lastMove: board.lastMove } as unknown as Record<string, unknown>,
    };
  }
}
