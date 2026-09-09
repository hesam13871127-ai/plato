import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

export interface EmojiRiddle {
  category: string;
  emojis: string;
  options: [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
}

/**
 * The house riddle deck — emoji puzzles over movies, sayings, food and places.
 * `correct` indexes into `options` and never leaves the server.
 */
export const EMOJI_RIDDLES: EmojiRiddle[] = [
  { category: 'Movies', emojis: '🧙‍♂️💍', options: ['The Hobbit', 'Lord of the Rings', 'Harry Potter', 'Narnia'], correct: 1 },
  { category: 'Movies', emojis: '❄️👑', options: ['Frozen', 'Moana', 'Tangled', 'Encanto'], correct: 0 },
  { category: 'Movies', emojis: '🚢💔', options: ['Titanic', 'Poseidon', 'The Notebook', 'Cast Away'], correct: 0 },
  { category: 'Movies', emojis: '🕷️🦸', options: ['Batman', 'Spider-Man', 'Iron Man', 'Ant-Man'], correct: 1 },
  { category: 'Movies', emojis: '🦁👑', options: ['The Lion King', 'Madagascar', 'Zootopia', 'The Jungle Book'], correct: 0 },
  { category: 'Movies', emojis: '🐝🎬', options: ['Bee Movie', 'Antz', 'A Bug’s Life', 'Flushed Away'], correct: 0 },
  { category: 'Movies', emojis: '🦈😱', options: ['The Meg', 'Finding Nemo', 'Jaws', 'Deep Blue Sea'], correct: 2 },
  { category: 'Movies', emojis: '👽🚲', options: ['E.T.', 'Alien', 'Arrival', 'Signs'], correct: 0 },
  { category: 'Movies', emojis: '🤖❤️🌍', options: ['RoboCop', 'Big Hero 6', 'Chappie', 'WALL-E'], correct: 3 },
  { category: 'Movies', emojis: '🏠🎈👴', options: ['Coco', 'Up', 'Inside Out', 'Onward'], correct: 1 },
  { category: 'Sayings', emojis: '🌧️🐈🐕', options: ['Cats and dogs', 'Raining cats and dogs', 'Dog days', 'Copycat'], correct: 1 },
  { category: 'Sayings', emojis: '🥶🦶', options: ['Cold feet', 'Cold shoulder', 'Bigfoot', 'Foot the bill'], correct: 0 },
  { category: 'Sayings', emojis: '🍰✅', options: ['Sweet deal', 'Easy pie', 'Piece of cake', 'Cake walk'], correct: 2 },
  { category: 'Sayings', emojis: '🐈👅', options: ['Cat nap', 'Cat and mouse', 'Cat got your tongue', 'Fat cat'], correct: 2 },
  { category: 'Sayings', emojis: '🐝📝', options: ['Spelling bee', 'Busy bee', 'Bee line', 'Honey trap'], correct: 0 },
  { category: 'Sayings', emojis: '⏰🕊️', options: ['Time flies', 'Bird brain', 'Night owl', 'Early bird'], correct: 0 },
  { category: 'Sayings', emojis: '🌕🐺', options: ['Wolf moon', 'Howl at the moon', 'Once in a blue moon', 'Moonwalk'], correct: 2 },
  { category: 'Sayings', emojis: '🧒🔥', options: ['Playing with fire', 'Fight fire with fire', 'Fire away', 'Hot head'], correct: 0 },
  { category: 'Food', emojis: '🍕🍍', options: ['Fruit pizza', 'Hawaiian pizza', 'Tropical slice', 'Pineapple express'], correct: 1 },
  { category: 'Food', emojis: '🌮🌮', options: ['Double trouble', 'Taco Tuesday', 'Mexican wave', 'Salsa night'], correct: 1 },
  { category: 'Food', emojis: '🍔🍟', options: ['Burger and fries', 'Fast lane', 'Drive-thru', 'Diner dash'], correct: 0 },
  { category: 'Food', emojis: '🍣🐟', options: ['Fish market', 'Sushi platter', 'Raw deal', 'Catch of the day'], correct: 1 },
  { category: 'Food', emojis: '🍦🍫', options: ['Vanilla dream', 'Choco pop', 'Chocolate ice cream', 'Fudge pack'], correct: 2 },
  { category: 'Food', emojis: '🥑🍞', options: ['Green toast', 'Guacamole', 'Avocado toast', 'Brunch date'], correct: 2 },
  { category: 'Food', emojis: '🧀🍇🍷', options: ['Cheese and wine', 'Grape escape', 'Fondue night', 'Vineyard trip'], correct: 0 },
  { category: 'Food', emojis: '🍩☕', options: ['Donut worry', 'Coffee and donuts', 'Sugar rush', 'Morning combo'], correct: 1 },
  { category: 'Food', emojis: '🌭⚾', options: ['Ball park', 'Hot dog at the game', 'Strike out', 'Home run'], correct: 1 },
  { category: 'Food', emojis: '🍪🥛', options: ['Milk and cookies', 'Cookie cutter', 'Smart cookie', 'Sweet tooth'], correct: 0 },
  { category: 'Places', emojis: '🗼🇫🇷', options: ['Big Ben', 'Space Needle', 'Eiffel Tower', 'Leaning Tower'], correct: 2 },
  { category: 'Places', emojis: '🗻🇯🇵', options: ['Mount Fuji', 'Mount Everest', 'Mount Olympus', 'Kilimanjaro'], correct: 0 },
  { category: 'Places', emojis: '🏜️🐫', options: ['Gobi trip', 'Sahara desert', 'Arabian nights', 'Sand storm'], correct: 1 },
  { category: 'Places', emojis: '🐘🦒🦁', options: ['Zoo visit', 'African safari', 'Jungle cruise', 'Wild kingdom'], correct: 1 },
  { category: 'Places', emojis: '🌋🏝️', options: ['Island volcano', 'Beach party', 'Lost island', 'Fire island'], correct: 0 },
  { category: 'Places', emojis: '🐧🧊', options: ['North Pole', 'Winter wonderland', 'Antarctica', 'Ice age'], correct: 2 },
  { category: 'Places', emojis: '🎿⛰️', options: ['Mountain high', 'Ski resort', 'Snow trip', 'Peak season'], correct: 1 },
  { category: 'Places', emojis: '🗽🇺🇸', options: ['Washington D.C.', 'New York City', 'Boston', 'Chicago'], correct: 1 },
  { category: 'Places', emojis: '🏝️⚓', options: ['Desert island', 'Treasure cove', 'Pirate bay', 'Cast away'], correct: 0 },
  { category: 'Animals', emojis: '🦘🇦🇺', options: ['Kangaroo court', 'Outback hop', 'Australia', 'Zoo escape'], correct: 2 },
  { category: 'Animals', emojis: '🐼🎋', options: ['Panda snack', 'Bamboo bear', 'Panda feast', 'Kung Fu Panda'], correct: 3 },
  { category: 'Animals', emojis: '🦉🌙', options: ['Night owl', 'Wise guy', 'Owl city', 'Hootenanny'], correct: 0 },
];

const ROUNDS = 8;
const POINTS_CORRECT = 10;

interface CharadesBoard extends Record<string, unknown> {
  /** Shuffled riddle indexes — the deck. */
  order: number[];
  /** Zero-based round in play. */
  round: number;
  /** Option indexes already knocked out this round. */
  eliminated: number[];
  /** The live riddle (emojis + options only). */
  active: { category: string; emojis: string; options: string[] } | null;
  /** Log of every guess. */
  history: Array<{ seat: number; round: number; choice: number; correct: boolean }>;
  /** The previous verdict for the flash. */
  lastResult: { seat: number; choice: number; correctChoice: number; correct: boolean; roundEnded: boolean } | null;
}

/**
 * Emoji Charades for two to four players, wave-4 rebuild.
 *
 * Every round deals an emoji riddle — guess the phrase it paints from four
 * options. Players guess in seat order: a wrong guess knocks that option out
 * for the whole table (narrowing it for whoever guesses next), and the round
 * ends the moment someone lands the answer for ten points — or dies when
 * three wrong guesses leave only the truth standing. Eight rounds decide it;
 * the key never enters the state.
 *
 * Bots read the key with per-difficulty odds — easy bots often fumble and
 * hand the answer to the table.
 */
@Injectable()
export class EmojiCharadesEngine extends BaseGameEngine {
  readonly slug = 'emoji_charades';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const order = EMOJI_RIDDLES.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    order.length = ROUNDS;
    const board: CharadesBoard = {
      order,
      round: 0,
      eliminated: [],
      active: this.summarize(order[0]),
      history: [],
      lastResult: null,
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
    if (action.type !== 'guess') return { ok: false, error: 'Unknown action.' };
    const choice = Number(action.payload.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) {
      return { ok: false, error: 'Pick one of the four options.' };
    }
    const board = state.board as unknown as CharadesBoard;
    if (board.eliminated.includes(choice)) {
      return { ok: false, error: 'That option is already out.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid guess.');
    const next = this.clone(state);
    const board = next.board as unknown as CharadesBoard;
    const seat = action.seat;
    const choice = Number(action.payload.choice);
    const key = EMOJI_RIDDLES[board.order[board.round]].correct;
    const correct = choice === key;

    board.history.push({ seat, round: board.round, choice, correct });
    if (correct) {
      next.scores[seat] += POINTS_CORRECT;
    } else {
      board.eliminated.push(choice);
    }
    // The round dies when the guess lands, or when three wrong options are
    // knocked out and only the truth is left standing.
    const roundEnded = correct || board.eliminated.length >= 3;
    board.lastResult = { seat, choice, correctChoice: key, correct, roundEnded };

    next.version += 1;

    if (!roundEnded) {
      // Same riddle, next guesser.
      next.currentSeat = (seat + 1) % next.seats.length;
      next.turn += 1;
      next.turnStartedAt = new Date().toISOString();
      return next;
    }

    // Round over — reveal, advance.
    if (board.round + 1 >= board.order.length) {
      this.finish(next);
      return next;
    }
    board.round += 1;
    board.eliminated = [];
    board.active = this.summarize(board.order[board.round]);
    next.currentSeat = (seat + 1) % next.seats.length;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as CharadesBoard;
    const key = EMOJI_RIDDLES[board.order[board.round]].correct;
    const live = [0, 1, 2, 3].filter((c) => !board.eliminated.includes(c));
    const chance =
      difficulty === 'easy' ? 0.4 : difficulty === 'medium' ? 0.6 : difficulty === 'hard' ? 0.8 : 0.92;
    let choice: number;
    if (Math.random() < chance) {
      choice = key;
    } else {
      const wrong = live.filter((c) => c !== key);
      choice = wrong.length > 0 ? wrong[Math.floor(Math.random() * wrong.length)] : key;
    }
    return {
      action: { seat, type: 'guess', payload: { choice } },
      delayMs: this.think(difficulty, 800),
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private summarize(idx: number): { category: string; emojis: string; options: string[] } {
    const r = EMOJI_RIDDLES[idx];
    return { category: r.category, emojis: r.emojis, options: [...r.options] };
  }

  private finish(state: GameState): void {
    const board = state.board as unknown as CharadesBoard;
    board.active = null;
    const scores = state.scores;
    const max = Math.max(...scores);
    const leaders = scores.map((s, i) => ({ s, i })).filter((x) => x.s === max).map((x) => x.i);
    let winner: number | null = null;
    if (leaders.length === 1) {
      winner = leaders[0];
    } else {
      const corrects = state.seats.map((_, i) => board.history.filter((h) => h.seat === i && h.correct).length);
      const maxC = Math.max(...corrects);
      const best = corrects.map((c, i) => ({ c, i })).filter((x) => x.c === maxC).map((x) => x.i);
      if (best.length === 1) winner = best[0];
    }
    state.phase = 'completed';
    state.winnerSeat = winner;
    state.currentSeat = -1;
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 2000 : difficulty === 'medium' ? 1600 : difficulty === 'hard' ? 1300 : 1000;
    return base + extra + Math.floor(Math.random() * 1000);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as CharadesBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        order: [...board.order],
        eliminated: [...board.eliminated],
        history: board.history.map((h) => ({ ...h })),
        active: board.active ? { ...board.active, options: [...board.active.options] } : null,
        lastResult: board.lastResult ? { ...board.lastResult } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
