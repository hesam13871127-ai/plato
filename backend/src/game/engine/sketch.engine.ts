import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/** The word pot — forty drawable things. */
export const SKETCH_WORDS = [
  'house', 'cat', 'sun', 'tree', 'fish', 'car', 'star', 'moon', 'apple', 'book',
  'chair', 'clock', 'flower', 'boat', 'cup', 'key', 'glasses', 'hat', 'balloon', 'umbrella',
  'bicycle', 'cloud', 'heart', 'pizza', 'ghost', 'robot', 'rocket', 'snail', 'penguin', 'cactus',
  'lighthouse', 'dinosaur', 'mermaid', 'volcano', 'rainbow', 'snowman', 'crown', 'spider', 'whale', 'castle',
] as const;

interface Stroke {
  color: string;
  points: number[]; // flat [x0, y0, x1, y1, …] normalised to 0..1
}

interface SketchBoard extends Record<string, unknown> {
  /** Shuffled word-pot indexes — which word each round draws. */
  order: number[];
  /** Zero-based round in play. */
  round: number;
  totalRounds: number;
  /** The seat currently holding the brush. */
  artist: number;
  /** The secret word — visible to the artist only while the round is live. */
  word: string;
  /** 'draw' while the artist paints, 'guess' once the guessers are up. */
  subPhase: 'draw' | 'guess';
  /** The submitted artwork, visible to everyone. */
  strokes: Stroke[];
  /** Wrong guesses per seat this round. */
  wrongs: number[];
  /** Guesses this round, newest last. */
  guesses: Array<{ seat: number; word: string; correct: boolean }>;
  /** Revealed rounds. */
  history: Array<{ round: number; artist: number; word: string; winner: number | null }>;
}

const MAX_WRONG = 2;
const GUESSER_POINTS = 10;
const ARTIST_POINTS = 5;

const normalize = (w: string) => w.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Sketch (picture charades) for two to four players, wave-4 rebuild.
 *
 * Each round crowns one artist: they receive a secret word and paint it on a
 * shared canvas (normalised strokes, capped for sanity), then the rest of
 * the table guesses in turns — a correct guess banks ten for the guesser
 * and five for the artist. Two wrong guesses and a guesser is out for the
 * round; when everyone is out the word is revealed and the round moves on.
 * The secret stays hidden from non-artists until the round closes. Every
 * player takes the brush (twice each in a two-player match).
 *
 * Bots scribble an abstract doodle as artists and deduce the word with
 * per-difficulty odds as guessers.
 */
@Injectable()
export class SketchEngine extends BaseGameEngine {
  readonly slug = 'sketch';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const order = SKETCH_WORDS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    const players = config.seats.length;
    const board: SketchBoard = {
      order,
      round: 0,
      totalRounds: players === 2 ? 4 : players,
      artist: 0,
      word: SKETCH_WORDS[order[0]],
      subPhase: 'draw',
      strokes: [],
      wrongs: config.seats.map(() => 0),
      guesses: [],
      history: [],
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
    const board = state.board as unknown as SketchBoard;

    if (action.type === 'draw') {
      if (board.subPhase !== 'draw') return { ok: false, error: 'The brush has already been handed over.' };
      if (action.seat !== board.artist) return { ok: false, error: 'Only the artist paints.' };
      const check = SketchEngine.checkStrokes(action.payload.strokes);
      if (!check.ok) return check;
      return { ok: true };
    }

    if (action.type === 'guess') {
      if (board.subPhase !== 'guess') return { ok: false, error: 'Wait for the drawing.' };
      if (action.seat === board.artist) return { ok: false, error: 'The artist cannot guess.' };
      const word = action.payload.word;
      if (typeof word !== 'string' || !/^[A-Za-z ]{1,24}$/.test(word.trim())) {
        return { ok: false, error: 'Guess a single plain word.' };
      }
      return { ok: true };
    }

    return { ok: false, error: 'Unknown action.' };
  }

  /** Static so the client mirror can reuse it before submitting. */
  static checkStrokes(raw: unknown): ActionResult {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 80) {
      return { ok: false, error: 'Draw between 1 and 80 strokes.' };
    }
    let total = 0;
    for (const s of raw) {
      const stroke = s as Partial<Stroke>;
      if (typeof stroke.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(stroke.color)) {
        return { ok: false, error: 'Each stroke needs a hex colour.' };
      }
      const pts = stroke.points;
      if (!Array.isArray(pts) || pts.length < 2 || pts.length > 400 || pts.length % 2 !== 0) {
        return { ok: false, error: 'Each stroke needs 1 to 200 points.' };
      }
      for (const v of pts) {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
          return { ok: false, error: 'Points must sit inside the canvas.' };
        }
      }
      total += pts.length;
      if (total > 1600) return { ok: false, error: 'That masterpiece is too heavy — simplify.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const next = this.clone(state);
    const board = next.board as unknown as SketchBoard;

    if (action.type === 'draw') {
      board.strokes = (action.payload.strokes as Stroke[]).map((s) => ({ color: s.color, points: [...s.points] }));
      board.subPhase = 'guess';
      next.version += 1;
      this.toNextGuesser(next, board.artist);
      return next;
    }

    // guess
    const seat = action.seat;
    const guess = normalize(String(action.payload.word));
    const correct = guess === normalize(board.word);
    board.guesses.push({ seat, word: guess, correct });
    next.version += 1;

    if (correct) {
      next.scores[seat] += GUESSER_POINTS;
      next.scores[board.artist] += ARTIST_POINTS;
      this.closeRound(next, seat);
      return next;
    }

    board.wrongs[seat] += 1;
    const someoneLeft = this.toNextGuesser(next, seat);
    if (!someoneLeft) {
      this.closeRound(next, null); // everyone burned out — reveal
    }
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as SketchBoard;
    if (board.subPhase === 'draw') {
      // A cheerful abstract doodle.
      const strokes: Stroke[] = [];
      const colors = ['#22D3EE', '#FACC15', '#F472B6', '#FFFFFF'];
      for (let k = 0; k < 4; k++) {
        const points: number[] = [];
        let x = 0.2 + Math.random() * 0.3;
        let y = 0.2 + Math.random() * 0.3;
        for (let p = 0; p < 10; p++) {
          points.push(+x.toFixed(3), +y.toFixed(3));
          x = Math.min(0.95, Math.max(0.05, x + (Math.random() - 0.5) * 0.2));
          y = Math.min(0.95, Math.max(0.05, y + (Math.random() - 0.5) * 0.2));
        }
        strokes.push({ color: colors[k % colors.length], points });
      }
      return {
        action: { seat, type: 'draw', payload: { strokes } },
        delayMs: this.think(difficulty, 1200),
      };
    }

    const chance =
      difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.6 : difficulty === 'hard' ? 0.85 : 0.95;
    const word = Math.random() < chance ? board.word : 'banana';
    return {
      action: { seat, type: 'guess', payload: { word } },
      delayMs: this.think(difficulty, 700),
    };
  }

  /** The secret stays sealed until the round closes. */
  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as SketchBoard;
    // The artist paints their own word; finished games reveal everything.
    if (state.phase !== 'in_progress' || seat === board.artist) return state;
    const view = this.clone(state);
    (view.board as unknown as SketchBoard).word = '?';
    return view;
  }

  // ── round flow ────────────────────────────────────────────────────────────

  /** Advances to the next guesser with guesses left. False when nobody has. */
  private toNextGuesser(state: GameState, from: number): boolean {
    const board = state.board as unknown as SketchBoard;
    const n = state.seats.length;
    for (let k = 1; k <= n; k++) {
      const seat = (from + k) % n;
      if (seat === board.artist) continue;
      if (board.wrongs[seat] < MAX_WRONG) {
        state.currentSeat = seat;
        state.turn += 1;
        state.turnStartedAt = new Date().toISOString();
        return true;
      }
    }
    return false;
  }

  private closeRound(state: GameState, winner: number | null): void {
    const board = state.board as unknown as SketchBoard;
    board.history.push({ round: board.round, artist: board.artist, word: board.word, winner });
    if (board.round + 1 >= board.totalRounds) {
      this.finish(state);
      return;
    }
    board.round += 1;
    board.artist = board.round % state.seats.length;
    board.word = SKETCH_WORDS[board.order[board.round % board.order.length]];
    board.subPhase = 'draw';
    board.strokes = [];
    board.wrongs = board.wrongs.map(() => 0);
    board.guesses = [];
    state.currentSeat = board.artist;
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
  }

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
    const base = difficulty === 'easy' ? 1800 : difficulty === 'medium' ? 1500 : difficulty === 'hard' ? 1200 : 900;
    return base + extra + Math.floor(Math.random() * 1000);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as SketchBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        order: [...board.order],
        strokes: board.strokes.map((s) => ({ color: s.color, points: [...s.points] })),
        wrongs: [...board.wrongs],
        guesses: board.guesses.map((g) => ({ ...g })),
        history: board.history.map((h) => ({ ...h })),
      } as unknown as Record<string, unknown>,
    };
  }
}
