import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface SketchStroke {
  color: string;
  width: number;
  points: Array<[number, number]>; // normalised 0..1 coordinates
}

interface SketchPlayer {
  score: number;
  guessed: boolean;
  isBot: boolean;
  name: string;
}

interface SketchBoard extends Record<string, unknown> {
  players: SketchPlayer[];
  round: number;
  totalRounds: number;
  drawerSeat: number;
  word: string;
  // Shown to guessers: e.g. "_ _ _ _ _" with revealed letters.
  revealed: string[];
  strokes: SketchStroke[];
  currentStroke: SketchStroke | null;
  phase: 'draw' | 'reveal' | 'ended';
  phaseEndsAt: string | null;
  roundMs: number;
  // Secret words per drawer round (simple pool).
  guesses: Array<{ seat: number; text: string; correct: boolean }>,
  botDifficulty: Array<SeatInfo['botDifficulty']>;
}

const WORD_POOL = [
  'cat', 'house', 'guitar', 'rocket', 'banana', 'umbrella', 'bicycle', 'mountain',
  'candle', 'pirate', 'flower', 'laptop', 'pizza', 'dragon', 'umbrella', 'bridge',
];

/**
 * Sketch & Guess for 3–6 players, run LIVE. One player draws a secret word on a
 * shared canvas (strokes broadcast to everyone); the others guess in chat-like
 * actions. Correct guessers and the drawer score points. Rotate the drawer each
 * round. Bots both draw simple shapes and guess — their guesses are hidden
 * until they "guess correctly" (auto-solved after a skill-scaled delay). Humans
 * submit text guesses; an exact match scores.
 */
@Injectable()
export class SketchEngine extends BaseGameEngine {
  readonly slug = 'sketch_guess';
  readonly minPlayers = 3;
  readonly maxPlayers = 6;
  readonly isLive = true;

  createInitialState(config: MatchConfig): GameState {
    const seats = config.seats;
    const totalRounds = seats.length; // everyone draws once
    const board: SketchBoard = {
      players: seats.map((s) => ({ score: 0, guessed: false, isBot: s.isBot, name: s.displayName })),
      round: 1,
      totalRounds,
      drawerSeat: 0,
      word: this.pickWord(0),
      revealed: [],
      strokes: [],
      currentStroke: null,
      phase: 'draw',
      phaseEndsAt: new Date(Date.now() + 30000).toISOString(),
      roundMs: 30000,
      guesses: [],
      botDifficulty: seats.map((s) => s.botDifficulty ?? 'medium'),
    };
    board.revealed = this.mask(board.word);
    const state: GameState = {
      phase: 'in_progress',
      turn: 0,
      currentSeat: 0, // drawer
      turnStartedAt: new Date().toISOString(),
      seats: seats.map((s, i) => ({
        seatNumber: i,
        playerId: s.playerId,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        connected: true,
        score: 0,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: seats.map(() => 0),
      version: 1,
    };
    return state;
  }

  private pickWord(seed: number): string {
    return WORD_POOL[seed % WORD_POOL.length];
  }

  private mask(word: string): string[] {
    return word.split('').map((c) => (c === ' ' ? ' ' : '_'));
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is over.' };
    const board = state.board as unknown as SketchBoard;
    if (action.type === 'draw') {
      if (action.seat !== board.drawerSeat) return { ok: false, error: 'Only the drawer can draw.' };
      if (board.phase !== 'draw') return { ok: false, error: 'The round has ended.' };
      return { ok: true };
    }
    if (action.type === 'guess') {
      if (action.seat === board.drawerSeat) return { ok: false, error: 'The drawer cannot guess.' };
      if (board.phase !== 'draw') return { ok: false, error: 'The round has ended.' };
      const text = String((action.payload as { text?: unknown }).text ?? '').trim().toLowerCase();
      if (!text) return { ok: false, error: 'Type a guess.' };
      return { ok: true };
    }
    if (action.type === 'clear') {
      if (action.seat !== board.drawerSeat) return { ok: false, error: 'Only the drawer can clear.' };
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const board = state.board as unknown as SketchBoard;

    if (action.type === 'clear') {
      board.strokes = [];
      board.currentStroke = null;
      state.version += 1;
      return state;
    }

    if (action.type === 'draw') {
      const payload = action.payload as {
        stroke?: SketchStroke;
        point?: [number, number];
        color?: string;
        width?: number;
        end?: boolean;
      };
      if (payload.stroke) {
        board.strokes.push(payload.stroke);
      } else if (payload.point) {
        if (!board.currentStroke) {
          board.currentStroke = {
            color: payload.color ?? '#00E5FF',
            width: payload.width ?? 4,
            points: [payload.point],
          };
        } else {
          board.currentStroke.points.push(payload.point);
        }
        if (payload.end) {
          board.strokes.push(board.currentStroke);
          board.currentStroke = null;
        }
      } else if (payload.end && board.currentStroke) {
        // Close the in-progress stroke without adding a point.
        board.strokes.push(board.currentStroke);
        board.currentStroke = null;
      }
      state.version += 1;
      return state;
    }

    if (action.type === 'guess') {
      const text = String((action.payload as { text: string }).text).trim().toLowerCase();
      const correct = text === board.word.toLowerCase();
      board.guesses.push({ seat: action.seat, text, correct });
      if (correct) {
        board.players[action.seat].guessed = true;
        // Faster guess → more points; drawer also rewarded.
        const timeBonus = this.timeBonus(board);
        board.players[action.seat].score += 100 + timeBonus;
        board.players[board.drawerSeat].score += 50;
        this.reveal(board, board.word);
        state.version += 1;
        // Round ends early once all non-drawers have guessed.
        const guessers = board.players.map((_, i) => i).filter((i) => i !== board.drawerSeat);
        if (guessers.every((i) => board.players[i].guessed)) {
          this.endRound(state, board);
        }
      } else {
        state.version += 1; // broadcast the (incorrect) guess to the room
      }
      return state;
    }
    return state;
  }

  private timeBonus(board: SketchBoard): number {
    if (!board.phaseEndsAt) return 0;
    const remain = new Date(board.phaseEndsAt).getTime() - Date.now();
    return Math.max(0, Math.round((remain / board.roundMs) * 100));
  }

  private reveal(board: SketchBoard, word: string): void {
    board.revealed = word.split('').map((c) => (c === ' ' ? ' ' : c));
  }

  tick(state: GameState, now: Date): GameState {
    if (state.phase !== 'in_progress') return state;
    const board = state.board as unknown as SketchBoard;
    if (board.phase !== 'draw') {
      // reveal phase short pause then next round
      if (board.phaseEndsAt && now.getTime() >= new Date(board.phaseEndsAt).getTime()) {
        this.nextRound(state, board);
      }
      return state;
    }
    // Bots: drawer scribbles; guessers "solve" after a skill-scaled delay.
    this.botsAct(state, board, now);
    if (board.phaseEndsAt && now.getTime() >= new Date(board.phaseEndsAt).getTime()) {
      this.endRound(state, board);
    }
    return state;
  }

  private botsAct(state: GameState, board: SketchBoard, now: Date): void {
    const drawer = board.players[board.drawerSeat];
    // Bot drawer scribbles a few strokes early on (purely cosmetic).
    if (drawer.isBot && board.strokes.length < 3 && Math.random() < 0.15) {
      const cx = 0.3 + Math.random() * 0.4;
      const cy = 0.3 + Math.random() * 0.4;
      const points: Array<[number, number]> = [];
      const radius = 0.1 + Math.random() * 0.15;
      for (let a = 0; a <= Math.PI; a += Math.PI / 8) {
        points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
      }
      board.strokes.push({ color: '#7B5CFF', width: 4, points });
      state.version += 1;
    }
    // Bot guessers: each solves once, later for weaker bots and never instantly.
    for (let i = 0; i < board.players.length; i++) {
      if (i === board.drawerSeat) continue;
      const p = board.players[i];
      if (!p.isBot || p.guessed) continue;
      const difficulty = board.botDifficulty[i] ?? 'medium';
      const solveMs = difficulty === 'easy' ? 26000 : difficulty === 'medium' ? 20000 : difficulty === 'hard' ? 14000 : 9000;
      const roundMs = 30000;
      const elapsed = roundMs - (new Date(board.phaseEndsAt!).getTime() - now.getTime());
      if (elapsed > solveMs && Math.random() < 0.2) {
        board.guesses.push({ seat: i, text: board.word, correct: true });
        board.players[i].guessed = true;
        board.players[i].score += 60 + this.timeBonus(board);
        board.players[board.drawerSeat].score += 40;
        this.reveal(board, board.word);
        state.version += 1;
        const guessers = board.players.map((_, k) => k).filter((k) => k !== board.drawerSeat);
        if (guessers.every((k) => board.players[k].guessed)) {
          this.endRound(state, board);
          return;
        }
      }
    }
  }

  private endRound(state: GameState, board: SketchBoard): void {
    board.phase = 'reveal';
    this.reveal(board, board.word);
    board.phaseEndsAt = new Date(Date.now() + 3000).toISOString();
    state.version += 1;
  }

  private nextRound(state: GameState, board: SketchBoard): void {
    if (board.round >= board.totalRounds) {
      board.phase = 'ended';
      const best = Math.max(...board.players.map((p) => p.score));
      const winners = board.players.map((p, i) => (p.score === best ? i : -1)).filter((i) => i >= 0);
      state.phase = 'completed';
      state.winnerSeat = winners[0];
      state.winnerSeats = winners;
      state.currentSeat = -1;
      state.scores = board.players.map((p) => p.score);
      state.version += 1;
      return;
    }
    board.round += 1;
    board.drawerSeat = (board.drawerSeat + 1) % board.players.length;
    board.word = this.pickWord(board.round * 7 + board.drawerSeat);
    board.revealed = this.mask(board.word);
    board.strokes = [];
    board.currentStroke = null;
    board.guesses = [];
    board.players.forEach((p) => (p.guessed = false));
    board.phase = 'draw';
    board.phaseEndsAt = new Date(Date.now() + board.roundMs).toISOString();
    state.currentSeat = board.drawerSeat;
    state.version += 1;
  }

  /** Live drawing game: the drawer draws/clears; everyone else guesses. */
  canSeatAct(state: GameState, action: GameAction): boolean {
    if (state.phase !== 'in_progress') return false;
    const board = state.board as unknown as SketchBoard;
    if (action.type === 'draw' || action.type === 'clear') {
      return action.seat === board.drawerSeat;
    }
    if (action.type === 'guess') {
      return action.seat >= 0 && action.seat !== board.drawerSeat && !board.players[action.seat]?.guessed;
    }
    return false;
  }

  chooseBotMove(): BotMove {
    return { action: { seat: -1, type: '__noop__', payload: {} }, delayMs: 0 };
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as SketchBoard;
    const isDrawer = seat === board.drawerSeat;
    const safe: Record<string, unknown> = {
      round: board.round,
      totalRounds: board.totalRounds,
      drawerSeat: board.drawerSeat,
      phase: board.phase,
      phaseEndsAt: board.phaseEndsAt,
      strokes: board.strokes,
      currentStroke: board.currentStroke,
      // Word is secret to guessers; the drawer sees it.
      word: isDrawer ? board.word : null,
      revealed: board.revealed,
      scores: board.players.map((p) => p.score),
      guessed: board.players.map((p) => p.guessed),
      // Correct guesses reveal the word to everyone (the round ends on a
      // solve), so the text is masked to avoid leaking the answer before the
      // reveal phase — but the `correct` flag is kept so clients can highlight
      // winning guesses in the feed.
      guesses: board.guesses.map((g) => ({ seat: g.seat, correct: g.correct, text: g.correct ? '✅' : g.text })),
    };
    return { ...state, board: safe };
  }
}
