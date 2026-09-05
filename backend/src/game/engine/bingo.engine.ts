import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface BingoCard {
  // 25 cells (5×5), center is free; flat index → number (0 = free)
  cells: number[];
  // Called numbers marked on this card (server tracks per seat).
  marked: number[];
}

interface BingoBoard extends Record<string, unknown> {
  cards: BingoCard[];
  called: number[];
  currentCall: number | null;
  lastCallAt: string | null;
  callIntervalMs: number;
  winPattern: 'line' | 'fullhouse';
  phase2: 'dealing' | 'calling' | 'waiting_claim';
  claimWindowEndsAt: string | null;
}

const FREE = 0;
const COLS = 5;
const ROWS = 5;

/**
 * Bingo for 2–8 players, run as a LIVE game. The server (acting as caller)
 * draws a new number every few seconds on the tick loop and auto-detects a
 * winning card (any complete row, column or diagonal for "line", or a full
 * card for "full house"). Players tap "Bingo!" to claim; bots claim as soon as
 * their card wins, with reaction delays scaled by difficulty.
 */
@Injectable()
export class BingoEngine extends BaseGameEngine {
  readonly slug = 'bingo';
  readonly minPlayers = 2;
  readonly maxPlayers = 8;
  readonly isLive = true;

  createInitialState(config: MatchConfig): GameState {
    const cards: BingoCard[] = config.seats.map((_, seat) => ({
      cells: this.makeCard(seat),
      marked: [FREE],
    }));
    const board: BingoBoard = {
      cards,
      called: [],
      currentCall: null,
      lastCallAt: null,
      callIntervalMs: 4000,
      winPattern: 'line',
      phase2: 'calling',
      claimWindowEndsAt: null,
    };
    const state: GameState = {
      phase: 'in_progress',
      turn: 0,
      currentSeat: -1, // live: no single seat "acts"; caller is the engine
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
    // Server-only bot seat map (never emitted; redactHidden rebuilds the board).
    (state as unknown as { __botSeats: boolean[] }).__botSeats = config.seats.map((s) => s.isBot);
    return state;
  }

  private makeCard(_seedSeat: number): number[] {
    // Standard 75-ball bingo columns: B 1-15, I 16-30, N 31-45, G 46-60, O 61-75.
    const cells: number[] = new Array(25).fill(FREE);
    for (let col = 0; col < COLS; col++) {
      const lo = col * 15 + 1;
      const range = Array.from({ length: 15 }, (_, i) => lo + i);
      const picked = this.shuffle(range).slice(0, 5);
      for (let row = 0; row < ROWS; row++) {
        const idx = row * COLS + col;
        if (idx === 12) continue; // free space
        cells[idx] = picked[row];
      }
    }
    return cells;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    const board = state.board as unknown as BingoBoard;
    if (action.type === 'claim') {
      if (!this.cardHasWin(board, action.seat)) {
        return { ok: false, error: 'No winning line yet — false call!' };
      }
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid claim.');
    const next = this.clone(state);
    if (action.type === 'claim') {
      next.phase = 'completed';
      next.winnerSeat = action.seat;
      next.currentSeat = -1;
      const board = next.board as unknown as BingoBoard;
      next.scores = next.scores.map((_, i) => (i === action.seat ? board.called.length : 0));
      next.version += 1;
    }
    return next;
  }

  /**
   * Live tick: the server is the caller. It draws numbers on an interval and
   * lets bots claim when their card wins. The state object is mutated in place
   * and returned (the tick contract allows the same reference; we return a new
   * object only when version bumps so the session broadcasts).
   */
  tick(state: GameState, now: Date): GameState {
    if (state.phase !== 'in_progress') return state;
    const board = state.board as unknown as BingoBoard;
    let bumped = false;

    const due =
      board.lastCallAt == null ||
      now.getTime() - new Date(board.lastCallAt).getTime() >= board.callIntervalMs;
    if (due && board.called.length < 75) {
      const number = this.drawNext(board);
      if (number !== null) {
        board.called.push(number);
        board.currentCall = number;
        board.lastCallAt = now.toISOString();
        this.markAll(board, number);
        bumped = true;
      }
    }

    // Bots claim immediately when their card completes a win (with the call
    // already marked). Human claims arrive via actions.
    const botSeats = (state as unknown as { __botSeats?: boolean[] }).__botSeats ?? [];
    for (let seat = 0; seat < state.seats.length; seat++) {
      const isBot = botSeats[seat] === true;
      if (isBot && this.cardHasWin(board, seat)) {
        state.phase = 'completed';
        state.winnerSeat = seat;
        state.currentSeat = -1;
        state.scores = state.scores.map((_, i) => (i === seat ? board.called.length : 0));
        state.version += 1;
        return state;
      }
    }

    if (bumped) state.version += 1;
    return state;
  }

  /** Live party game: any seated player may claim at any time (validate checks win). */
  canSeatAct(state: GameState, action: GameAction): boolean {
    if (state.phase !== 'in_progress') return false;
    return action.type === 'claim' && action.seat >= 0;
  }

  chooseBotMove(): BotMove {
    // Bots act through the tick (caller-driven); no discrete move needed.
    return { action: { seat: -1, type: '__noop__', payload: {} }, delayMs: 0 };
  }

  private drawNext(board: BingoBoard): number | null {
    const all = Array.from({ length: 75 }, (_, i) => i + 1);
    const remaining = all.filter((n) => !board.called.includes(n));
    if (remaining.length === 0) return null;
    return remaining[Math.floor(Math.random() * remaining.length)];
  }

  private markAll(board: BingoBoard, number: number): void {
    for (const card of board.cards) {
      if (card.cells.includes(number) && !card.marked.includes(number)) {
        card.marked.push(number);
      }
    }
  }

  private cardHasWin(board: BingoBoard, seat: number): boolean {
    const card = board.cards[seat];
    if (!card) return false;
    const marked = new Set(card.marked);
    const has = (idx: number) => card.cells[idx] === FREE || marked.has(card.cells[idx]);
    const lines: number[][] = [
      // rows
      [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
      // cols
      [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
      // diagonals
      [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
    ];
    return lines.some((line) => line.every(has));
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as BingoBoard;
    // Each player sees only their own card; spectators see no cards.
    const safe: Record<string, unknown> = {
      called: board.called,
      currentCall: board.currentCall,
      markedCounts: board.cards.map((c) => c.marked.length),
      myCard: seat >= 0 ? board.cards[seat]?.cells ?? null : null,
      myMarked: seat >= 0 ? board.cards[seat]?.marked ?? [] : null,
    };
    return { ...state, board: safe };
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as BingoBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...board,
        cards: board.cards.map((c) => ({ cells: [...c.cells], marked: [...c.marked] })),
        called: [...board.called],
      } as unknown as Record<string, unknown>,
    };
  }
}
