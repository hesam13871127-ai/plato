import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

export interface TriviaQuestion {
  category: string;
  q: string;
  options: [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
}

/**
 * The house question bank — sixty general-knowledge questions across eight
 * categories. `correct` indexes into `options`; the key never leaves the
 * server (state only carries text + options).
 */
export const TRIVIA_BANK: TriviaQuestion[] = [
  { category: 'Geography', q: 'Which is the largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], correct: 2 },
  { category: 'Geography', q: 'What is the capital of Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], correct: 2 },
  { category: 'Geography', q: 'Which country has the most land borders with neighbours?', options: ['Russia', 'China', 'Brazil', 'Germany'], correct: 1 },
  { category: 'Geography', q: 'The Sahara desert lies mostly on which continent?', options: ['Asia', 'Africa', 'Australia', 'South America'], correct: 1 },
  { category: 'Geography', q: 'Which is the longest river in Europe?', options: ['Danube', 'Rhine', 'Volga', 'Seine'], correct: 2 },
  { category: 'Geography', q: 'Mount Kilimanjaro rises in which country?', options: ['Kenya', 'Tanzania', 'Uganda', 'Ethiopia'], correct: 1 },
  { category: 'Geography', q: 'Which city is known as the Pearl of the Adriatic?', options: ['Split', 'Venice', 'Dubrovnik', 'Trieste'], correct: 2 },
  { category: 'Geography', q: 'Istanbul sits on two continents — which pair?', options: ['Europe and Asia', 'Asia and Africa', 'Europe and Africa', 'Asia and Oceania'], correct: 0 },

  { category: 'Science', q: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], correct: 2 },
  { category: 'Science', q: 'How many bones are in the adult human body?', options: ['186', '206', '226', '246'], correct: 1 },
  { category: 'Science', q: 'Which planet has the most moons?', options: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'], correct: 1 },
  { category: 'Science', q: 'What gas do plants absorb for photosynthesis?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], correct: 2 },
  { category: 'Science', q: 'What is the hardest natural substance on Earth?', options: ['Quartz', 'Titanium', 'Diamond', 'Tungsten'], correct: 2 },
  { category: 'Science', q: 'The speed of light is closest to…', options: ['300 km/s', '3,000 km/s', '30,000 km/s', '300,000 km/s'], correct: 3 },
  { category: 'Science', q: 'Which blood type is the universal donor?', options: ['A negative', 'O negative', 'AB positive', 'B positive'], correct: 1 },
  { category: 'Science', q: 'What particle orbits the nucleus of an atom?', options: ['Proton', 'Neutron', 'Electron', 'Positron'], correct: 2 },

  { category: 'History', q: 'In which year did the Berlin Wall fall?', options: ['1987', '1989', '1991', '1993'], correct: 1 },
  { category: 'History', q: 'Who was the first person to walk on the Moon?', options: ['Buzz Aldrin', 'Yuri Gagarin', 'Neil Armstrong', 'Michael Collins'], correct: 2 },
  { category: 'History', q: 'The Great Pyramid of Giza was built for which pharaoh?', options: ['Khufu', 'Tutankhamun', 'Ramses II', 'Akhenaten'], correct: 0 },
  { category: 'History', q: 'Which empire was ruled by Genghis Khan?', options: ['Ottoman', 'Mongol', 'Persian', 'Byzantine'], correct: 1 },
  { category: 'History', q: 'The Renaissance began in which country?', options: ['France', 'Spain', 'Italy', 'England'], correct: 2 },
  { category: 'History', q: 'Who wrote the 95 Theses in 1517?', options: ['Martin Luther', 'John Calvin', 'Erasmus', 'Zwingli'], correct: 0 },
  { category: 'History', q: 'Which ancient city was buried by Mount Vesuvius?', options: ['Carthage', 'Pompeii', 'Troy', 'Alexandria'], correct: 1 },
  { category: 'History', q: 'The Silk Road primarily connected China with…', options: ['Japan', 'India', 'The Mediterranean', 'Siberia'], correct: 2 },

  { category: 'Art & Literature', q: 'Who painted The Starry Night?', options: ['Claude Monet', 'Pablo Picasso', 'Vincent van Gogh', 'Paul Cézanne'], correct: 2 },
  { category: 'Art & Literature', q: 'How many lines does a sonnet have?', options: ['12', '14', '16', '18'], correct: 1 },
  { category: 'Art & Literature', q: 'Who wrote One Hundred Years of Solitude?', options: ['Jorge Luis Borges', 'Pablo Neruda', 'Gabriel García Márquez', 'Mario Vargas Llosa'], correct: 2 },
  { category: 'Art & Literature', q: 'The Mona Lisa hangs in which museum?', options: ['The Louvre', 'The Prado', 'The Uffizi', 'The Hermitage'], correct: 0 },
  { category: 'Art & Literature', q: 'Which composer wrote The Four Seasons?', options: ['Bach', 'Mozart', 'Vivaldi', 'Handel'], correct: 2 },
  { category: 'Art & Literature', q: 'Who wrote the play Hamlet?', options: ['Christopher Marlowe', 'William Shakespeare', 'Ben Jonson', 'John Webster'], correct: 1 },
  { category: 'Art & Literature', q: 'Salvador Dalí is best known for which art movement?', options: ['Cubism', 'Surrealism', 'Impressionism', 'Fauvism'], correct: 1 },
  { category: 'Art & Literature', q: 'The novel Moby-Dick hunts which creature?', options: ['A giant squid', 'A white whale', 'A shark', 'A sea serpent'], correct: 1 },

  { category: 'Sports', q: 'How many players are on a football (soccer) team on the pitch?', options: ['9', '10', '11', '12'], correct: 2 },
  { category: 'Sports', q: 'In which sport would you perform a slam dunk?', options: ['Volleyball', 'Basketball', 'Handball', 'Tennis'], correct: 1 },
  { category: 'Sports', q: 'How often are the Summer Olympic Games held?', options: ['Every 2 years', 'Every 3 years', 'Every 4 years', 'Every 5 years'], correct: 2 },
  { category: 'Sports', q: 'A grand slam in tennis means winning all four majors in one year — which of these is one?', options: ['Wimbledon', 'Indian Wells', 'Madrid Open', 'Miami Open'], correct: 0 },
  { category: 'Sports', q: 'In chess, which piece can only move diagonally?', options: ['Rook', 'Bishop', 'Knight', 'Queen'], correct: 1 },
  { category: 'Sports', q: 'The Tour de France is a race in which sport?', options: ['Running', 'Sailing', 'Cycling', 'Motorsport'], correct: 2 },
  { category: 'Sports', q: 'How many rings are on the Olympic flag?', options: ['Four', 'Five', 'Six', 'Seven'], correct: 1 },
  { category: 'Sports', q: 'In bowling, what is the term for knocking all ten pins with one ball?', options: ['A spare', 'A strike', 'A turkey', 'A split'], correct: 1 },

  { category: 'Nature', q: 'What is the fastest land animal?', options: ['Lion', 'Cheetah', 'Pronghorn', 'Greyhound'], correct: 1 },
  { category: 'Nature', q: 'How many hearts does an octopus have?', options: ['One', 'Two', 'Three', 'Four'], correct: 2 },
  { category: 'Nature', q: 'Which is the largest species of big cat?', options: ['Lion', 'Jaguar', 'Tiger', 'Leopard'], correct: 2 },
  { category: 'Nature', q: 'A group of crows is called a…', options: ['Pack', 'Murder', 'Flock', 'Gaggle'], correct: 1 },
  { category: 'Nature', q: 'What is the tallest tree species on Earth?', options: ['Oak', 'Sequoia', 'Baobab', 'Cedar'], correct: 1 },
  { category: 'Nature', q: 'Which mammal is known for laying eggs?', options: ['Platypus', 'Sloth', 'Armadillo', 'Pangolin'], correct: 0 },
  { category: 'Nature', q: 'What do bees collect and turn into honey?', options: ['Pollen', 'Nectar', 'Sap', 'Dew'], correct: 1 },
  { category: 'Nature', q: 'The chameleon changes colour mainly to…', options: ['Hide from predators', 'Regulate temperature and communicate', 'Match its food', 'Attract insects'], correct: 1 },

  { category: 'Technology', q: 'What does HTTP stand for?', options: ['HyperText Transfer Protocol', 'High Transfer Text Protocol', 'HyperTool Transfer Path', 'Hyperlink Transit Protocol'], correct: 0 },
  { category: 'Technology', q: 'Who is credited with coining the term "software engineering"?', options: ['Grace Hopper', 'Margaret Hamilton', 'Alan Turing', 'Edsger Dijkstra'], correct: 1 },
  { category: 'Technology', q: 'How many bits are in one byte?', options: ['4', '8', '16', '32'], correct: 1 },
  { category: 'Technology', q: 'Which company created the first mass-market smartphone with a touchscreen?', options: ['Nokia', 'Apple', 'Samsung', 'BlackBerry'], correct: 1 },
  { category: 'Technology', q: 'What does CPU stand for?', options: ['Central Processing Unit', 'Computer Personal Unit', 'Central Power Unit', 'Core Processing Utility'], correct: 0 },
  { category: 'Technology', q: 'In programming, what is a "bug"?', options: ['A hardware failure', 'An error in code', 'A corrupted file', 'A network outage'], correct: 1 },
  { category: 'Technology', q: 'Which language runs natively in web browsers?', options: ['Python', 'C++', 'JavaScript', 'Ruby'], correct: 2 },
  { category: 'Technology', q: 'What does AI stand for in computing?', options: ['Automated Input', 'Artificial Intelligence', 'Applied Interfaces', 'Adaptive Iteration'], correct: 1 },

  { category: 'Food', q: 'Sushi traditionally features which staple grain?', options: ['Barley', 'Rice', 'Wheat', 'Millet'], correct: 1 },
  { category: 'Food', q: 'Guacamole is primarily made from which fruit?', options: ['Avocado', 'Lime', 'Tomatillo', 'Papaya'], correct: 0 },
  { category: 'Food', q: 'Which spice is the most expensive by weight?', options: ['Vanilla', 'Cardamom', 'Saffron', 'Cinnamon'], correct: 2 },
  { category: 'Food', q: 'Tahdig is the prized crispy part of which dish?', options: ['Kebab', 'Rice', 'Stew', 'Soup'], correct: 1 },
  { category: 'Food', q: 'Espresso originated in which country?', options: ['France', 'Austria', 'Italy', 'Greece'], correct: 2 },
  { category: 'Food', q: 'Which cheese is traditionally used on a Margherita pizza?', options: ['Cheddar', 'Mozzarella', 'Feta', 'Gouda'], correct: 1 },
  { category: 'Food', q: 'Dark chocolate is made from which bean?', options: ['Coffee', 'Cocoa', 'Vanilla', 'Tonka'], correct: 1 },
  { category: 'Food', q: 'Which fruit has its seeds on the outside?', options: ['Blueberry', 'Strawberry', 'Raspberry', 'Cranberry'], correct: 1 },
];

const ROUNDS_PER_PLAYER = 7;
const POINTS_CORRECT = 10;

interface TriviaBoard extends Record<string, unknown> {
  /** Shuffled bank indexes — the question deck for this match. */
  order: number[];
  /** Questions asked so far. */
  asked: number;
  /** The live question (text + options only — the answer key stays server-side). */
  active: { category: string; q: string; options: string[] } | null;
  /** Per-answer log for the recap. */
  history: Array<{ seat: number; choice: number; correct: boolean }>;
  /** The previous answer, revealed for the flash of green or red. */
  lastResult: { seat: number; choice: number; correctChoice: number; correct: boolean } | null;
}

/**
 * Trivia quiz night for two to four players, wave-4 rebuild.
 *
 * Each turn the active seat faces a fresh question from the shuffled house
 * bank — seven rounds per player. Four options, one key; the correct answer
 * never enters the game state, so nothing leaks through sockets. Correct
 * answers bank ten points; when the deck runs out the top score wins (ties
 * break on more correct answers, then stand as a draw). No hidden hands —
 * just a locked envelope per turn.
 *
 * Bots answer right with per-difficulty probability and pick a random
 * wrong option otherwise.
 */
@Injectable()
export class TriviaEngine extends BaseGameEngine {
  readonly slug = 'trivia';
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const total = Math.min(config.seats.length * ROUNDS_PER_PLAYER, TRIVIA_BANK.length);
    const order = TRIVIA_BANK.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    order.length = total;
    const board: TriviaBoard = {
      order,
      asked: 0,
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
    if (action.type !== 'answer') return { ok: false, error: 'Unknown action.' };
    const choice = Number(action.payload.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) {
      return { ok: false, error: 'Pick one of the four answers.' };
    }
    return { ok: true };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid answer.');
    const next = this.clone(state);
    const board = next.board as unknown as TriviaBoard;
    const seat = action.seat;
    const choice = Number(action.payload.choice);
    const key = TRIVIA_BANK[board.order[board.asked]].correct;
    const correct = choice === key;

    board.history.push({ seat, choice, correct });
    board.lastResult = { seat, choice, correctChoice: key, correct };
    if (correct) next.scores[seat] += POINTS_CORRECT;
    board.asked += 1;
    next.version += 1;

    if (board.asked >= board.order.length) {
      this.finish(next);
      return next;
    }

    board.active = this.summarize(board.order[board.asked]);
    next.currentSeat = (seat + 1) % next.seats.length;
    next.turn += 1;
    next.turnStartedAt = new Date().toISOString();
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as TriviaBoard;
    const key = TRIVIA_BANK[board.order[board.asked]].correct;
    const chance =
      difficulty === 'easy' ? 0.45 : difficulty === 'medium' ? 0.65 : difficulty === 'hard' ? 0.85 : 0.95;
    let choice: number = key;
    if (Math.random() > chance) {
      const wrong = [0, 1, 2, 3].filter((c) => c !== key);
      choice = wrong[Math.floor(Math.random() * wrong.length)];
    }
    return {
      action: { seat, type: 'answer', payload: { choice } },
      delayMs: this.think(difficulty, 900),
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private summarize(idx: number): { category: string; q: string; options: string[] } {
    const q = TRIVIA_BANK[idx];
    return { category: q.category, q: q.q, options: [...q.options] };
  }

  private finish(state: GameState): void {
    const board = state.board as unknown as TriviaBoard;
    board.active = null; // no live question once the deck is done
    const scores = state.scores;
    const max = Math.max(...scores);
    const leaders = scores.map((s, i) => ({ s, i })).filter((x) => x.s === max).map((x) => x.i);
    let winner: number | null = null;
    if (leaders.length === 1) {
      winner = leaders[0];
    } else {
      // Tiebreak: more correct answers takes the crown.
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
    const base = difficulty === 'easy' ? 2200 : difficulty === 'medium' ? 1800 : difficulty === 'hard' ? 1400 : 1100;
    return base + extra + Math.floor(Math.random() * 1200);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as TriviaBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      board: {
        ...(board as Record<string, unknown>),
        order: [...board.order],
        history: board.history.map((h) => ({ ...h })),
        active: board.active ? { ...board.active, options: [...board.active.options] } : null,
        lastResult: board.lastResult ? { ...board.lastResult } : null,
      } as unknown as Record<string, unknown>,
    };
  }
}
