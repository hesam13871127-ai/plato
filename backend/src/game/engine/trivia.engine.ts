import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface TriviaPlayer {
  score: number;
  answered: boolean;
  chosen: number | null;
  correct: boolean;
  gained: number;
}

interface TriviaQuestion {
  category: string;
  prompt: string;
  options: string[];
  answer: number;
}

interface TriviaBoard extends Record<string, unknown> {
  round: number;
  target: number;
  category: string;
  prompt: string;
  options: string[];
  reveal: boolean; // when true the correct answer is shown publicly
  players: TriviaPlayer[];
  roundStartedAt: string;
  answerEndsAt: string;
  revealEndsAt: string | null;
  answerMs: number;
  revealMs: number;
  // server-only
  answerIndex: number;
  order: number[];
  botSeats: boolean[];
  botAnswerAt: number[];
  botDifficulty: Array<SeatInfo['botDifficulty']>;
}

const QUESTIONS: TriviaQuestion[] = [
  { category: 'Science', prompt: 'How many planets are in our solar system?', options: ['7', '8', '9', '10'], answer: 1 },
  { category: 'Geography', prompt: 'What is the capital of Japan?', options: ['Seoul', 'Beijing', 'Tokyo', 'Bangkok'], answer: 2 },
  { category: 'Math', prompt: 'What is 7 × 8?', options: ['54', '56', '64', '48'], answer: 1 },
  { category: 'Animals', prompt: 'Which is the fastest land animal?', options: ['Lion', 'Cheetah', 'Horse', 'Falcon'], answer: 1 },
  { category: 'Science', prompt: 'What gas do plants absorb from the air?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], answer: 2 },
  { category: 'Geography', prompt: 'Which is the largest ocean?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 3 },
  { category: 'History', prompt: 'In which year did World War II end?', options: ['1943', '1945', '1947', '1950'], answer: 1 },
  { category: 'Math', prompt: 'What is 15% of 200?', options: ['20', '25', '30', '35'], answer: 2 },
  { category: 'Music', prompt: 'How many strings does a standard guitar have?', options: ['4', '5', '6', '7'], answer: 2 },
  { category: 'Science', prompt: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], answer: 2 },
  { category: 'Sports', prompt: 'How many players in a soccer team on the pitch?', options: ['9', '10', '11', '12'], answer: 2 },
  { category: 'Geography', prompt: 'Mount Everest sits in which mountain range?', options: ['Andes', 'Alps', 'Himalayas', 'Rockies'], answer: 2 },
  { category: 'Animals', prompt: 'What is a group of lions called?', options: ['Pack', 'Pride', 'Herd', 'Flock'], answer: 1 },
  { category: 'Math', prompt: 'What is the square root of 144?', options: ['10', '11', '12', '14'], answer: 2 },
  { category: 'Science', prompt: 'What planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Saturn'], answer: 1 },
  { category: 'Literature', prompt: 'Who wrote "Romeo and Juliet"?', options: ['Dickens', 'Shakespeare', 'Tolstoy', 'Austen'], answer: 1 },
  { category: 'Geography', prompt: 'Which river is the longest in the world?', options: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], answer: 1 },
  { category: 'Science', prompt: 'How many bones are in the adult human body?', options: ['186', '206', '226', '246'], answer: 1 },
  { category: 'Food', prompt: 'What is the main ingredient in guacamole?', options: ['Tomato', 'Avocado', 'Pepper', 'Onion'], answer: 1 },
  { category: 'Math', prompt: 'What is 9²?', options: ['18', '72', '81', '99'], answer: 2 },
  { category: 'Sports', prompt: 'In which sport is the term "love" used for zero?', options: ['Tennis', 'Golf', 'Boxing', 'Chess'], answer: 0 },
  { category: 'Geography', prompt: 'Which country has the most people?', options: ['USA', 'India', 'China', 'Indonesia'], answer: 1 },
  { category: 'Animals', prompt: 'Which bird is the largest?', options: ['Eagle', 'Ostrich', 'Penguin', 'Albatross'], answer: 1 },
  { category: 'Science', prompt: 'What is H₂O better known as?', options: ['Salt', 'Water', 'Oxygen', 'Hydrogen'], answer: 1 },
];

/**
 * Trivia Battle — a live multiple-choice quiz for 2–6 players. Each round a
 * question is shown for a short window; everyone locks in an answer. Correct
 * answers score a base plus a speed bonus (faster = more). After the answer
 * window the correct option is revealed briefly, then the next round starts.
 * Bots answer on a human-like reaction timer with difficulty-based accuracy.
 */
@Injectable()
export class TriviaEngine extends BaseGameEngine {
  readonly slug = 'trivia';
  readonly minPlayers = 2;
  readonly maxPlayers = 6;
  readonly isLive = true;

  private static readonly ROUNDS = 7;
  private static readonly ANSWER_MS = 12000;
  private static readonly REVEAL_MS = 3200;
  private static readonly BASE_POINTS = 100;
  private static readonly SPEED_BONUS = 100;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    const start = Date.now();
    const order = this.shuffledOrder();
    const board = this.buildBoard(config, n, start, 0, order);
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

  private buildBoard(
    config: MatchConfig,
    n: number,
    start: number,
    round: number,
    order: number[],
  ): TriviaBoard {
    const qi = order[round % order.length];
    const q = QUESTIONS[qi];
    return {
      round: round + 1,
      target: TriviaEngine.ROUNDS,
      category: q.category,
      prompt: q.prompt,
      options: [...q.options],
      reveal: false,
      players: Array.from({ length: n }, () => ({
        score: 0,
        answered: false,
        chosen: null,
        correct: false,
        gained: 0,
      })),
      roundStartedAt: new Date(start).toISOString(),
      answerEndsAt: new Date(start + TriviaEngine.ANSWER_MS).toISOString(),
      revealEndsAt: null,
      answerMs: TriviaEngine.ANSWER_MS,
      revealMs: TriviaEngine.REVEAL_MS,
      answerIndex: q.answer,
      order,
      botSeats: config.seats.map((s) => s.isBot),
      botAnswerAt: config.seats.map((s, i) =>
        s.isBot ? start + 1200 + ((i * 977 + round * 431) % (TriviaEngine.ANSWER_MS - 2200)) : Number.POSITIVE_INFINITY,
      ),
      botDifficulty: config.seats.map((s) => s.botDifficulty ?? 'medium'),
    };
  }

  private shuffledOrder(): number[] {
    const order = QUESTIONS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    const board = state.board as unknown as TriviaBoard;
    if (action.type !== 'answer') return { ok: false, error: 'Unknown action.' };
    if (action.seat < 0 || action.seat >= board.players.length) return { ok: false, error: 'Not a seat.' };
    if (board.reveal) return { ok: false, error: 'The round is over.' };
    if (board.players[action.seat].answered) return { ok: false, error: 'You already answered.' };
    const index = (action.payload['index'] as number | undefined) ?? -1;
    if (!Number.isInteger(index) || index < 0 || index >= board.options.length) {
      return { ok: false, error: 'Pick one of the options.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid answer.');
    if (action.type === 'answer') {
      const board = state.board as unknown as TriviaBoard;
      const player = board.players[action.seat];
      const index = action.payload['index'] as number;
      player.chosen = index;
      player.answered = true;
      player.correct = index === board.answerIndex;
      const elapsed = Date.now() - new Date(board.roundStartedAt).getTime();
      const remaining = Math.max(0, TriviaEngine.ANSWER_MS - elapsed);
      player.gained = player.correct
        ? TriviaEngine.BASE_POINTS + Math.round((remaining / TriviaEngine.ANSWER_MS) * TriviaEngine.SPEED_BONUS)
        : 0;
      player.score += player.gained;
      state.version += 1;
      this.maybeEndAnswerWindow(state);
    }
    return state;
  }

  tick(state: GameState, now: Date): GameState {
    if (state.phase !== 'in_progress') return state;
    const board = state.board as unknown as TriviaBoard;
    const t = now.getTime();

    if (board.reveal) {
      // Wait out the reveal window, then advance (or finish).
      if (board.revealEndsAt != null && t >= new Date(board.revealEndsAt).getTime()) {
        this.advance(state);
      }
      return state;
    }

    // Bots answer at their scheduled reaction time.
    board.players.forEach((p, seat) => {
      if (board.botSeats[seat] && !p.answered && t >= board.botAnswerAt[seat]) {
        const chosen = this.botChoice(board, seat);
        this.applyAction(state, { seat, type: 'answer', payload: { index: chosen } });
      }
    });

    const windowEnded = t >= new Date(board.answerEndsAt).getTime();
    if (windowEnded) this.endAnswerWindow(state);
    return state;
  }

  private botChoice(board: TriviaBoard, seat: number): number {
    const accuracy: Record<NonNullable<SeatInfo['botDifficulty']>, number> = {
      easy: 0.45,
      medium: 0.62,
      hard: 0.78,
      expert: 0.92,
    };
    const diff = board.botDifficulty[seat] ?? 'medium';
    if (Math.random() < accuracy[diff]) return board.answerIndex;
    const wrong = [0, 1, 2, 3].filter((i) => i !== board.answerIndex);
    return wrong[Math.floor(Math.random() * wrong.length)];
  }

  private maybeEndAnswerWindow(state: GameState): void {
    const board = state.board as unknown as TriviaBoard;
    if (board.players.every((p) => p.answered)) this.endAnswerWindow(state);
  }

  private endAnswerWindow(state: GameState): void {
    const board = state.board as unknown as TriviaBoard;
    if (board.reveal) return;
    board.reveal = true;
    board.revealEndsAt = new Date(Date.now() + TriviaEngine.REVEAL_MS).toISOString();
    state.scores = board.players.map((p) => p.score);
    state.version += 1;
  }

  private advance(state: GameState): void {
    const board = state.board as unknown as TriviaBoard;
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
    // Carry totals into the next round's player slots.
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
    return action.type === 'answer' && action.seat >= 0;
  }

  chooseBotMove(): BotMove {
    return { action: { seat: -1, type: '__noop__', payload: {} }, delayMs: 0 };
  }

  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as TriviaBoard;
    const safe: Record<string, unknown> = {
      round: board.round,
      target: board.target,
      category: board.category,
      prompt: board.prompt,
      options: board.options,
      reveal: board.reveal,
      // The answer is only published in the reveal phase — after answering has
      // closed for everyone — so it cannot influence any live answer.
      correctIndex: board.reveal ? board.answerIndex : null,
      answerEndsAt: board.answerEndsAt,
      revealEndsAt: board.revealEndsAt,
      // Choices are shown live as players answer; correctness/points only
      // appear at the reveal.
      players: board.players.map((p) => ({
        score: p.score,
        answered: p.answered,
        chosen: p.chosen,
        correct: board.reveal ? p.correct : false,
        gained: board.reveal ? p.gained : 0,
      })),
    };
    return { ...state, board: safe };
  }
}
