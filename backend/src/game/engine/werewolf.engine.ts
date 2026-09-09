import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

type Role = 'werewolf' | 'villager' | 'seer';
type WwPhase = 'night_kill' | 'night_seer' | 'day_vote';

interface WwPlayer {
  role: Role;
  alive: boolean;
}

interface SeerNote {
  night: number;
  seat: number;
  isWolf: boolean;
}

interface WwBoard extends Record<string, unknown> {
  players: WwPlayer[];
  phase: WwPhase;
  day: number;
  /** The wolves' chosen victim tonight — wolves only see this before dawn. */
  killTarget: number | null;
  /** The seer's private ledger — only the seer ever sees it. */
  seerNotes: SeerNote[];
  /** Public day votes: voter seat → target seat. */
  votes: Record<number, number>;
  /** Seats still to vote this day, in table order (server-side only). */
  pendingVoters: number[];
  /** The table's story, newest last. */
  log: string[];
}

/**
 * Werewolf (social deduction) for five to eight players, wave-5 rebuild.
 *
 * Strict turn-order adaption of the classic: night falls and the wolves
 * choose a victim, the seer peers at one player, then the village debates
 * and votes one suspect out — repeat until the wolves reach parity (wolves
 * win) or every wolf is caught (village wins). Roles stay sealed: each
 * player sees their own card (and wolf-mates see each other), the seer's
 * ledger is theirs alone, and the night kill stays dark until dawn. The
 * winning team shares the crown via `winnerSeats`.
 *
 * Bots play their part: wolves hunt the seer when they can, villagers
 * bandwagon on the loudest table suspicion, and everyone gets human-like
 * thinking delays.
 */
@Injectable()
export class WerewolfEngine extends BaseGameEngine {
  readonly slug = 'werewolf';
  readonly minPlayers = 5;
  readonly maxPlayers = 8;
  readonly isLive = false;

  createInitialState(config: MatchConfig): GameState {
    const n = config.seats.length;
    const wolves = n >= 7 ? 2 : 1;
    const roles: Role[] = config.seats.map(() => 'villager' as Role);
    const order = config.seats.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    for (let i = 0; i < wolves; i++) roles[order[i]] = 'werewolf';
    roles[order[wolves]] = 'seer';

    const board: WwBoard = {
      players: roles.map((role) => ({ role, alive: true })),
      phase: 'night_kill',
      day: 1,
      killTarget: null,
      seerNotes: [],
      votes: {},
      pendingVoters: [],
      log: ['Night 1 falls — the village sleeps.'],
    };
    const state: GameState = {
      phase: 'in_progress',
      turn: 0,
      currentSeat: this.firstWolf(board),
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
    return state;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'The game is already over.' };
    if (action.seat !== state.currentSeat) return { ok: false, error: 'It is not your turn.' };
    const board = state.board as unknown as WwBoard;
    const me = board.players[action.seat];
    if (!me || !me.alive) return { ok: false, error: 'You are out of this game.' };
    const target = Number(action.payload.target);

    if (action.type === 'kill') {
      if (board.phase !== 'night_kill' || me.role !== 'werewolf') {
        return { ok: false, error: 'Only the wolves choose at night.' };
      }
      if (!this.livingTarget(board, target)) return { ok: false, error: 'Choose a living player.' };
      if (target === action.seat) return { ok: false, error: 'The wolves spare their own.' };
      return { ok: true };
    }

    if (action.type === 'check') {
      if (board.phase !== 'night_seer' || me.role !== 'seer') {
        return { ok: false, error: 'The seer is not acting now.' };
      }
      if (!this.livingTarget(board, target) || target === action.seat) {
        return { ok: false, error: 'Choose another living player.' };
      }
      return { ok: true };
    }

    if (action.type === 'vote') {
      if (board.phase !== 'day_vote') return { ok: false, error: 'Voting is not open.' };
      if (!board.pendingVoters.includes(action.seat)) return { ok: false, error: 'You have already voted.' };
      if (!this.livingTarget(board, target) || target === action.seat) {
        return { ok: false, error: 'Choose a living player.' };
      }
      return { ok: true };
    }

    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const next = this.clone(state);
    const board = next.board as unknown as WwBoard;
    const seat = action.seat;
    const target = Number(action.payload.target);

    if (action.type === 'kill') {
      board.killTarget = target;
      board.log.push('The wolves circle their prey…');
      this.toSeerOrDawn(next, board);
      next.version += 1;
      return next;
    }

    if (action.type === 'check') {
      board.seerNotes.push({ night: board.day, seat: target, isWolf: board.players[target].role === 'werewolf' });
      board.log.push('The seer peers into a soul…');
      this.dawn(next, board);
      next.version += 1;
      return next;
    }

    // vote
    board.votes[seat] = target;
    board.pendingVoters = board.pendingVoters.filter((s) => s !== seat);
    next.version += 1;
    if (board.pendingVoters.length === 0) {
      this.resolveVotes(next, board);
    } else {
      next.currentSeat = board.pendingVoters[0];
      next.turn += 1;
      next.turnStartedAt = new Date().toISOString();
    }
    return next;
  }

  chooseBotMove(state: GameState, seat: number, difficulty: SeatInfo['botDifficulty']): BotMove {
    const board = state.board as unknown as WwBoard;
    const me = board.players[seat];
    const living = board.players.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0);
    const clueless = difficulty === 'easy';

    if (board.phase === 'night_kill' && me.role === 'werewolf') {
      // Hunt the seer when smart; otherwise any villager-shaped target.
      const prey = living.filter((i) => board.players[i].role !== 'werewolf');
      let target: number;
      if (!clueless && Math.random() < 0.55) {
        const seer = prey.find((i) => board.players[i].role === 'seer');
        target = seer ?? prey[Math.floor(Math.random() * prey.length)];
      } else {
        target = prey[Math.floor(Math.random() * prey.length)];
      }
      return { action: { seat, type: 'kill', payload: { target } }, delayMs: this.think(difficulty, 800) };
    }

    if (board.phase === 'night_seer' && me.role === 'seer') {
      const unchecked = living.filter((i) => i !== seat && !board.seerNotes.some((n) => n.seat === i));
      const pool = unchecked.length > 0 ? unchecked : living.filter((i) => i !== seat);
      const target = pool[Math.floor(Math.random() * pool.length)];
      return { action: { seat, type: 'check', payload: { target } }, delayMs: this.think(difficulty, 600) };
    }

    // Day vote.
    const meWolf = me.role === 'werewolf';
    const targets = living.filter((i) => i !== seat && (meWolf ? board.players[i].role !== 'werewolf' : true));
    let target: number;
    if (meWolf) {
      target = targets[Math.floor(Math.random() * targets.length)];
    } else {
      // Villagers smell blood: pile on the current vote leader if any.
      const tally = new Map<number, number>();
      for (const t of Object.values(board.votes)) tally.set(t, (tally.get(t) ?? 0) + 1);
      let leader: number | null = null;
      let leaderVotes = 0;
      for (const [t, v] of tally) {
        if (v > leaderVotes && t !== seat && board.players[t].alive) {
          leader = t;
          leaderVotes = v;
        }
      }
      if (leader != null && !clueless && Math.random() < 0.7) {
        target = leader;
      } else {
        target = targets[Math.floor(Math.random() * targets.length)];
      }
    }
    return { action: { seat, type: 'vote', payload: { target } }, delayMs: this.think(difficulty, 400) };
  }

  /** Roles stay sealed: each seat sees its own card and its wolf-mates. */
  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as WwBoard;
    const view = this.clone(state);
    const vb = view.board as unknown as WwBoard;
    const meWolf = board.players[seat]?.role === 'werewolf';
    vb.players = board.players.map((p, i) => ({
      alive: p.alive,
      role:
        i === seat
          ? p.role
          : meWolf && p.role === 'werewolf'
            ? 'werewolf'
            : 'hidden',
    })) as WwPlayer[];
    if (!meWolf) vb.killTarget = null; // the night kill stays dark until dawn
    if (board.players[seat]?.role !== 'seer') vb.seerNotes = [];
    if (state.phase === 'completed') {
      // The story ends — the village learns everything.
      vb.players = board.players.map((p) => ({ ...p }));
    }
    return view;
  }

  // ── night & day flow ──────────────────────────────────────────────────────

  private toSeerOrDawn(state: GameState, board: WwBoard): void {
    const seer = board.players.findIndex((p) => p.alive && p.role === 'seer');
    if (seer >= 0) {
      board.phase = 'night_seer';
      state.currentSeat = seer;
      state.turn += 1;
      state.turnStartedAt = new Date().toISOString();
    } else {
      this.dawn(state, board);
    }
  }

  private dawn(state: GameState, board: WwBoard): void {
    if (board.killTarget != null && board.players[board.killTarget]?.alive) {
      board.players[board.killTarget].alive = false;
      board.log.push(`Dawn breaks — the village mourns seat ${board.killTarget + 1}.`);
    } else {
      board.log.push('Dawn breaks — somehow, everyone survived the night.');
    }
    board.killTarget = null;
    if (this.checkEnd(state, board)) return;
    this.openVote(state, board);
  }

  private openVote(state: GameState, board: WwBoard): void {
    board.phase = 'day_vote';
    board.votes = {};
    board.pendingVoters = board.players.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0);
    board.log.push(`Day ${board.day}: the village votes.`);
    state.currentSeat = board.pendingVoters[0];
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
  }

  private resolveVotes(state: GameState, board: WwBoard): void {
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
    if (top != null && !tie && topVotes > 1) {
      board.players[top].alive = false;
      board.log.push(`The village banishes seat ${top + 1} (${topVotes} votes).`);
    } else {
      board.log.push('The village cannot agree — nobody is banished.');
    }
    if (this.checkEnd(state, board)) return;
    board.day += 1;
    board.phase = 'night_kill';
    board.log.push(`Night ${board.day} falls.`);
    state.currentSeat = this.firstWolf(board);
    state.turn += 1;
    state.turnStartedAt = new Date().toISOString();
  }

  private checkEnd(state: GameState, board: WwBoard): boolean {
    const wolves = board.players.filter((p) => p.alive && p.role === 'werewolf').length;
    const others = board.players.filter((p) => p.alive && p.role !== 'werewolf').length;
    if (wolves === 0) {
      this.finish(state, board, 'village');
      return true;
    }
    if (wolves >= others) {
      this.finish(state, board, 'wolves');
      return true;
    }
    return false;
  }

  private finish(state: GameState, board: WwBoard, side: 'wolves' | 'village'): void {
    const winners = board.players
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => (side === 'wolves' ? p.role === 'werewolf' : p.role !== 'werewolf'))
      .map(({ i }) => i);
    state.phase = 'completed';
    state.winnerSeat = null;
    state.winnerSeats = winners;
    state.currentSeat = -1;
    state.scores = state.scores.map((_, i) => (winners.includes(i) ? 1 : 0));
    state.seats = state.seats.map((s, i) => ({ ...s, score: state.scores[i] }));
    board.log.push(side === 'wolves' ? 'The wolves overrun the village!' : 'The village rids itself of wolves!');
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private livingTarget(board: WwBoard, target: number): boolean {
    return Number.isInteger(target) && target >= 0 && target < board.players.length && board.players[target].alive;
  }

  private firstWolf(board: WwBoard): number {
    const wolf = board.players.findIndex((p) => p.alive && p.role === 'werewolf');
    return wolf; // checkEnd guarantees a living wolf during night_kill
  }

  private think(difficulty: SeatInfo['botDifficulty'], extra = 0): number {
    const base = difficulty === 'easy' ? 1800 : difficulty === 'medium' ? 1400 : difficulty === 'hard' ? 1100 : 900;
    return base + extra + Math.floor(Math.random() * 900);
  }

  private clone(state: GameState): GameState {
    const board = state.board as unknown as WwBoard;
    return {
      ...state,
      seats: state.seats.map((s) => ({ ...s })),
      scores: [...state.scores],
      winnerSeats: state.winnerSeats ? [...state.winnerSeats] : null,
      board: {
        ...(board as Record<string, unknown>),
        players: board.players.map((p) => ({ ...p })),
        seerNotes: board.seerNotes.map((n) => ({ ...n })),
        votes: { ...board.votes },
        pendingVoters: [...board.pendingVoters],
        log: [...board.log],
      } as unknown as Record<string, unknown>,
    };
  }
}
