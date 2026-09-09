import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface MancalaBoard extends Record<string, unknown> {
  /**
   * 14 cups: 0-5 = seat 0 pits, 6 = seat 0 store, 7-12 = seat 1 pits,
   * 13 = seat 1 store. Seeds are shared counters — no owner sign.
   */
  pits: number[];
  /** Summary of the last sow, for the UI replay. */
  lastSow: { seat: number; pit: number; lastCup: number; captured: number; extraTurn: boolean } | null;
  moveCount: number;
}

const SEEDS_PER_PIT = 4;
const storeOf = (seat: number) => (seat === 0 ? 6 : 13);
const pitIndex = (seat: number, pit: number) => (seat === 0 ? pit - 1 : 6 + pit);
const opposite = (cup: number) => 12 - cup;

/**
 * Mancala (Kalah rules) for two players, wave-3 rebuild.
 *
 * Six pits and a store each, four seeds per pit. A turn sows one pit's seeds
 * counter-clockwise — one per cup, skipping the opponent's store. The last
 * seed in your own store grants another turn; the last seed in your own empty
 * pit captures it plus everything opposite into your store. When either side
 * empties, the other sweeps their remaining seeds and the bigger store wins.
 *
 * Bots look one sow deep: extra turns and captures score big, store progress
 * scores small, and feeding the opponent's capture pits scores negative.
 * Easy/medium add noise and blunders.
 */
@Injectable()
export class MancalaEngine extends BaseGameEngine {
  readonly slug = 'mancala';
  readonly minPlayers = 2;
  readonly maxPlayers = 2;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const pits = Array<number>(14).fill(SEEDS_PER_PIT);
    pits[6] = 0;
    pits[13] = 0;
    const board: MancalaBoard = { pits, lastSow: null, moveCount: 0 };
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
    if (action.type !== 'sow') return { ok: false, error: 'Unknown action.' };
    const pit = Number(action.payload.pit);
    if (!Number.isInteger(pit) || pit < 1 || pit > 6) {
      return { ok: false, error: 'Pick one of your six pits.' };
    }
    const board = state.board as unknown as MancalaBoard;
    if (board.pits[pitIndex(action.seat, pit)] <= 0) {
      return { ok: false, error: 'That pit is empty.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const next = this.clone(state);
    const board = next.board as unknown as MancalaBoard;
    const seat = action.seat;
    const pit = Number(action.payload.pit);

    const [lastCup, captured, extraTurn] = this.sow(board, seat, pit);
    board.lastSow = { seat, pit, lastCup, captured, extraTurn };
    board.moveCount += 1;
    next.version += 1;

    // Either side empty → the other sweeps their remaining seeds and we score.
    const sideSum = (from: number, to: number) => board.pits.slice(from, to + 1).reduce((a, v) => a + v, 0);
    if (sideSum(0, 5) === 0 || sideSum(7, 12) === 0) {
      board.pits[6] += sideSum(0, 5);
      board.pits[13] += sideSum(7, 12);
      for (let i = 0; i <= 5; i++) board.pits[i] = 0;
      for (let i = 7; i <= 12; i++) board.pits[i] = 0;
      this.finish(next);
      return next;
    }

    if (extraTurn) {
      next.turnStartedAt = new Date().toISOString(); // sow again
    } else {
      next.currentSeat = 1 - seat;
      next.turn += 1;
      next.turnStartedAt = new Date().toISOString();
    }
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const legal = this.legalPits(state.board as unknown as MancalaBoard, seat);
    if (legal.length === 0) return { action: { seat, type: 'sow', payload: { pit: 1 } }, delayMs: 500 };
    const mistakeChance =
      difficulty === 'easy' ? 0.4 : difficulty === 'medium' ? 0.15 : difficulty === 'hard' ? 0.05 : 0.0;

    let pit: number;
    if (Math.random() < mistakeChance) {
      pit = legal[Math.floor(Math.random() * legal.length)];
    } else {
      pit = this.bestPit(state.board as unknown as MancalaBoard, seat, legal);
    }
    return {
      action: { seat, type: 'sow', payload: { pit } },
      delayMs: this.think(difficulty),
    };
  }

  /** Legal pit numbers (1-6) for the seat to act — the client mirror. */
  legalMoves(state: GameState): number[] {
    return this.legalPits(state.board as unknown as MancalaBoard, state.currentSeat);
  }

  // ── rules ─────────────────────────────────────────────────────────────────

  private legalPits(board: MancalaBoard, seat: number): number[] {
    const out: number[] = [];
    for (let p = 1; p <= 6; p++) {
      if (board.pits[pitIndex(seat, p)] > 0) out.push(p);
    }
    return out;
  }

  /**
   * Sows one pit. Returns [lastCup, captured, extraTurn]; `captured` is the
   * number of seeds moved to the store by a capture (0 when none).
   */
  private sow(board: MancalaBoard, seat: number, pit: number): [number, number, boolean] {
    const pits = board.pits;
    const start = pitIndex(seat, pit);
    const n = pits[start];
    pits[start] = 0;
    const oppStore = storeOf(1 - seat);
    let i = start;
    for (let s = 0; s < n; s++) {
      do {
        i = (i + 1) % 14;
      } while (i === oppStore);
      pits[i] += 1;
    }

    const ownStore = storeOf(seat);
    if (i === ownStore) return [i, 0, true];

    // Capture: last seed in an own pit that was empty, opposite non-empty.
    const ownPit = seat === 0 ? i <= 5 : i >= 7 && i <= 12;
    if (ownPit && pits[i] === 1 && pits[opposite(i)] > 0) {
      const loot = 1 + pits[opposite(i)];
      pits[ownStore] += loot;
      pits[i] = 0;
      pits[opposite(i)] = 0;
      return [i, loot, false];
    }
    return [i, 0, false];
  }

  private finish(state: GameState): void {
    const board = state.board as unknown as MancalaBoard;
    const a = board.pits[6];
    const b = board.pits[13];
    const winner = a > b ? 0 : b > a ? 1 : null;
    state.phase = 'completed';
    state.winnerSeat = winner;
    state.currentSeat = -1;
    state.scores = [a, b];
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  // ── bot scoring ───────────────────────────────────────────────────────────

  private bestPit(board: MancalaBoard, seat: number, legal: number[]): number {
    let best = legal[0];
    let bestScore = -Infinity;
    for (const pit of legal) {
      const clone = { pits: [...board.pits] } as MancalaBoard;
      const [, captured, extraTurn] = this.sow(clone, seat, pit);
      const storeGain = clone.pits[storeOf(seat)] - board.pits[storeOf(seat)];
      let score = Math.random(); // tie-break jitter
      score += storeGain * 1.2 + captured * 1.5;
      if (extraTurn) score += 45;
      // Feeding: seeds left sitting opposite an enemy pit that can capture.
      for (let c = 0; c <= 5; c++) {
        const mine = seat === 0 ? clone.pits[c] : clone.pits[7 + c];
        const theirEntry = seat === 0 ? clone.pits[12 - c] : clone.pits[5 - c];
        if (mine > 0 && theirEntry > 0) score -= mine * 0.55;
      }
      if (score > bestScore) {
        bestScore = score;
        best = pit;
      }
    }
    return best;
  }

  // ── shared helpers ────────────────────────────────────────────────────────

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1400 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 750 : 500;
    return base + extra + Math.floor(Math.random() * 800);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as MancalaBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        pits: [...board.pits],
        lastSow: board.lastSow ? { ...board.lastSow } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
