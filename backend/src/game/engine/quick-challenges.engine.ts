import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import type { ActionResult, BotMove, GameAction, GameState, MatchConfig, SeatInfo } from './types';

type ChallengeType = 'tap' | 'reaction' | 'target_number' | 'direction';
type ChallengePhase = 'ready' | 'active' | 'reveal';

interface QcPlayer {
  score: number;
  finished: boolean;
  value: number | null; // taps / reaction ms / position
  rank: number | null;
}

interface QcBoard extends Record<string, unknown> {
  round: number;
  target: number;
  type: ChallengeType;
  phase: ChallengePhase;
  instruction: string;
  // tap
  tapGoal: number;
  // reaction
  reactStartAt: string | null;
  // target-number
  items: number[];
  targetNumber: number;
  // direction
  pointer: 'up' | 'down' | 'left' | 'right';
  players: QcPlayer[];
  phaseEndsAt: string;
  readyMs: number;
  activeMs: number;
  revealMs: number;
  // server-only
  botSeats: boolean[];
  botActAt: number[];
  botDifficulty: Array<SeatInfo['botDifficulty']>;
}

/**
 * Quick Challenges — a frantic live party game for 2–6 players made of six
 * short rounds, each a different 10-second minigame:
 *  - tap: tap as fast as possible to reach the target tap count.
 *  - reaction: wait for GO, then tap; fastest reaction wins.
 *  - target_number: tap the highlighted target number as fast as possible.
 *  - direction: tap in the direction of the arrow (mapped button index).
 * Top finishers score each round; the highest total after all rounds wins.
 * Bots react on difficulty-scaled timers.
 */
@Injectable()
export class QuickChallengesEngine extends BaseGameEngine {
  readonly slug = 'quick_challenges';
  readonly minPlayers = 2;
  readonly maxPlayers = 6;
  readonly isLive = true;

  private static readonly ROUNDS = 6;
  private static readonly READY_MS = 2600;
  private static readonly ACTIVE_MS = 8000;
  private static readonly REVEAL_MS = 3000;
  private static readonly TAP_GOAL = 20;

  createInitialState(matchConfig: MatchConfig): GameState {
    const n = matchConfig.seats.length;
    const start = Date.now();
    const board = this.buildRound(matchConfig, n, start, 0);
    return {
      phase: 'in_progress',
      turn: 0,
      currentSeat: -1,
      turnStartedAt: new Date().toISOString(),
      seats: matchConfig.seats.map((s, i) => ({
        seatNumber: i,
        playerId: s.playerId,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        connected: true,
        score: 0,
      })),
      board: board as unknown as Record<string, unknown>,
      winnerSeat: null,
      scores: matchConfig.seats.map(() => 0),
      version: 1,
    };
  }

  private buildRound(config: MatchConfig, n: number, start: number, round: number): QcBoard {
    const types: ChallengeType[] = ['tap', 'reaction', 'target_number', 'direction'];
    const type = types[round % types.length];
    const players: QcPlayer[] = Array.from({ length: n }, () => ({
      score: 0,
      finished: false,
      value: null,
      rank: null,
    }));

    const board: QcBoard = {
      round: round + 1,
      target: QuickChallengesEngine.ROUNDS,
      type,
      phase: 'ready',
      instruction: '',
      tapGoal: QuickChallengesEngine.TAP_GOAL,
      reactStartAt: null,
      items: [],
      targetNumber: 0,
      pointer: 'up',
      players,
      phaseEndsAt: new Date(start + QuickChallengesEngine.READY_MS).toISOString(),
      readyMs: QuickChallengesEngine.READY_MS,
      activeMs: QuickChallengesEngine.ACTIVE_MS,
      revealMs: QuickChallengesEngine.REVEAL_MS,
      botSeats: config.seats.map((s) => s.isBot),
      botActAt: config.seats.map((s, i) =>
        s.isBot ? start + QuickChallengesEngine.READY_MS + 500 + ((i * 853 + round * 449) % 4000) : Number.POSITIVE_INFINITY,
      ),
      botDifficulty: config.seats.map((s) => s.botDifficulty ?? 'medium'),
    };
    this.configureInstruction(board, start);
    return board;
  }

  private configureInstruction(board: QcBoard, now: number): void {
    switch (board.type) {
      case 'tap':
        board.instruction = `Tap ${board.tapGoal} times — fast!`;
        break;
      case 'reaction':
        board.instruction = 'Wait for GO… then tap!';
        break;
      case 'target_number': {
        const set = new Set<number>();
        while (set.size < 4) set.add(1 + Math.floor(Math.random() * 9));
        board.items = [...set];
        board.targetNumber = board.items[Math.floor(Math.random() * board.items.length)];
        board.instruction = 'Tap the target number!';
        break;
      }
      case 'direction': {
        const dirs: Array<QcBoard['pointer']> = ['up', 'down', 'left', 'right'];
        board.pointer = dirs[Math.floor(Math.random() * dirs.length)];
        board.instruction = 'Tap the arrow direction!';
        break;
      }
    }
    // Reaction GO time falls somewhere in the active window.
    board.reactStartAt =
      board.type === 'reaction'
        ? new Date(now + QuickChallengesEngine.READY_MS + 1500 + Math.floor(Math.random() * 3000)).toISOString()
        : null;
  }

  validate(state: GameState, action: GameAction): ActionResult {
    if (state.phase !== 'in_progress') return { ok: false, error: 'Game is not in progress.' };
    const board = state.board as unknown as QcBoard;
    if (action.seat < 0 || action.seat >= board.players.length) return { ok: false, error: 'Not a seat.' };
    const p = board.players[action.seat];
    if (p.finished) return { ok: false, error: 'You finished this round.' };
    if (board.phase !== 'active') {
      if (action.type === 'tap' && board.type === 'tap') return { ok: false, error: 'Wait for the round to start.' };
      return { ok: false, error: 'Wait for it…' };
    }

    switch (action.type) {
      case 'tap':
        if (board.type !== 'tap') return { ok: false, error: 'Wrong input for this round.' };
        return { ok: true };
      case 'react':
        if (board.type !== 'reaction') return { ok: false, error: 'Wrong input for this round.' };
        return { ok: true };
      case 'order_tap': {
        if (board.type !== 'target_number') return { ok: false, error: 'Wrong input for this round.' };
        const shown = (action.payload['number'] as number | undefined) ?? -1;
        if (shown !== board.targetNumber) return { ok: false, error: 'Not the target — wait!' };
        return { ok: true };
      }
      case 'direction_tap': {
        if (board.type !== 'direction') return { ok: false, error: 'Wrong input for this round.' };
        const dir = String(action.payload['dir'] ?? '');
        if (dir !== board.pointer) return { ok: false, error: 'Wrong direction!' };
        return { ok: true };
      }
      default:
        return { ok: false, error: 'Unknown action.' };
    }
  }

  applyAction(state: GameState, action: GameAction): GameState {
    const check = this.validate(state, action);
    if (!check.ok) throw new BadRequestException(check.error ?? 'Invalid action.');
    const board = state.board as unknown as QcBoard;
    const p = board.players[action.seat];
    const now = Date.now();

    switch (action.type) {
      case 'tap': {
        p.value = (p.value ?? 0) + 1;
        if ((p.value ?? 0) >= board.tapGoal) this.finishPlayer(board, action.seat, now, true);
        break;
      }
      case 'react': {
        if (board.reactStartAt && now >= new Date(board.reactStartAt).getTime()) {
          p.value = now - new Date(board.reactStartAt).getTime();
          this.finishPlayer(board, action.seat, now, false);
        } else {
          // Jumped the gun → worst result.
          p.value = Number.MAX_SAFE_INTEGER - 1;
          p.finished = true;
          p.rank = board.players.length;
          state.version += 1;
        }
        break;
      }
      case 'order_tap':
      case 'direction_tap': {
        p.value = now - new Date(board.phaseEndsAt).getTime() + board.activeMs;
        this.finishPlayer(board, action.seat, now, false);
        break;
      }
    }
    state.version += 1;
    return state;
  }

  private finishPlayer(board: QcBoard, seat: number, now: number, countBased: boolean): void {
    const p = board.players[seat];
    p.finished = true;
    // Rank by order of successful completion for tap/order/direction; for
    // reaction lower ms is better and is scored in settle.
    const done = board.players.filter((x) => x.finished && x.value !== Number.MAX_SAFE_INTEGER - 1);
    p.rank = done.length;
    void now;
    void countBased;
  }

  tick(state: GameState, now: Date): GameState {
    if (state.phase !== 'in_progress') return state;
    const board = state.board as unknown as QcBoard;
    const t = now.getTime();

    if (board.phase === 'ready' && t >= new Date(board.phaseEndsAt).getTime()) {
      board.phase = 'active';
      board.phaseEndsAt = new Date(t + QuickChallengesEngine.ACTIVE_MS).toISOString();
      // Schedule bot reaction GO actions for reaction rounds.
      board.players.forEach((_, seat) => {
        if (board.botSeats[seat]) {
          const goMs = board.reactStartAt ? new Date(board.reactStartAt).getTime() : t + 2000;
          board.botActAt[seat] = board.type === 'reaction'
            ? goMs + this.botReactionDelay(board, seat)
            : t + 600 + ((seat * 611) % (board.type === 'tap' ? 5000 : 4000));
        }
      });
      state.version += 1;
      return state;
    }

    if (board.phase === 'active') {
      this.driveBots(state, board, t);
      const timeUp = t >= new Date(board.phaseEndsAt).getTime();
      const allDone = board.players.every((p) => p.finished);
      if (timeUp || (board.type !== 'tap' && allDone)) {
        this.settleRound(state, board);
      }
      return state;
    }

    if (board.phase === 'reveal' && t >= new Date(board.phaseEndsAt).getTime()) {
      this.advance(state);
    }
    return state;
  }

  private driveBots(state: GameState, board: QcBoard, t: number): void {
    board.players.forEach((p, seat) => {
      if (!board.botSeats[seat] || p.finished) return;
      if (t < board.botActAt[seat]) return;
      switch (board.type) {
        case 'tap': {
          // Bots tap in bursts; schedule multiple taps until goal.
          p.value = (p.value ?? 0) + this.botTapBurst(board, seat);
          board.botActAt[seat] = t + 250 + Math.floor(Math.random() * 300);
          if ((p.value ?? 0) >= board.tapGoal) this.finishPlayer(board, seat, t, true);
          state.version += 1;
          break;
        }
        case 'reaction': {
          if (board.reactStartAt && t >= new Date(board.reactStartAt).getTime()) {
            p.value = Math.max(120, this.botReactionDelay(board, seat));
            this.finishPlayer(board, seat, t, false);
            state.version += 1;
          }
          break;
        }
        case 'target_number': {
          // Good bots tap the correct target number.
          if (Math.random() < this.botSkill(board, seat)) {
            p.value = t;
            this.finishPlayer(board, seat, t, false);
            state.version += 1;
          } else {
            board.botActAt[seat] = t + 2000;
          }
          break;
        }
        case 'direction': {
          if (Math.random() < this.botSkill(board, seat)) {
            p.value = t;
            this.finishPlayer(board, seat, t, false);
            state.version += 1;
          } else {
            board.botActAt[seat] = t + 1500;
          }
          break;
        }
      }
    });
  }

  private botTapBurst(board: QcBoard, seat: number): number {
    const speed: Record<NonNullable<SeatInfo['botDifficulty']>, number> = { easy: 2, medium: 3, hard: 4, expert: 5 };
    return speed[board.botDifficulty[seat] ?? 'medium'] + Math.floor(Math.random() * 2);
  }

  private botReactionDelay(board: QcBoard, seat: number): number {
    const delay: Record<NonNullable<SeatInfo['botDifficulty']>, number> = {
      easy: 900,
      medium: 650,
      hard: 450,
      expert: 280,
    };
    return delay[board.botDifficulty[seat] ?? 'medium'] + Math.floor(Math.random() * 200);
  }

  private botSkill(board: QcBoard, seat: number): number {
    const skill: Record<NonNullable<SeatInfo['botDifficulty']>, number> = { easy: 0.4, medium: 0.6, hard: 0.8, expert: 0.95 };
    return skill[board.botDifficulty[seat] ?? 'medium'];
  }

  private settleRound(state: GameState, board: QcBoard): void {
    // Rank finishers: taps/higher value-or-earlier depending on type.
    const finishers = board.players
      .map((p, i) => ({ seat: i, p }))
      .filter((x) => x.p.finished && x.p.value !== Number.MAX_SAFE_INTEGER - 1);

    let ordered: number[];
    if (board.type === 'reaction') {
      ordered = finishers.sort((a, b) => (a.p.value ?? 0) - (b.p.value ?? 0)).map((x) => x.seat);
    } else if (board.type === 'tap') {
      ordered = finishers.sort((a, b) => (b.p.value ?? 0) - (a.p.value ?? 0)).map((x) => x.seat);
    } else {
      ordered = finishers.sort((a, b) => (a.p.rank ?? 99) - (b.p.rank ?? 99)).map((x) => x.seat);
    }

    const points = [100, 60, 40, 20, 10, 10];
    ordered.forEach((seat, rank) => {
      board.players[seat].score += points[rank] ?? 10;
    });

    board.phase = 'reveal';
    board.phaseEndsAt = new Date(Date.now() + QuickChallengesEngine.REVEAL_MS).toISOString();
    state.scores = board.players.map((p) => p.score);
    state.version += 1;
  }

  private advance(state: GameState): void {
    const board = state.board as unknown as QcBoard;
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
    const totals = board.players.map((p) => p.score);
    const next = this.buildRound(
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
    );
    next.players.forEach((p, i) => (p.score = totals[i]));
    state.board = next as unknown as Record<string, unknown>;
    state.turn += 1;
    state.version += 1;
  }

  canSeatAct(state: GameState, action: GameAction): boolean {
    if (state.phase !== 'in_progress') return false;
    return action.seat >= 0 && ['tap', 'react', 'order_tap', 'direction_tap'].includes(action.type);
  }

  chooseBotMove(): BotMove {
    return { action: { seat: -1, type: '__noop__', payload: {} }, delayMs: 0 };
  }

  protected redactHidden(state: GameState, _seat: number): GameState {
    const board = state.board as unknown as QcBoard;
    const safe: Record<string, unknown> = {
      round: board.round,
      target: board.target,
      type: board.type,
      phase: board.phase,
      instruction: board.instruction,
      tapGoal: board.tapGoal,
      reactStartAt: board.reactStartAt,
      items: board.type === 'target_number' ? board.items : [],
      targetNumber: board.type === 'target_number' ? board.targetNumber : null,
      pointer: board.type === 'direction' ? board.pointer : null,
      phaseEndsAt: board.phaseEndsAt,
      activeMs: board.activeMs,
      readyMs: board.readyMs,
      players: board.players.map((p) => ({
        score: p.score,
        finished: p.finished,
        value: board.type === 'tap' ? (p.value ?? 0) : null,
      })),
    };
    return { ...state, board: safe };
  }
}
