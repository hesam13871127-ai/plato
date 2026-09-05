import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';
import { WORD_SET } from './word-bank';

interface WordChainPlayer {
  lives: number;
  alive: boolean;
}

interface WordChainBoard extends Record<string, unknown> {
  players: WordChainPlayer[];
  lastWord: string;
  chain: string[];
  requiredFirstLetter: string | null;
  // server-only
  used: string[];
  botSeats: boolean[];
  botDifficulty: Array<SeatInfo['botDifficulty']>;
}

const MAX_LIVES = 3;
const ORDER = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Word Chain — a fast turn-based word game for 2–6 players. On your turn you
 * say a word that begins with the last letter of the previous word; words
 * cannot be reused and must be real (validated against the shared word bank).
 * A wrong word or a pass costs a life. When only one player remains they win.
 * The first turn accepts any starting word. Bots always pick a legal word from
 * the bank (they never pass), so the human is eliminated only by their own
 * mistakes.
 */
@Injectable()
export class WordChainEngine extends BaseGameEngine {
  readonly slug = 'word_chain';
  readonly minPlayers = 2;
  readonly maxPlayers = 6;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    const board: WordChainBoard = {
      players: config.seats.map(() => ({ lives: MAX_LIVES, alive: true })),
      lastWord: '',
      chain: [],
      requiredFirstLetter: null,
      used: [],
      botSeats: config.seats.map((s) => s.isBot),
      botDifficulty: config.seats.map((s) => s.botDifficulty ?? 'medium'),
    };
    const first = 0;
    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: first,
      turnStartedAt: new Date().toISOString(),
      seats: config.seats.map((s, i) => ({
        seatNumber: i,
        playerId: s.playerId,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        connected: true,
        score: MAX_LIVES,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: config.seats.map(() => MAX_LIVES),
      version: 1,
    };
  }

  private normalize(word: string): string {
    return word.toLowerCase().trim().replace(/[^a-z]/g, '');
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    const board = state.board as unknown as WordChainBoard;
    const seat = action.seat;
    if (!board.players[seat]?.alive) return { ok: false, error: 'You are out of the game.' };

    if (action.type === 'word') {
      const word = this.normalize(String(action.payload['word'] ?? ''));
      if (word.length < 2) return { ok: false, error: 'Enter a longer word.' };
      if (board.used.includes(word)) return { ok: false, error: 'That word was already used.' };
      if (!WORD_SET.has(word)) return { ok: false, error: 'Not a recognized word.' };
      if (board.requiredFirstLetter && word[0] !== board.requiredFirstLetter) {
        return { ok: false, error: `Word must start with "${board.requiredFirstLetter}".` };
      }
      return { ok: true };
    }
    if (action.type === 'pass') {
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid move.');
    const board = state.board as unknown as WordChainBoard;
    const seat = action.seat;

    if (action.type === 'word') {
      const word = this.normalize(String(action.payload['word']));
      board.lastWord = word;
      board.chain.push(word);
      board.used.push(word);
      board.requiredFirstLetter = this.nextStartLetter(word);
      state.version += 1;
    } else {
      // pass = lose a life
      this.loseLife(board, seat, state);
    }
    this.advanceTurn(state);
    return state;
  }

  /** The next word must start with this letter (letters with few words skip). */
  private nextStartLetter(word: string): string {
    const last = word[word.length - 1];
    // If there are essentially no bank words starting with the last letter,
    // fall back to any letter so a turn is never impossible.
    const hasWords = [...WORD_SET].some((w) => w[0] === last);
    return hasWords ? last : ORDER[Math.floor(Math.random() * ORDER.length)];
  }

  private loseLife(board: WordChainBoard, seat: number, state: GameState): void {
    const p = board.players[seat];
    p.lives -= 1;
    if (p.lives <= 0) p.alive = false;
    state.seats[seat].score = Math.max(0, p.lives);
    state.scores[seat] = Math.max(0, p.lives);
    state.version += 1;
  }

  private advanceTurn(state: GameState): void {
    const board = state.board as unknown as WordChainBoard;
    const n = board.players.length;
    const aliveSeats = board.players.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0);
    if (aliveSeats.length <= 1) {
      state.phase = 'completed';
      state.currentSeat = -1;
      const winner = aliveSeats[0] ?? -1;
      state.winnerSeat = winner >= 0 ? winner : null;
      state.winnerSeats = winner >= 0 ? [winner] : [];
      state.version += 1;
      return;
    }
    let next = state.currentSeat;
    for (let step = 0; step < n; step++) {
      next = (next + 1) % n;
      if (board.players[next].alive) break;
    }
    state.currentSeat = next;
    state.turnStartedAt = new Date().toISOString();
    state.turn += 1;
    state.version += 1;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as WordChainBoard;
    const startsWith = board.requiredFirstLetter;
    const candidates = [...WORD_SET].filter(
      (w) =>
        !board.used.includes(w) &&
        w.length >= 2 &&
        (!startsWith || w[0] === startsWith) &&
        this.nextStartLetterSafe(w),
    );

    // Skill = chance a bot actually finds a legal word; weaker (or pressure-
    // tested) bots occasionally pass and lose a life so a bot-only table can
    // always reach a winner instead of looping forever.
    const skill: Record<NonNullable<SeatInfo['botDifficulty']>, number> = {
      easy: 0.78,
      medium: 0.86,
      hard: 0.92,
      expert: 0.97,
    };
    if (candidates.length === 0 || Math.random() > skill[difficulty ?? 'medium']) {
      return {
        action: { seat, type: 'pass', payload: {} },
        delayMs: 900 + Math.floor(Math.random() * 800),
      };
    }

    const word = candidates[Math.floor(Math.random() * candidates.length)];
    return {
      action: { seat, type: 'word', payload: { word } },
      delayMs: 900 + Math.floor(Math.random() * 900),
    };
  }

  /** A bot only plays a word that leaves at least one legal follow-up. */
  private nextStartLetterSafe(word: string): boolean {
    const last = word[word.length - 1];
    return [...WORD_SET].some((w) => w[0] === last);
  }

  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as WordChainBoard;
    const safe: Record<string, unknown> = {
      players: board.players.map((p) => ({ lives: p.lives, alive: p.alive })),
      lastWord: board.lastWord,
      chain: board.chain.slice(-12),
      requiredFirstLetter: board.requiredFirstLetter,
    };
    return { ...state, board: safe };
  }
}
