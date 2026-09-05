import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

type Role = 'werewolf' | 'villager' | 'seer';
type WwPhase = 'night_kill' | 'night_seer' | 'day_discuss' | 'day_vote' | 'ended';

interface WwPlayer {
  role: Role;
  alive: boolean;
  // Bot personality flag kept server-only (never sent).
  isBot: boolean;
}

interface WwBoard extends Record<string, unknown> {
  players: WwPlayer[];
  phase: WwPhase;
  day: number;
  phaseEndsAt: string | null;
  phaseMs: number;
  // Night kill target (werewolves collectively), null if none chosen yet.
  killTarget: number | null;
  seerChecked: number | null;
  // Votes during day: voterSeat → targetSeat.
  votes: Record<number, number>;
  log: string[];
  winner: 'wolves' | 'village' | null;
  difficulty: Array<SeatInfo['botDifficulty']>;
}

/**
 * Werewolf (social deduction) for 5–8 players, run LIVE with invisible bot
 * opponents. Phases advance on a wall-clock timer via tick(): night (wolves
 * choose a victim, seer checks a player), day (discussion then lynch vote).
 * Wolves win when they reach parity with villagers; the village wins when all
 * wolves are eliminated. Bots vote/choose automatically with human-like delays;
 * humans submit their choices as actions.
 */
@Injectable()
export class WerewolfEngine extends BaseGameEngine {
  readonly slug = 'werewolf';
  readonly minPlayers = 5;
  readonly maxPlayers = 8;
  readonly isLive = true;

  createInitialState(config: MatchConfig): GameState {
    const seats = config.seats;
    const n = seats.length;
    // Assign roles: ~1 wolf per 4 players (min 1), one seer if enough players.
    const wolfCount = Math.max(1, Math.round(n / 4));
    const roles: Role[] = seats.map(() => 'villager' as Role);
    const order = this.shuffle(seats.map((_, i) => i));
    for (let i = 0; i < wolfCount; i++) roles[order[i]] = 'werewolf';
    if (n >= 6) roles[order[wolfCount]] = 'seer';

    const players: WwPlayer[] = seats.map((s, i) => ({
      role: roles[i],
      alive: true,
      isBot: s.isBot,
    }));

    const phaseMs = 8000;
    const board: WwBoard = {
      players,
      phase: 'night_kill',
      day: 1,
      phaseEndsAt: new Date(Date.now() + phaseMs).toISOString(),
      phaseMs,
      killTarget: null,
      seerChecked: null,
      votes: {},
      log: ['Night 1 falls — the werewolves choose a victim.'],
      winner: null,
      difficulty: seats.map((s) => s.botDifficulty ?? 'medium'),
    };

    const state: GameState = {
      phase: 'in_progress',
      turn: 0,
      currentSeat: -1,
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

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is over.' };
    const board = state.board as unknown as WwBoard;
    const me = board.players[action.seat];
    if (!me || !me.alive) return { ok: false, error: 'You are out of this game.' };
    if (action.type === 'vote') {
      if (board.phase !== 'day_vote') return { ok: false, error: 'Voting is not open.' };
      const target = Number((action.payload as { target?: unknown }).target);
      if (!Number.isInteger(target) || !board.players[target]?.alive || target === action.seat) {
        return { ok: false, error: 'Choose a living player.' };
      }
      return { ok: true };
    }
    if (action.type === 'kill') {
      if (board.phase !== 'night_kill' || me.role !== 'werewolf') {
        return { ok: false, error: 'Only werewolves choose at night.' };
      }
      const target = Number((action.payload as { target?: unknown }).target);
      if (!board.players[target]?.alive) return { ok: false, error: 'Choose a living player.' };
      return { ok: true };
    }
    if (action.type === 'seer_check') {
      if (board.phase !== 'night_seer' || me.role !== 'seer') {
        return { ok: false, error: 'The seer is not acting now.' };
      }
      const target = Number((action.payload as { target?: unknown }).target);
      if (!board.players[target]?.alive || target === action.seat) {
        return { ok: false, error: 'Choose another living player.' };
      }
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const board = state.board as unknown as WwBoard;
    if (action.type === 'vote') {
      board.votes[action.seat] = Number((action.payload as { target: number }).target);
      state.version += 1;
    } else if (action.type === 'kill') {
      board.killTarget = Number((action.payload as { target: number }).target);
      state.version += 1;
    } else if (action.type === 'seer_check') {
      board.seerChecked = Number((action.payload as { target: number }).target);
      state.version += 1;
    }
    return state;
  }

  tick(state: GameState, now: Date): GameState {
    if (state.phase !== 'in_progress') return state;
    const board = state.board as unknown as WwBoard;
    if (!board.phaseEndsAt) return state;
    if (now.getTime() < new Date(board.phaseEndsAt).getTime()) {
      // Let bots act during the window.
      this.botsAct(state, board);
      return state;
    }
    this.advancePhase(state, board);
    return state;
  }

  private botsAct(state: GameState, board: WwBoard): void {
    const living = board.players.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0);
    const reactChance = 0.5;
    if (board.phase === 'night_kill') {
      const wolves = living.filter((i) => board.players[i].role === 'werewolf' && board.players[i].isBot);
      if (wolves.length > 0 && board.killTarget == null && Math.random() < reactChance) {
        const victims = living.filter((i) => board.players[i].role !== 'werewolf');
        // Prefer the seer if a bot somehow knows; otherwise random villager.
        const target = victims[Math.floor(Math.random() * victims.length)];
        board.killTarget = target;
        state.version += 1;
      }
    } else if (board.phase === 'night_seer') {
      const seer = living.find((i) => board.players[i].role === 'seer' && board.players[i].isBot);
      if (seer != null && board.seerChecked == null && Math.random() < reactChance) {
        const choices = living.filter((i) => i !== seer);
        board.seerChecked = choices[Math.floor(Math.random() * choices.length)];
        state.version += 1;
      }
    } else if (board.phase === 'day_vote') {
      for (const i of living) {
        if (!board.players[i].isBot) continue;
        if (board.votes[i] != null) continue;
        if (Math.random() < reactChance) {
          const targets = living.filter((t) => t !== i);
          // Wolves subtly avoid voting fellow wolves; villagers vote on suspicion.
          let target: number;
          const me = board.players[i];
          const nonWolves = targets.filter((t) => board.players[t].role !== 'werewolf');
          if (me.role === 'werewolf' && nonWolves.length > 0) {
            target = nonWolves[Math.floor(Math.random() * nonWolves.length)];
          } else {
            target = targets[Math.floor(Math.random() * targets.length)];
          }
          board.votes[i] = target;
          state.version += 1;
        }
      }
    }
  }

  private advancePhase(state: GameState, board: WwBoard): void {
    const setTimer = (ms: number) => {
      board.phaseMs = ms;
      board.phaseEndsAt = new Date(Date.now() + ms).toISOString();
    };

    if (board.phase === 'night_kill') {
      // Werewolf kill resolves (default to a random villager if no wolf acted).
      if (board.killTarget == null) {
        const villagers = board.players
          .map((p, i) => (p.alive && p.role !== 'werewolf' ? i : -1))
          .filter((i) => i >= 0);
        board.killTarget = villagers.length ? villagers[Math.floor(Math.random() * villagers.length)] : null;
      }
      if (board.killTarget != null) {
        board.players[board.killTarget].alive = false;
        board.log.push(`The wolves attacked player ${board.killTarget + 1}.`);
      }
      board.killTarget = null;
      if (this.checkEnd(state, board)) return;
      // Seer acts next (only if alive).
      const seerAlive = board.players.some((p) => p.alive && p.role === 'seer');
      if (seerAlive) {
        board.phase = 'night_seer';
        board.seerChecked = null;
        board.log.push('The seer looks into a player…');
        setTimer(5000);
      } else {
        this.startDay(state, board);
      }
      state.version += 1;
      return;
    }

    if (board.phase === 'night_seer') {
      if (board.seerChecked != null) {
        board.log.push('The seer has learned a secret.');
      }
      board.seerChecked = null;
      this.startDay(state, board);
      state.version += 1;
      return;
    }

    if (board.phase === 'day_discuss') {
      board.phase = 'day_vote';
      board.votes = {};
      board.log.push(`Day ${board.day}: cast your votes.`);
      setTimer(8000);
      state.version += 1;
      return;
    }

    if (board.phase === 'day_vote') {
      // Tally votes (living players).
      const tally = new Map<number, number>();
      for (const [voter, target] of Object.entries(board.votes)) {
        if (board.players[Number(voter)].alive && board.players[target]?.alive) {
          tally.set(target, (tally.get(target) ?? 0) + 1);
        }
      }
      let lynched = -1;
      let max = 0;
      tally.forEach((count, target) => {
        if (count > max) {
          max = count;
          lynched = target;
        }
      });
      if (lynched >= 0 && max > 0) {
        board.players[lynched].alive = false;
        board.log.push(`The village lynched player ${lynched + 1} (${board.players[lynched].role}).`);
      } else {
        board.log.push('The village could not agree — no one was lynched.');
      }
      if (this.checkEnd(state, board)) return;
      board.day += 1;
      board.phase = 'night_kill';
      board.killTarget = null;
      board.log.push(`Night ${board.day} falls.`);
      setTimer(7000);
      state.version += 1;
      return;
    }
  }

  private startDay(state: GameState, board: WwBoard): void {
    board.phase = 'day_discuss';
    board.log.push(`Day ${board.day} begins — discuss who to lynch.`);
    board.phaseMs = 5000;
    board.phaseEndsAt = new Date(Date.now() + 5000).toISOString();
    state.version += 1;
  }

  private checkEnd(state: GameState, board: WwBoard): boolean {
    const wolves = board.players.filter((p) => p.alive && p.role === 'werewolf').length;
    const villagers = board.players.filter((p) => p.alive && p.role !== 'werewolf').length;
    if (wolves === 0) {
      board.winner = 'village';
      board.phase = 'ended';
      this.finish(state, board, 'village');
      return true;
    }
    if (wolves >= villagers) {
      board.winner = 'wolves';
      board.phase = 'ended';
      this.finish(state, board, 'wolves');
      return true;
    }
    return false;
  }

  private finish(state: GameState, board: WwBoard, winner: 'wolves' | 'village'): void {
    state.phase = 'completed';
    state.currentSeat = -1;
    state.scores = board.players.map((p) => {
      const isWolf = p.role === 'werewolf';
      const onWinningSide = winner === 'wolves' ? isWolf : !isWolf;
      return onWinningSide ? 1 : 0;
    });
    // Team win: record every seat on the winning faction.
    state.winnerSeats = board.players
      .map((p, i) => (winner === 'wolves' ? p.role === 'werewolf' : p.role !== 'werewolf') ? i : -1)
      .filter((i) => i >= 0);
    state.winnerSeat = state.winnerSeats[0] ?? null;
    state.version += 1;
  }

  /** Live social game: different seats act during different phases; validate
   * enforces role/alive/phase. Route any seated player's night/vote actions. */
  canSeatAct(state: GameState, action: GameAction): boolean {
    if (state.phase !== 'in_progress') return false;
    const board = state.board as unknown as WwBoard;
    const me = board.players[action.seat];
    if (!me || !me.alive) return false;
    if (action.type === 'vote') return board.phase === 'day_vote' && !(action.seat in board.votes);
    if (action.type === 'kill') return board.phase === 'night_kill' && me.role === 'werewolf';
    if (action.type === 'seer_check') return board.phase === 'night_seer' && me.role === 'seer';
    return false;
  }

  chooseBotMove(): BotMove {
    // Bots act inside the tick (real-time); no discrete move needed.
    return { action: { seat: -1, type: '__noop__', payload: {} }, delayMs: 0 };
  }

  protected redactHidden(state: GameState, seat: number): GameState {
    const board = state.board as unknown as WwBoard;
    const me = seat >= 0 ? board.players[seat] : null;
    const safePlayers = board.players.map((p, i) => {
      // Everyone sees who is alive; roles are secret except your own and
      // (for the seer) nothing extra is leaked here.
      const revealRole = seat >= 0 && i === seat;
      const isWolfMate = me?.role === 'werewolf' && p.role === 'werewolf';
      return {
        alive: p.alive,
        role: revealRole || isWolfMate ? p.role : null,
        seat: i,
      };
    });
    const safe: Record<string, unknown> = {
      phase: board.phase,
      day: board.day,
      phaseEndsAt: board.phaseEndsAt,
      players: safePlayers,
      votes: board.phase === 'day_vote' ? board.votes : {},
      log: board.log,
      myRole: me?.role ?? null,
    };
    return { ...state, board: safe };
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
