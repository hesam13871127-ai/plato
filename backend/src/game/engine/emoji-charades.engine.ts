import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface Charade {
  word: string;
  hints: string[]; // emojis revealed one at a time
  category: string;
}

const CHARADES: Charade[] = [
  { word: 'cat', category: 'Animal', hints: ['🐱', '🐟', '🧶'] },
  { word: 'dog', category: 'Animal', hints: ['🐶', '🦴', '🎾'] },
  { word: 'lion', category: 'Animal', hints: ['🦁', '👑', '🌍'] },
  { word: 'fish', category: 'Animal', hints: ['🐟', '🎣', '🌊'] },
  { word: 'bee', category: 'Animal', hints: ['🐝', '🍯', '🌸'] },
  { word: 'pizza', category: 'Food', hints: ['🍕', '🧀', '🍅'] },
  { word: 'coffee', category: 'Drink', hints: ['☕', '😴', '🌅'] },
  { word: 'cake', category: 'Food', hints: ['🎂', '🕯️', '🎉'] },
  { word: 'rain', category: 'Weather', hints: ['🌧️', '☔', '☁️'] },
  { word: 'sun', category: 'Weather', hints: ['☀️', '😎', '🏖️'] },
  { word: 'snow', category: 'Weather', hints: ['❄️', '⛄', '🧤'] },
  { word: 'heart', category: 'Feeling', hints: ['❤️', '😍', '💘'] },
  { word: 'sleep', category: 'Action', hints: ['😴', '🛏️', '🌙'] },
  { word: 'music', category: 'Hobby', hints: ['🎵', '🎧', '🎸'] },
  { word: 'soccer', category: 'Sport', hints: ['⚽', '🥅', '👟'] },
  { word: 'basketball', category: 'Sport', hints: ['🏀', '🏆', '🧑‍🦱'] },
  { word: 'movie', category: 'Fun', hints: ['🎬', '🍿', '🎥'] },
  { word: 'rocket', category: 'Space', hints: ['🚀', '🌕', '👨‍🚀'] },
  { word: 'ghost', category: 'Spooky', hints: ['👻', '🏚️', '😱'] },
  { word: 'gift', category: 'Object', hints: ['🎁', '🎀', '🎄'] },
  { word: 'fire', category: 'Nature', hints: ['🔥', '🚒', '🌭'] },
  { word: 'tree', category: 'Nature', hints: ['🌳', '🍃', '🪓'] },
];

interface CharadePlayer {
  score: number;
}

interface CharadeBoard extends Record<string, unknown> {
  round: number;
  target: number;
  performerSeat: number;
  category: string;
  revealedEmojis: string[];
  emojis: string[];
  winnerSeat: number | null;
  winnerWord: string | null;
  roundStartedAt: string;
  revealEndsAt: string;
  revealStepMs: number;
  nextRevealAt: number;
  revealIndex: number;
  players: CharadePlayer[];
  // server-only
  answer: string;
  order: number[];
  botSeats: boolean[];
  botGuessAt: number[];
  botDifficulty: Array<SeatInfo['botDifficulty']>;
}

/**
 * Emoji Charades — a live party game for 3–6 players. Each round one player is
 * the "performer": emojis that hint at a secret word are revealed one by one.
 * Everyone else races to guess the word in chat; the first correct guess
 * scores, the performer scores too. Rounds rotate the performer. Bot performers
 * reveal clues on a timer; bot guessers fire in at a difficulty-scaled time.
 */
@Injectable()
export class EmojiCharadesEngine extends BaseGameEngine {
  readonly slug = 'emoji_charades';
  readonly minPlayers = 3;
  readonly maxPlayers = 6;
  readonly isLive = true;

  private static readonly ROUNDS = 6;
  private static readonly ROUND_MS = 22000;
  private static readonly REVEAL_STEP_MS = 5000;
  private static readonly GUESSER_POINTS = 100;
  private static readonly PERFORMER_POINTS = 60;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    const start = Date.now();
    const board = this.buildBoard(config, n, start, 0, this.shuffledOrder());
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

  private shuffledOrder(): number[] {
    const order = CHARADES.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }

  private buildBoard(config: MatchConfig, n: number, start: number, round: number, order: number[]): CharadeBoard {
    const charade = CHARADES[order[round % order.length]];
    const performerSeat = round % n;
    return {
      round: round + 1,
      target: EmojiCharadesEngine.ROUNDS,
      performerSeat,
      category: charade.category,
      revealedEmojis: [charade.hints[0]],
      emojis: charade.hints,
      winnerSeat: null,
      winnerWord: null,
      roundStartedAt: new Date(start).toISOString(),
      revealEndsAt: new Date(start + EmojiCharadesEngine.ROUND_MS).toISOString(),
      revealStepMs: EmojiCharadesEngine.REVEAL_STEP_MS,
      nextRevealAt: start + EmojiCharadesEngine.REVEAL_STEP_MS,
      revealIndex: 0,
      players: Array.from({ length: n }, () => ({ score: 0 })),
      answer: charade.word,
      order,
      botSeats: config.seats.map((s) => s.isBot),
      botGuessAt: config.seats.map((s, i) =>
        s.isBot && i !== performerSeat ? start + 7000 + ((i * 1531 + round * 997) % 13000) : Number.POSITIVE_INFINITY,
      ),
      botDifficulty: config.seats.map((s) => s.botDifficulty ?? 'medium'),
    };
  }

  private normalize(word: string): string {
    return word.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    const board = state.board as unknown as CharadeBoard;
    if (action.type === 'guess') {
      if (action.seat < 0 || action.seat >= board.players.length) return { ok: false, error: 'Not a seat.' };
      if (action.seat === board.performerSeat) return { ok: false, error: 'The performer cannot guess.' };
      if (board.winnerSeat != null) return { ok: false, error: 'This round is already won.' };
      const word = this.normalize(String(action.payload['word'] ?? ''));
      if (word.length < 2) return { ok: false, error: 'Type a guess.' };
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid guess.');
    if (action.type === 'guess') {
      this.submitGuess(state, action.seat, String(action.payload['word'] ?? ''));
    }
    return state;
  }

  /** Internal guess resolution shared by human actions and bot ticks (never throws). */
  private submitGuess(state: GameState, seat: number, rawWord: string): void {
    const board = state.board as unknown as CharadeBoard;
    if (state.phase !== 'in_progress' || board.winnerSeat != null) return;
    if (seat < 0 || seat >= board.players.length || seat === board.performerSeat) return;
    const word = this.normalize(rawWord);
    if (word.length < 2) return;
    if (word === this.normalize(board.answer)) {
      board.winnerSeat = seat;
      board.winnerWord = board.answer;
      board.players[seat].score += EmojiCharadesEngine.GUESSER_POINTS;
      board.players[board.performerSeat].score += EmojiCharadesEngine.PERFORMER_POINTS;
      state.scores = board.players.map((p) => p.score);
      // Move to the reveal/settle immediately; the next round starts after a beat.
      board.revealEndsAt = new Date(Date.now() + 2200).toISOString();
      board.nextRevealAt = Number.POSITIVE_INFINITY;
      state.version += 1;
    }
  }

  tick(state: GameState, now: Date): GameState {
    if (state.phase !== 'in_progress') return state;
    const board = state.board as unknown as CharadeBoard;;
    const t = now.getTime();

    // Bot performer reveals the next emoji clue on schedule.
    if (board.winnerSeat == null && board.botSeats[board.performerSeat] && t >= board.nextRevealAt) {
      if (board.revealIndex + 1 < board.emojis.length) {
        board.revealIndex += 1;
        board.revealedEmojis = board.emojis.slice(0, board.revealIndex + 1);
        board.nextRevealAt = t + EmojiCharadesEngine.REVEAL_STEP_MS;
        state.version += 1;
      } else {
        board.nextRevealAt = Number.POSITIVE_INFINITY;
      }
    } else if (board.winnerSeat == null && !board.botSeats[board.performerSeat] && t >= board.nextRevealAt) {
      // Human performer: clues still auto-reveal so the round never stalls.
      if (board.revealIndex + 1 < board.emojis.length) {
        board.revealIndex += 1;
        board.revealedEmojis = board.emojis.slice(0, board.revealIndex + 1);
        board.nextRevealAt = t + EmojiCharadesEngine.REVEAL_STEP_MS;
        state.version += 1;
      } else {
        board.nextRevealAt = Number.POSITIVE_INFINITY;
      }
    }

    // Bot guessers: after enough clues are revealed they may solve it.
    if (board.winnerSeat == null) {
      board.players.forEach((_, seat) => {
        if (board.winnerSeat != null) return; // round solved earlier in this tick
        if (seat === board.performerSeat) return;
        if (!board.botSeats[seat]) return;
        if (t < board.botGuessAt[seat]) return;
        const solveChance = this.botSolveChance(board, seat);
        if (Math.random() < solveChance) {
          this.submitGuess(state, seat, board.answer);
        }
        // Push the bot's next attempt window forward so it does not spam.
        board.botGuessAt[seat] = t + 6000;
      });
    }

    // Round end.
    if (t >= new Date(board.revealEndsAt).getTime()) {
      this.advance(state);
    }
    return state;
  }

  private botSolveChance(board: CharadeBoard, seat: number): number {
    const clues = board.revealIndex + 1;
    const base: Record<NonNullable<SeatInfo['botDifficulty']>, number> = {
      easy: 0.15,
      medium: 0.3,
      hard: 0.5,
      expert: 0.68,
    };
    const diff = board.botDifficulty[seat] ?? 'medium';
    return Math.min(0.95, base[diff] * (0.5 + clues * 0.45));
  }

  private advance(state: GameState): void {
    const board = state.board as unknown as CharadeBoard;
    if (board.round >= board.target) {
      const max = Math.max(...board.players.map((p) => p.score));
      const leaders = board.players.map((p, i) => (p.score === max ? i : -1)).filter((i) => i >= 0);
      state.scores = board.players.map((p) => p.score);
      state.phase = 'completed';
      state.currentSeat = -1;
      state.winnerSeat = leaders[0] ?? null;
      state.winnerSeats = leaders;
      state.version += 1;
      return;
    }
    const totals = board.players.map((p) => p.score);
    const next = this.buildBoard(
      {
        matchId: '',
        gameSlug: this.slug,
        seats: state.seats.map((s, i) => ({
          playerId: s.playerId,
          seatNumber: i,
          isBot: board.botSeats[i],
          botDifficulty: board.botDifficulty[i],
          displayName: s.displayName,
          avatarUrl: s.avatarUrl,
        })),
        isLive: true,
      },
      board.players.length,
      Date.now(),
      board.round,
      board.order,
    );
    next.players.forEach((p, i) => (p.score = totals[i]));
    state.board = next as unknown as Record<string, unknown>;
    state.turn += 1;
    state.version += 1;
  }

  canSeatAct(state: GameState, action: GameAction): boolean {
    if (state.phase !== 'in_progress') return false;
    return action.type === 'guess' && action.seat >= 0;
  }

  chooseBotMove(): BotMove {
    return { action: { seat: -1, type: '__noop__', payload: {} }, delayMs: 0 };
  }

  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as CharadeBoard;
    const safe: Record<string, unknown> = {
      round: board.round,
      target: board.target,
      performerSeat: board.performerSeat,
      category: board.category,
      revealedEmojis: board.revealedEmojis,
      winnerSeat: board.winnerSeat,
      winnerWord: board.winnerWord,
      revealEndsAt: board.revealEndsAt,
      players: board.players.map((p) => ({ score: p.score })),
    };
    return { ...state, board: safe };
  }
}
