import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

interface ImpostorPlayer {
  alive: boolean;
  voted: number | null; // index voted for this round (-1 = skip)
}

type Phase = 'discussion' | 'voting' | 'resolution' | 'completed';

interface ImpostorBoard extends Record<string, unknown> {
  phase: Phase;
  category: string;
  location: string;
  impostorSeat: number;
  players: ImpostorPlayer[];
  round: number;
  phaseEndsAt: string;
  results: Array<{ seat: number; votes: number }>;
  message: string;
  // server-only
  botSeats: boolean[];
  botDifficulty: Array<SeatInfo['botDifficulty']>;
  botVoted: boolean[];
  votedCount: number;
}

const LOCATIONS: Array<{ category: string; location: string }> = [
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
];

const DISCUSSION_MS = 22000;
const VOTING_MS = 14000;
const RESOLUTION_MS = 5000;

/**
 * Impostor Light — a streamlined social-deduction game for 4–8 players.
 * Everyone knows a secret location except the single impostor, who sees nothing
 * and must blend in during the short discussion. Then players vote: eject the
 * impostor to win, or eject a crewmate and the impostor wins. When the impostor
 * is voted out, crew wins; the impostor wins if a crewmate is ejected or if the
 * timer expires. Bots are assigned/known server-side only (never serialized).
 */
@Injectable()
export class ImpostorLightEngine extends BaseGameEngine {
  readonly slug = 'impostor_light';
  readonly minPlayers = 4;
  readonly maxPlayers = 8;
  readonly isLive = true;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    const impostorSeat = Math.floor(Math.random() * n);
    const place = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    const start = Date.now();

    const board: ImpostorBoard = {
      phase: 'discussion',
      category: place.category,
      location: place.location,
      impostorSeat,
      players: config.seats.map(() => ({ alive: true, voted: null })),
      round: 1,
      phaseEndsAt: new Date(start + DISCUSSION_MS).toISOString(),
      results: [],
      message: 'Discuss! Blend in and spot the liar.',
      botSeats: config.seats.map((s) => s.isBot),
      botDifficulty: config.seats.map((s) => s.botDifficulty ?? 'medium'),
      botVoted: config.seats.map(() => false),
      votedCount: 0,
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

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    const board = state.board as unknown as ImpostorBoard;
    const seat = action.seat;
    if (!board.players[seat]?.alive) return { ok: false, error: 'You are out.' };

    if (action.type === 'vote') {
      if (board.phase !== 'voting') return { ok: false, error: 'Voting has not started.' };
      if (board.players[seat].voted != null) return { ok: false, error: 'You already voted.' };
      const target = (action.payload['target'] as number | undefined) ?? -1;
      if (target === seat) return { ok: false, error: 'You cannot vote for yourself.' };
      if (target !== -1 && (!board.players[target]?.alive)) return { ok: false, error: 'Invalid vote.' };
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const board = state.board as unknown as ImpostorBoard;
    if (action.type === 'vote') {
      const target = (action.payload['target'] as number | undefined) ?? -1;
      board.players[action.seat].voted = target;
      board.botVoted[action.seat] = true;
      board.votedCount += 1;
      state.version += 1;
      const alive = board.players.filter((p) => p.alive).length;
      if (board.votedCount >= alive) this.resolveVoting(state);
    }
    return state;
  }

  tick(state: GameState, now: Date): GameState {
    if (state.phase !== 'in_progress') return state;
    const board = state.board as unknown as ImpostorBoard;
    const t = now.getTime();

    if (board.phase === 'discussion' && t >= new Date(board.phaseEndsAt).getTime()) {
      this.startVoting(state, t);
    } else if (board.phase === 'voting') {
      // Bots vote at staggered times within the voting window.
      board.players.forEach((p, seat) => {
        if (!p.alive || !board.botSeats[seat] || board.botVoted[seat]) return;
        const offset = 1500 + ((seat * 1331 + board.round * 719) % (VOTING_MS - 3000));
        if (t >= new Date(board.phaseEndsAt).getTime() - VOTING_MS + offset) {
          const target = this.botVote(board, seat);
          this.applyAction(state, { seat, type: 'vote', payload: { target } });
        }
      });
      if (t >= new Date(board.phaseEndsAt).getTime()) this.resolveVoting(state);
    } else if (board.phase === 'resolution' && t >= new Date(board.phaseEndsAt).getTime()) {
      // The outcome is already set; ensure completion.
      state.version += 1;
    }
    return state;
  }

  private startVoting(state: GameState, t: number): void {
    const board = state.board as unknown as ImpostorBoard;
    board.phase = 'voting';
    board.phaseEndsAt = new Date(t + VOTING_MS).toISOString();
    board.message = 'Vote for the impostor!';
    board.votedCount = 0;
    board.players.forEach((p, i) => {
      if (p.alive) {
        p.voted = null;
        board.botVoted[i] = false;
      }
    });
    state.version += 1;
  }

  /** Bots vote: impostor bots target a crewmate; crew bots suspect based on difficulty. */
  private botVote(board: ImpostorBoard, seat: number): number {
    const aliveSeats = board.players.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0 && i !== seat);
    if (seat === board.impostorSeat) {
      // Impostor votes out a random crewmate.
      const crew = aliveSeats.filter((s) => s !== board.impostorSeat);
      return crew[Math.floor(Math.random() * crew.length)] ?? -1;
    }
    // Crew: smarter bots have a higher chance to identify the impostor.
    const accuracy: Record<NonNullable<SeatInfo['botDifficulty']>, number> = {
      easy: 0.3,
      medium: 0.45,
      hard: 0.6,
      expert: 0.72,
    };
    if (Math.random() < (accuracy[board.botDifficulty[seat] ?? 'medium']) && aliveSeats.includes(board.impostorSeat)) {
      return board.impostorSeat;
    }
    // Otherwise a random other player.
    return aliveSeats[Math.floor(Math.random() * aliveSeats.length)] ?? -1;
  }

  private resolveVoting(state: GameState): void {
    const board = state.board as unknown as ImpostorBoard;
    if (board.phase !== 'voting') return;
    const counts = new Map<number, number>();
    board.players.forEach((p) => {
      if (p.voted != null && p.voted >= 0) counts.set(p.voted, (counts.get(p.voted) ?? 0) + 1);
    });
    board.results = [...counts.entries()]
      .map(([seat, votes]) => ({ seat, votes }))
      .sort((a, b) => b.votes - a.votes);

    const top = board.results[0];
    // Tie or no votes => nobody is ejected; impostor wins.
    const ejected = top && board.results.filter((r) => r.votes === top.votes).length === 1 ? top.seat : -1;

    board.phase = 'resolution';
    board.phaseEndsAt = new Date(Date.now() + RESOLUTION_MS).toISOString();

    if (ejected === board.impostorSeat) {
      board.message = `${state.seats[board.impostorSeat].displayName} was the impostor — crew wins!`;
      this.finish(state, board, false);
    } else if (ejected === -1) {
      board.message = 'The vote was tied — the impostor escapes!';
      this.finish(state, board, true);
    } else {
      board.message = `${state.seats[ejected].displayName} was not the impostor. The impostor wins!`;
      this.finish(state, board, true);
    }
    state.version += 1;
  }

  /** impostorWins true → winner is the impostor; otherwise the crew (all non-impostor seats). */
  private finish(state: GameState, board: ImpostorBoard, impostorWins: boolean): void {
    state.phase = 'completed';
    state.currentSeat = -1;
    if (impostorWins) {
      state.winnerSeat = board.impostorSeat;
      state.winnerSeats = [board.impostorSeat];
      state.scores = board.players.map((_, i) => (i === board.impostorSeat ? 1 : 0));
    } else {
      const crew = board.players.map((_, i) => (i === board.impostorSeat ? -1 : i)).filter((i) => i >= 0);
      state.winnerSeat = crew[0] ?? null;
      state.winnerSeats = crew;
      state.scores = board.players.map((_, i) => (i === board.impostorSeat ? 0 : 1));
    }
  }

  canSeatAct(state: GameState, action: GameAction): boolean {
    if (state.phase !== 'in_progress') return false;
    return action.type === 'vote' && action.seat >= 0;
  }

  chooseBotMove(): BotMove {
    return { action: { seat: -1, type: '__noop__', payload: {} }, delayMs: 0 };
  }

  /**
   * The impostor must never receive the secret location; crew see it.
   * Spectators (seat -1 / unknown) are also kept in the dark so the secret is
   * never leaked to a view that is not the impostor's own seat.
   */
  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as ImpostorBoard;
    const isImpostor = seat === board.impostorSeat;
    const isSeatedCrew = seat >= 0 && seat < board.players.length && !isImpostor;
    const safe: Record<string, unknown> = {
      phase: board.phase,
      category: board.category,
      location: isSeatedCrew ? board.location : null,
      youAreImpostor: isImpostor,
      round: board.round,
      phaseEndsAt: board.phaseEndsAt,
      message: board.message,
      results: board.results,
      players: board.players.map((p, i) => ({
        seat: i,
        name: state.seats[i].displayName,
        alive: p.alive,
        voted: board.phase === 'voting' ? false : p.voted != null,
      })),
    };
    return { ...state, board: safe };
  }
}
