import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface HangmanBoard extends Record<string, unknown> {
  /** 1-based round; ROUNDS words a game. */
  round: number;
  /** The secret word — server-only, stripped from every view. */
  secret: string;
  /** Public: one slot per letter, '_' until guessed. */
  masked: string[];
  /** Wrong letters this word. */
  wrong: string[];
  /** The word that just ended, for the reveal banner. */
  revealedWord: string | null;
  log: string[];
}

const ROUNDS = 3;
const MAX_WRONG = 6;

/** Common words, four to nine letters, no repeats, all lowercase a-z. */
export const HANGMAN_WORDS = [
  'anchor', 'balcony', 'captain', 'diamond', 'engine', 'falcon', 'garden', 'harbour',
  'island', 'jacket', 'kettle', 'lantern', 'marble', 'napkin', 'orchid', 'pencil',
  'quartz', 'rocket', 'saddle', 'tunnel', 'ultra', 'velvet', 'walnut', 'yellow',
  'zephyr', 'bridge', 'castle', 'dragon', 'eagle', 'forest', 'glacier', 'hammer',
  'igloo', 'jungle', 'kingdom', 'ladder', 'magnet', 'needle', 'office', 'palace',
  'queen', 'river', 'sailor', 'temple', 'unicorn', 'violin', 'window', 'yogurt',
  'zebra', 'candle', 'dinner', 'ferment', 'guitar', 'honey', 'iceberg', 'joker',
  'koala', 'lemon', 'mirror', 'nova',
];

/** Letter frequency order for the bots. */
const FREQUENCY = 'etaoinshrdlcumwfgypbvkjxqz';

function isLetter(c: unknown): c is string {
  return typeof c === 'string' && /^[a-z]$/.test(c);
}

/**
 * Competitive Hangman for two to four players, wave-6 build.
 *
 * Three secret words, one gallows. Players guess letters in seat rotation:
 * each hit is worth ten points a letter (repeats count), finishing a word
 * pays a twenty-five point bonus, and each miss draws the figure one stroke
 * closer to done and costs five points. Six misses and the word is revealed
 * unbought. The word itself is sealed server-side — every view sees only the
 * masked slots. After three words the high score wins.
 *
 * Bots play the frequencies — easy players stab randomly, experts peel off
 * the commonest unguessed letter.
 */
@Injectable()
export class HangmanEngine extends BaseGameEngine {
  readonly slug = 'hangman';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const secret = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
    const board: HangmanBoard = {
      round: 1,
      secret,
      masked: secret.split('').map(() => '_'),
      wrong: [],
      revealedWord: null,
      log: [`Word 1 of ${ROUNDS}: ${secret.length} letters — guess away.`],
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
    if (action.type !== 'guess') return { ok: false, error: 'Guess a letter.' };
    const board = state.board as unknown as HangmanBoard;
    const letter = action.payload.letter;
    if (!isLetter(letter)) return { ok: false, error: 'One lowercase letter, a to z.' };
    if (board.wrong.includes(letter) || board.masked.includes(letter)) {
      return { ok: false, error: 'That letter is already on the table.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid guess.');
    const next = this.clone(state);
    const board = next.board as unknown as HangmanBoard;
    const seat = action.seat;
    const letter = action.payload.letter as string;
    next.version += 1;

    const hits = board.secret.split('').filter((c) => c === letter).length;
    if (hits > 0) {
      board.masked = board.secret
        .split('')
        .map((c, i) => (c === letter || board.masked[i] !== '_') ? c : '_');
      next.scores[seat] += 10 * hits;
      board.log.push(`Seat ${seat + 1} guesses '${letter}' — ${hits} hit${hits === 1 ? '' : 's'}! +${10 * hits}`);
      if (!board.masked.includes('_')) {
        next.scores[seat] += 25;
        board.revealedWord = board.secret;
        board.log.push(`The word was '${board.secret}' — Seat ${seat + 1} finishes it for +25!`);
        return this.advanceRound(next, board);
      }
    } else {
      board.wrong.push(letter);
      next.scores[seat] -= 5;
      board.log.push(`Seat ${seat + 1} guesses '${letter}' — miss. ${MAX_WRONG - board.wrong.length} stroke${MAX_WRONG - board.wrong.length === 1 ? '' : 's'} left.`);
      if (board.wrong.length >= MAX_WRONG) {
        board.revealedWord = board.secret;
        board.log.push(`The figure is complete — the word was '${board.secret}'.`);
        return this.advanceRound(next, board);
      }
    }

    next.currentSeat = (seat + 1) % next.seats.length;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as HangmanBoard;
    const taken = new Set<string>([...board.wrong, ...board.masked.filter((c) => c !== '_')]);
    const open = FREQUENCY.split('').filter((c) => !taken.has(c));
    let letter: string;
    if (difficulty === 'easy') {
      letter = open[Math.floor(Math.random() * open.length)];
    } else {
      const spread = difficulty === 'medium' ? 8 : difficulty === 'hard' ? 3 : 0;
      letter = open[Math.min(open.length - 1, Math.floor(Math.random() * (spread + 1)))];
    }
    return {
      action: { seat, type: 'guess', payload: { letter } },
      delayMs: this.think(difficulty),
    };
  }

  protected redactHidden(state: GameState, _seat: number): GameState {
    const view = this.clone(state);
    const board = view.board as unknown as HangmanBoard;
    // The secret never leaves the server — masked slots carry the public view.
    board.secret = '';
    return view;
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private advanceRound(next: GameState, board: HangmanBoard): GameState {
    if (board.round >= ROUNDS) {
      this.finish(next);
      return next;
    }
    board.round += 1;
    const secret = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
    board.secret = secret;
    board.masked = secret.split('').map(() => '_');
    board.wrong = [];
    // revealedWord keeps the word that just ended — the banner for the new round.
    board.log.push(`Word ${board.round} of ${ROUNDS}: ${secret.length} letters.`);
    next.currentSeat = 0;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  private finish(state: GameState): void {
    const totals = [...state.scores];
    const max = Math.max(...totals);
    const leaders = totals.map((s, i) => ({ s, i })).filter((x) => x.s === max).map((x) => x.i);
    state.phase = 'completed';
    state.currentSeat = -1;
    if (leaders.length === 1) {
      state.winnerSeat = leaders[0];
      (state as unknown as { winnerSeats?: number[] }).winnerSeats = undefined;
    } else {
      state.winnerSeat = null;
      (state as unknown as { winnerSeats?: number[] }).winnerSeats = leaders;
    }
    state.seats = state.seats.map((s, i) => ({ ...s, score: totals[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty']): number {
    const base = difficulty === 'easy' ? 1400 : difficulty === 'medium' ? 1100 : difficulty === 'hard' ? 900 : 750;
    return base + Math.floor(Math.random() * 600);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as HangmanBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        masked: [...board.masked],
        wrong: [...board.wrong],
        log: [...board.log],
      } as unknown as Record<string, unknown>,
    };
  }
}
