import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/** The eight faces of the deck — each dealt twice. */
export const MEMORY_SYMBOLS = ['🌟', '🎵', '🔥', '🌊', '🍀', '🌙', '⚡', '🎈'] as const;

interface MemoryCard {
  symbol: string;
  matched: boolean;
}

interface MemoryBoard extends Record<string, unknown> {
  /** cards[i] = the card at grid position i; index is the position. */
  cards: MemoryCard[];
  /** Positions the table has already seen (mismatches stay public knowledge). */
  revealed: number[];
  /** Total pairs matched so far. */
  matchCount: number;
  /** The previous flip, for the reveal flash. */
  lastFlip: { seat: number; a: number; b: number; matched: boolean } | null;
}

const PAIRS = MEMORY_SYMBOLS.length; // 8 pairs → 16 cards

/**
 * Memory (Concentration) for two to four players, wave-4 rebuild.
 *
 * A four-by-four grid of face-down cards — eight emoji pairs shuffled into
 * sixteen slots. On your turn flip any two: a match removes both and keeps
 * you at the table, a mismatch flips them back and passes the turn. Every
 * card anyone has seen stays public knowledge in `revealed`, so the client
 * can mark it — but remembering where things were is the whole game.
 * Unrevealed card faces are stripped from every client view; the deck ends
 * when all pairs are claimed and the biggest haul wins.
 *
 * Bots have photographic recall of the public `revealed` list — they pounce
 * on any known pair immediately — with per-difficulty chances of forgetting
 * and flipping blind instead.
 */
@Injectable()
export class MemoryEngine extends BaseGameEngine {
  readonly slug = 'memory';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const deck: string[] = [];
    for (const s of MEMORY_SYMBOLS) {
      deck.push(s, s);
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = deck[i];
      deck[i] = deck[j];
      deck[j] = t;
    }
    const board: MemoryBoard = {
      cards: deck.map((symbol) => ({ symbol, matched: false })),
      revealed: [],
      matchCount: 0,
      lastFlip: null,
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
    if (action.type !== 'flip') return { ok: false, error: 'Unknown action.' };
    const a = Number(action.payload.a);
    const b = Number(action.payload.b);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a >= 2 * PAIRS || b < 0 || b >= 2 * PAIRS) {
      return { ok: false, error: 'Pick two cards on the grid.' };
    }
    if (a === b) return { ok: false, error: 'Pick two different cards.' };
    const board = state.board as unknown as MemoryBoard;
    if (board.cards[a].matched || board.cards[b].matched) {
      return { ok: false, error: 'That pair is already claimed.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid flip.');
    const next = this.clone(state);
    const board = next.board as unknown as MemoryBoard;
    const seat = action.seat;
    const a = Number(action.payload.a);
    const b = Number(action.payload.b);
    const matched = board.cards[a].symbol === board.cards[b].symbol;

    // The table sees both faces either way.
    for (const i of [a, b]) {
      if (!board.revealed.includes(i)) board.revealed.push(i);
    }
    board.lastFlip = { seat, a, b, matched };

    if (matched) {
      board.cards[a].matched = true;
      board.cards[b].matched = true;
      board.matchCount += 1;
      next.scores[seat] += 1;
      next.version += 1;
      if (board.matchCount >= PAIRS) {
        this.finish(next);
        return next;
      }
      // A match keeps you at the table.
      next.turnStartedAt = new Date().toISOString();
      return next;
    }

    next.version += 1;
    next.currentSeat = (seat + 1) % next.seats.length;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as MemoryBoard;
    const forgetChance =
      difficulty === 'easy' ? 0.65 : difficulty === 'medium' ? 0.35 : difficulty === 'hard' ? 0.12 : 0.02;

    // Photographic recall: any two revealed, unmatched cards sharing a face?
    if (Math.random() >= forgetChance) {
      const known = board.revealed.filter((i) => !board.cards[i].matched);
      for (let i = 0; i < known.length; i++) {
        for (let j = i + 1; j < known.length; j++) {
          if (board.cards[known[i]].symbol === board.cards[known[j]].symbol) {
            return { action: { seat, type: 'flip', payload: { a: known[i], b: known[j] } }, delayMs: this.think(difficulty) };
          }
        }
      }
    }

    // Flip blind: two random face-down positions (mixing known and unknown).
    const live = board.cards.map((c, i) => ({ c, i })).filter((x) => !x.c.matched).map((x) => x.i);
    const i1 = Math.floor(Math.random() * live.length);
    let i2 = Math.floor(Math.random() * live.length);
    if (i2 === i1) i2 = (i2 + 1) % live.length;
    return {
      action: { seat, type: 'flip', payload: { a: live[i1], b: live[i2] } },
      delayMs: this.think(difficulty),
    };
  }

  /** Face-down positions still in play — the client mirror. */
  legalMoves(state: GameState): number[] {
    const board = state.board as unknown as MemoryBoard;
    return board.cards.map((c, i) => (c.matched ? -1 : i)).filter((i) => i >= 0);
  }

  /** Hidden information: unrevealed card faces never leave the server. */
  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as MemoryBoard;
    const view = this.clone(state);
    const vb = view.board as unknown as MemoryBoard;
    vb.cards = vb.cards.map((c, i) =>
      c.matched || board.revealed.includes(i) ? { ...c } : { symbol: '?', matched: c.matched },
    );
    return view;
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private finish(state: GameState): void {
    const scores = state.scores;
    const max = Math.max(...scores);
    const leaders = scores.map((s, i) => ({ s, i })).filter((x) => x.s === max).map((x) => x.i);
    const winner = leaders.length === 1 ? leaders[0] : null;
    state.phase = 'completed';
    state.winnerSeat = winner;
    state.currentSeat = -1;
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1300 : difficulty === 'medium' ? 1000 : difficulty === 'hard' ? 800 : 600;
    return base + extra + Math.floor(Math.random() * 800);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as MemoryBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        cards: board.cards.map((c) => ({ ...c })),
        revealed: [...board.revealed],
        lastFlip: board.lastFlip ? { ...board.lastFlip } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
