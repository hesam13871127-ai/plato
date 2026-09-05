import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

const EMOJIS = ['🍎', '⭐', '🚀', '🎲', '🐱', '🌈', '🎵', '🔥'];
const PAIRS = 8;

interface MemoryBoard extends Record<string, unknown> {
  // card state: 'down' | 'up' | 'matched'; matchedBy: seat or -1
  emojis: string[]; // emoji per card index
  states: string[];
  matchedBy: number[];
  // currently flipped (not yet matched) card indices — up to 2
  flipped: number[];
  scores: number[]; // pairs matched per seat
  roundEndsAt: string;
  roundMs: number;
  resolvedAt: number | null; // timestamp after which the pair is resolved
  matchedPairs: number;
  // server-only
  botSeats: boolean[];
  botFlipAt: number[]; // per-bot next action time
  botDifficulty: Array<SeatInfo['botDifficulty']>;
  botKnown: number[][]; // per-bot memory: card indices the bot has seen face-up
}

/**
 * Memory Race — a live speed memory game for 2–4 players sharing one grid of
 * 16 cards (8 pairs). Flip a card; on your second tap it either matches and you
 * score a pair, or it flips back. The first tap after a card is shown is
 * authoritative (lock), so taps never conflict. Most pairs when the board is
 * cleared wins. Bots "peek" the board and match pairs their difficulty has
 * remembered, on human-like reaction timers.
 */
@Injectable()
export class MemoryRaceEngine extends BaseGameEngine {
  readonly slug = 'memory_race';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = true;

  private static readonly ROUND_MS = 90000;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    const deck = this.shuffledDeck();
    const start = Date.now();
    const board: MemoryBoard = {
      emojis: deck.map((e) => e),
      states: deck.map(() => 'down'),
      matchedBy: deck.map(() => -1),
      flipped: [],
      scores: Array.from({ length: n }, () => 0),
      roundEndsAt: new Date(start + MemoryRaceEngine.ROUND_MS).toISOString(),
      roundMs: MemoryRaceEngine.ROUND_MS,
      resolvedAt: null,
      matchedPairs: 0,
      botSeats: config.seats.map((s) => s.isBot),
      botFlipAt: config.seats.map((s, i) => (s.isBot ? start + 1500 + i * 800 : Number.POSITIVE_INFINITY)),
      botDifficulty: config.seats.map((s) => s.botDifficulty ?? 'medium'),
      botKnown: config.seats.map(() => []),
    };
    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: -1,
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

  private shuffledDeck(): string[] {
    const cards = [...EMOJIS.slice(0, PAIRS), ...EMOJIS.slice(0, PAIRS)];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    const board = state.board as unknown as MemoryBoard;
    if (action.type !== 'flip') return { ok: false, error: 'Unknown action.' };
    const index = (action.payload['index'] as number | undefined) ?? -1;
    if (!Number.isInteger(index) || index < 0 || index >= board.emojis.length) {
      return { ok: false, error: 'Pick a card on the board.' };
    }
    if (board.states[index] === 'matched') return { ok: false, error: 'That pair is gone.' };
    if (board.flipped.includes(index)) return { ok: false, error: 'That card is already up.' };
    if (board.flipped.length >= 2) return { ok: false, error: 'Wait for the current pair.' };
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    this.flipCard(state, action.seat, action.payload['index'] as number);
    return state;
  }

  /** Internal, non-throwing flip used by both humans (applyAction) and bots (tick). */
  private flipCard(state: GameState, seat: number, index: number): boolean {
    const board = state.board as unknown as MemoryBoard;
    if (index < 0 || index >= board.emojis.length) return false;
    if (board.states[index] === 'matched') return false;
    if (board.flipped.includes(index)) return false;
    if (board.flipped.length >= 2) return false;

    // 'up' = face-up and part of the live pair; client shows the emoji.
    board.states[index] = 'up';
    board.flipped.push(index);
    this.memorize(board, index);
    state.version += 1;

    if (board.flipped.length === 2) {
      const [a, b] = board.flipped;
      const isMatch = board.emojis[a] === board.emojis[b];
      if (isMatch) {
        // Match resolves instantly; the second card is shown on the client via 'up'.
        board.states[a] = 'matched';
        board.states[b] = 'matched';
        board.matchedBy[a] = seat;
        board.matchedBy[b] = seat;
        board.scores[seat] += 1;
        board.matchedPairs += 1;
        for (const known of board.botKnown) {
          for (const k of [a, b]) {
            const pos = known.indexOf(k);
            if (pos >= 0) known.splice(pos, 1);
          }
        }
        board.flipped = [];
        state.scores = [...board.scores];
        state.version += 1;
        this.maybeFinish(state, board);
      } else {
        // Lock the pair; bots must not touch it until it flips back.
        board.resolvedAt = Date.now() + 900;
      }
    }
    return true;
  }

  private memorize(board: MemoryBoard, index: number): void {
    // Bots remember unmatched face-up cards probabilistically by difficulty.
    const remember: Record<NonNullable<SeatInfo['botDifficulty']>, number> = {
      easy: 0.4,
      medium: 0.65,
      hard: 0.85,
      expert: 1.0,
    };
    board.botSeats.forEach((isBot, seat) => {
      if (!isBot) return;
      if (board.states[index] === 'matched') return;
      if (!board.botKnown[seat].includes(index) && Math.random() < (remember[board.botDifficulty[seat] ?? 'medium'])) {
        board.botKnown[seat].push(index);
      }
      // The bot also glimpses the partner card of the live pair.
      const partner = board.flipped.find((f) => f !== index);
      if (
        partner !== undefined &&
        board.states[partner] === 'up' &&
        !board.botKnown[seat].includes(partner) &&
        Math.random() < (remember[board.botDifficulty[seat] ?? 'medium'])
      ) {
        board.botKnown[seat].push(partner);
      }
    });
  }

  tick(state: GameState, now: Date): GameState {
    if (state.phase !== 'in_progress') return state;
    const board = state.board as unknown as MemoryBoard;
    const t = now.getTime();

    // Resolve a non-matching pair (flip back).
    if (board.resolvedAt != null && board.flipped.length === 2 && t >= board.resolvedAt) {
      for (const i of board.flipped) board.states[i] = 'down';
      board.flipped = [];
      board.resolvedAt = null;
      state.version += 1;
    }

    // Bots act only while no pair is mid-resolution.
    if (board.flipped.length < 2 && board.resolvedAt == null) {
      let pairOpen = board.flipped.length;
    board.botSeats.forEach((isBot, seat) => {
        if (!isBot) return;
        if (t < board.botFlipAt[seat]) return;
        // A non-matching pair is awaiting its flip-back: table is locked.
        if (board.resolvedAt != null) return;
        // At most two flips per tick — a complete pair then waits for resolve.
        if (pairOpen >= 2) return;
        const move = this.botPick(board, seat);
        if (move >= 0 && this.flipCard(state, seat, move)) {
          pairOpen = board.flipped.length === 0 ? 0 : pairOpen + 1;
          board.botFlipAt[seat] = t + this.botDelay(board, seat);
        } else {
          board.botFlipAt[seat] = t + 1200;
        }
      });
    }

    // Timeout end.
    if (t >= new Date(board.roundEndsAt).getTime()) {
      this.finishByScores(state, board);
    }
    return state;
  }

  private botDelay(board: MemoryBoard, seat: number): number {
    const base: Record<NonNullable<SeatInfo['botDifficulty']>, number> = {
      easy: 2600,
      medium: 1800,
      hard: 1200,
      expert: 800,
    };
    return base[board.botDifficulty[seat] ?? 'medium'] + Math.floor(Math.random() * 700);
  }

  /** Bot chooses a card: complete a remembered match if possible, else reveal an unknown card. */
  private botPick(board: MemoryBoard, seat: number): number {
    const known = board.botKnown[seat];

    // If a card is already face-up (open pair), its match — if remembered —
    // wins the pair this tick.
    if (board.flipped.length === 1) {
      const open = board.flipped[0];
      const mate = known.find(
        (idx) => idx !== open && board.states[idx] === 'down' && board.emojis[idx] === board.emojis[open],
      );
      if (mate !== undefined) return mate;
    }

    // Find a remembered pair (two seen positions sharing an emoji) to raise.
    for (let i = 0; i < known.length; i++) {
      for (let j = i + 1; j < known.length; j++) {
        const a = known[i];
        const b = known[j];
        if (board.states[a] === 'down' && board.states[b] === 'down' && board.emojis[a] === board.emojis[b]) {
          return board.flipped.includes(a) ? b : a;
        }
      }
    }
    // Otherwise flip a random unseen card.
    const down = board.states
      .map((s, idx) => (s === 'down' && !board.flipped.includes(idx) && !known.includes(idx) ? idx : -1))
      .filter((idx) => idx >= 0);
    if (down.length > 0) return down[Math.floor(Math.random() * down.length)];
    // Fallback: any down card.
    const anyDown = board.states.map((s, idx) => (s === 'down' && !board.flipped.includes(idx) ? idx : -1)).filter((i) => i >= 0);
    return anyDown.length > 0 ? anyDown[0] : -1;
  }

  private maybeFinish(state: GameState, board: MemoryBoard): void {
    const allMatched = board.states.every((s) => s === 'matched');
    if (allMatched) this.finishByScores(state, board);
  }

  private finishByScores(state: GameState, board: MemoryBoard): void {
    if (state.phase === 'completed') return;
    const max = Math.max(...board.scores);
    const leaders = board.scores.map((s, i) => (s === max && max > 0 ? i : -1)).filter((i) => i >= 0);
    state.scores = [...board.scores];
    state.phase = 'completed';
    state.currentSeat = -1;
    state.winnerSeat = leaders[0] ?? null;
    state.winnerSeats = leaders;
    state.version += 1;
  }

  canSeatAct(state: GameState, action: GameAction): boolean {
    if (state.phase !== 'in_progress') return false;
    return action.type === 'flip' && action.seat >= 0;
  }

  chooseBotMove(): BotMove {
    return { action: { seat: -1, type: '__noop__', payload: {} }, delayMs: 0 };
  }

  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as MemoryBoard;
    // Down cards must never reveal their emoji: clients get it only for cards
    // that are face-up (part of the live pair) or permanently matched.
    const publicEmojis = board.emojis.map((emoji, i) =>
      board.states[i] === 'up' || board.states[i] === 'matched' ? emoji : null,
    );
    const safe: Record<string, unknown> = {
      emojis: publicEmojis,
      states: board.states,
      matchedBy: board.matchedBy,
      flipped: board.flipped,
      scores: board.scores,
      matchedPairs: board.matchedPairs,
      roundEndsAt: board.roundEndsAt,
    };
    return { ...state, board: safe };
  }
}
