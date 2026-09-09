import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

/** The public location deck — every player may read this list any time. */
export const IMPOSTOR_LOCATIONS: Array<{ category: string; location: string }> = [
  { category: 'Places', location: 'airport' },
  { category: 'Places', location: 'beach' },
  { category: 'Places', location: 'hospital' },
  { category: 'Places', location: 'school' },
  { category: 'Places', location: 'restaurant' },
  { category: 'Places', location: 'cinema' },
  { category: 'Places', location: 'space station' },
  { category: 'Places', location: 'zoo' },
  { category: 'Places', location: 'library' },
  { category: 'Places', location: 'stadium' },
  { category: 'Places', location: 'submarine' },
  { category: 'Places', location: 'casino' },
  { category: 'Jobs', location: 'bakery' },
  { category: 'Jobs', location: 'fire station' },
  { category: 'Jobs', location: 'theatre' },
  { category: 'Jobs', location: 'farm' },
];

const CLUE_WORDS = [
  'noisy', 'shiny', 'crowded', 'quiet', 'expensive', 'wet', 'tall', 'sweet', 'fast', 'warm',
  'sticky', 'dangerous', 'cosy', 'ancient', 'electric', 'smelly', 'heavy', 'slippery', 'golden', 'sleepy',
];

const MAX_ROUNDS = 3;

interface ImpBoard extends Record<string, unknown> {
  phase: 'clue' | 'vote' | 'guess';
  category: string;
  /** The secret location — hidden from the impostor until the game ends. */
  location: string;
  /** Hidden from every seat until the game ends. */
  impostorSeat: number;
  round: number;
  /** This round's clues, in speaking order. */
  clues: Array<{ seat: number; word: string }>;
  /** Public votes: voter → target. */
  votes: Record<number, number>;
  /** Seats yet to act in the current phase, in table order. */
  pending: number[];
  log: string[];
}

/**
 * Impostor (spyfall-style social deduction) for four to eight players,
 * wave-5 rebuild.
 *
 * Every player but one receives the same secret location — the impostor sees
 * only its broad category and must blend in. Each round the table speaks in
 * order, dropping one-word clues, then everyone votes to eject a suspect.
 * Eject the impostor and they get one shot at stealing the game by guessing
 * the location; eject a crewmate and the impostor wins on the spot. Three
 * deadlocked rounds and the impostor slips away with it. The location list
 * is public knowledge — that is what clues are measured against — while the
 * location itself and the impostor's identity stay sealed until the end.
 *
 * Bots clue from a generic word bank (the impostor blends with the same
 * words), vote on gut feeling, and guess the location with per-difficulty
 * odds when caught.
 */
@Injectable()
export class ImpostorEngine extends BaseGameEngine {
  readonly slug = 'impostor';
  readonly minPlayers = 4;
  readonly maxPlayers = 8;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    const impostorSeat = Math.floor(Math.random() * n);
    const place = IMPOSTOR_LOCATIONS[Math.floor(Math.random() * IMPOSTOR_LOCATIONS.length)];
    const board: ImpBoard = {
      phase: 'clue',
      category: place.category,
      location: place.location,
      impostorSeat,
      round: 1,
      clues: [],
      votes: {},
      pending: config.seats.map((_, i) => i),
      log: ['Round 1 — everyone drops a one-word clue.'],
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
    const board = state.board as unknown as ImpBoard;

    if (action.type === 'clue') {
      if (board.phase !== 'clue') return { ok: false, error: 'Clue time is over.' };
      if (!board.pending.includes(action.seat)) return { ok: false, error: 'You have already spoken.' };
      const word = action.payload.word;
      if (typeof word !== 'string' || !/^[A-Za-z]{1,16}$/.test(word.trim())) {
        return { ok: false, error: 'One plain word, up to 16 letters.' };
      }
      return { ok: true };
    }

    if (action.type === 'vote') {
      if (board.phase !== 'vote') return { ok: false, error: 'Voting is not open.' };
      if (!board.pending.includes(action.seat)) return { ok: false, error: 'You have already voted.' };
      const target = Number(action.payload.target);
      if (!Number.isInteger(target) || target < 0 || target >= state.seats.length || target === action.seat) {
        return { ok: false, error: 'Vote for another player.' };
      }
      return { ok: true };
    }

    if (action.type === 'guess') {
      if (board.phase !== 'guess') return { ok: false, error: 'No guess is pending.' };
      if (action.seat !== board.impostorSeat) return { ok: false, error: 'Only the caught impostor guesses.' };
      const location = action.payload.location;
      if (typeof location !== 'string' || !IMPOSTOR_LOCATIONS.some((l) => l.location === location.trim().toLowerCase())) {
        return { ok: false, error: 'Pick a location from the deck.' };
      }
      return { ok: true };
    }

    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const next = this.clone(state);
    const board = next.board as unknown as ImpBoard;
    const seat = action.seat;

    if (action.type === 'clue') {
      board.clues.push({ seat, word: String(action.payload.word).trim().toLowerCase() });
      board.pending = board.pending.filter((s) => s !== seat);
      next.version += 1;
      if (board.pending.length === 0) {
        this.openVote(next, board);
      } else {
        next.currentSeat = board.pending[0];
        next.turn += 1;
        next.turnStartedAt = new Date().toISOString();
      }
      return next;
    }

    if (action.type === 'vote') {
      const target = Number(action.payload.target);
      board.votes[seat] = target;
      board.pending = board.pending.filter((s) => s !== seat);
      next.version += 1;
      if (board.pending.length === 0) {
        this.resolveVotes(next, board);
      } else {
        next.currentSeat = board.pending[0];
        next.turn += 1;
        next.turnStartedAt = new Date().toISOString();
      }
      return next;
    }

    // guess — the caught impostor's last gambit.
    const guess = String(action.payload.location).trim().toLowerCase();
    if (guess === board.location) {
      this.finish(next, [board.impostorSeat], 'The impostor named the place — stolen win!');
    } else {
      const crew = next.seats.map((_, i) => i).filter((i) => i !== board.impostorSeat);
      this.finish(next, crew, 'The impostor guessed wrong — crew triumphs!');
    }
    next.version += 1;
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as ImpBoard;

    if (board.phase === 'clue') {
      const word = CLUE_WORDS[Math.floor(Math.random() * CLUE_WORDS.length)];
      return { action: { seat, type: 'clue', payload: { word } }, delayMs: this.think(difficulty, 400) };
    }

    if (board.phase === 'vote') {
      const others = state.seats.map((_, i) => i).filter((i) => i !== seat);
      let target: number;
      if (seat === board.impostorSeat) {
        // Frame a crewmate.
        target = others[Math.floor(Math.random() * others.length)];
      } else {
        // Crew gut feeling: slight weight on whoever smells odd (random).
        target = others[Math.floor(Math.random() * others.length)];
      }
      return { action: { seat, type: 'vote', payload: { target } }, delayMs: this.think(difficulty, 600) };
    }

    // guess phase — only the impostor lands here.
    const chance = difficulty === 'easy' ? 0.2 : difficulty === 'medium' ? 0.35 : difficulty === 'hard' ? 0.5 : 0.62;
    const location =
      Math.random() < chance
        ? board.location
        : IMPOSTOR_LOCATIONS[Math.floor(Math.random() * IMPOSTOR_LOCATIONS.length)].location;
    return { action: { seat, type: 'guess', payload: { location } }, delayMs: this.think(difficulty, 1200) };
  }

  /** The location stays sealed from the impostor; the impostor's identity from everyone. */
  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as ImpBoard;
    const view = this.clone(state);
    const vb = view.board as unknown as ImpBoard;
    if (state.phase === 'in_progress' && seat !== board.impostorSeat) {
      // Crew sees the location; nobody learns the impostor's seat mid-game.
      vb.impostorSeat = -1;
    } else if (state.phase === 'in_progress') {
      vb.location = '?'; // the impostor blends blind
      vb.impostorSeat = -1;
    }
    return view;
  }

  // ── round flow ────────────────────────────────────────────────────────────

  private openVote(state: GameState, board: ImpBoard): void {
    board.phase = 'vote';
    board.votes = {};
    board.pending = state.seats.map((_, i) => i);
    board.log.push('The table votes.');
    state.currentSeat = board.pending[0];
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
  }

  private resolveVotes(state: GameState, board: ImpBoard): void {
    const tally = new Map<number, number>();
    for (const t of Object.values(board.votes)) tally.set(t, (tally.get(t) ?? 0) + 1);
    let top: number | null = null;
    let topVotes = 0;
    let tie = false;
    for (const [t, v] of tally) {
      if (v > topVotes) {
        top = t;
        topVotes = v;
        tie = false;
      } else if (v === topVotes) {
        tie = true;
      }
    }

    if (top != null && !tie) {
      board.log.push(`Seat ${top + 1} is ejected (${topVotes} votes).`);
      if (top === board.impostorSeat) {
        // Caught! One chance to steal the game.
        board.phase = 'guess';
        board.pending = [board.impostorSeat];
        state.currentSeat = board.impostorSeat;
        state.turn += 1;
        state.turnStartedAt = new Date().toISOString();
        board.log.push('The impostor may guess the location to steal the win!');
        return;
      }
      // A crewmate walked the plank — the impostor wins outright.
      this.finish(state, [board.impostorSeat], 'The crew ejected one of their own — impostor wins!');
      return;
    }

    // Deadlock.
    if (board.round >= MAX_ROUNDS) {
      this.finish(state, [board.impostorSeat], 'Three deadlocked rounds — the impostor slips away!');
      return;
    }
    board.round += 1;
    board.phase = 'clue';
    board.clues = [];
    board.votes = {};
    board.pending = state.seats.map((_, i) => i);
    board.log.push(`Round ${board.round} — fresh clues.`);
    state.currentSeat = board.pending[0];
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
  }

  private finish(state: GameState, winners: number[], story: string): void {
    const board = state.board as unknown as ImpBoard;
    state.phase = 'completed';
    state.winnerSeat = null;
    state.winnerSeats = winners;
    state.currentSeat = -1;
    state.scores = state.scores.map((_, i) => (winners.includes(i) ? 1 : 0));
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
    board.log.push(story);
    board.log.push(`The place was: ${board.location}. The impostor was seat ${board.impostorSeat + 1}.`);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1500 : difficulty === 'medium' ? 1200 : difficulty === 'hard' ? 950 : 750;
    return base + extra + Math.floor(Math.random() * 900);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as ImpBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      winnerSeats: state.winnerSeats ? [...state.winnerSeats] : null,
      board: {
        ...(board as Record<string, unknown>),
        clues: board.clues.map((c) => ({ ...c })),
        votes: { ...board.votes },
        pending: [...board.pending],
        log: [...board.log],
      } as unknown as Record<string, unknown>,
    };
  }
}
