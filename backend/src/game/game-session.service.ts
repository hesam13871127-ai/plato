import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Server } from 'socket.io';
import type { AppConfig } from '../config/configuration';
import { BaseGameEngine } from './engine/base-game.engine';
import { EngineRegistry } from './engine/engine.registry';
import type { GameAction, GameState, MatchConfig, SeatInfo } from './engine/types';
import { BotService } from './bot/bot.service';
import { ResultsService, SeatResult } from './results.service';

export interface ActiveSession {
  sessionId: string;
  engine: BaseGameEngine;
  config: MatchConfig;
  state: GameState;
  /** Server-only: seat index → full seat info (includes isBot). */
  seats: SeatInfo[];
  gameId: string;
  roomId: string | null;
  isRanked: boolean;
  entryFeeCoins: number;
  /** playerId → seat index, for fast routing. */
  playerSeat: Map<string, number>;
  /** Seat → connected human socket presence (bots always "connected"). */
  connected: Map<number, Set<string>>;
  /**
   * Human seats whose player disconnected past the reconnect grace window.
   * The engine's bot brain plays these seats so the table never stalls; they
   * remain real users (results/XP still credited to them). Cleared on reconnect.
   */
  autoPlay: Set<number>;
  /** Seat index → pending bot-think timer (turn-based games). */
  botTimers: Map<number, NodeJS.Timeout>;
  /** Wall-clock loop driving live/real-time games (null for turn-based). */
  tickTimer: NodeJS.Timeout | null;
  /** Wall-clock start for duration accounting. */
  startedAt: number;
  /** True after results were persisted (guards double-settle). */
  settled: boolean;
  /** Full action history for replay. */
  log: Array<{ action: GameAction; version: number; at: string }>;
  /** Socket.io room name clients join. */
  channel: string;
}

export interface SessionSnapshot {
  sessionId: string;
  channel: string;
  /** Which engine/game this table runs (lets the client pick the board UI). */
  gameSlug: string;
  state: GameState;
  version: number;
}

/**
 * Owns every live game table. Sessions live in memory (game state is broadcast
 * and replay-persisted on finish); the engine drives validation and bot AI.
 *
 * Hidden information (hands, isBot) is NEVER broadcast: each client receives a
 * per-seat redacted view via {@link BaseGameEngine.playerView}; spectators get
 * {@link BaseGameEngine.spectatorView}.
 */
@Injectable()
export class GameSessionService {
  private readonly logger = new Logger(GameSessionService.name);
  private readonly sessions = new Map<string, ActiveSession>();
  private server: Server | null = null;
  private readonly reconnectGraceSeconds: number;
  private readonly thinkDivisor: number;

  constructor(
    private readonly engines: EngineRegistry,
    private readonly bots: BotService,
    private readonly results: ResultsService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.reconnectGraceSeconds = config.get('game.reconnectGraceSeconds', { infer: true });
    this.thinkDivisor = Math.max(0.01, config.get('game.botThinkDivisor', { infer: true }));
  }

  attachServer(server: Server): void {
    this.server = server;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** Iterates over live sessions (sessionId → session). */
  *all(): IterableIterator<[string, ActiveSession]> {
    for (const [id, session] of this.sessions) {
      if (!session.settled) yield [id, session];
    }
  }

  get(sessionId: string): ActiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Finds the live session created from a room. */
  getByRoom(roomId: string): ActiveSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.roomId === roomId && !session.settled) return session;
    }
    return undefined;
  }

  /** Finds any live session a player is seated in (used for reconnection). */
  getByPlayer(playerId: string): ActiveSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.playerSeat.has(playerId)) return session;
    }
    return undefined;
  }

  /** Starts a new table and returns its session. */
  start(params: {
    sessionId: string;
    gameSlug: string;
    gameId: string;
    roomId?: string | null;
    isRanked: boolean;
    entryFeeCoins?: number;
    seats: SeatInfo[];
    settings?: Record<string, unknown>;
  }): ActiveSession {
    const engine = this.engines.require(params.gameSlug);
    if (params.seats.length < engine.minPlayers || params.seats.length > engine.maxPlayers) {
      throw new Error(`${params.gameSlug} requires ${engine.minPlayers}–${engine.maxPlayers} seats.`);
    }
    const config: MatchConfig = {
      matchId: params.sessionId,
      gameSlug: params.gameSlug,
      seats: params.seats,
      isLive: engine.isLive,
      settings: params.settings,
    };
    const state = engine.createInitialState(config);
    const playerSeat = new Map<string, number>();
    const connected = new Map<number, Set<string>>();
    params.seats.forEach((seat, index) => {
      playerSeat.set(seat.playerId, index);
      // Bots are always present; humans connect their sockets afterwards.
      connected.set(index, seat.isBot ? new Set(['bot']) : new Set());
      state.seats[index].connected = seat.isBot;
    });
    this.stampCosmetics(params.seats, state);

    const session: ActiveSession = {
      sessionId: params.sessionId,
      engine,
      config,
      state,
      seats: params.seats,
      gameId: params.gameId,
      roomId: params.roomId ?? null,
      isRanked: params.isRanked,
      entryFeeCoins: params.entryFeeCoins ?? 0,
      playerSeat,
      connected,
      autoPlay: new Set<number>(),
      botTimers: new Map(),
      tickTimer: null,
      startedAt: Date.now(),
      settled: false,
      log: [],
      channel: `game:${params.sessionId}`,
    };
    this.sessions.set(params.sessionId, session);
    this.broadcast(session, 'game:start');
    this.logger.log(
      `Session started ${params.sessionId} (${params.gameSlug}, ${params.seats.length} seats, ` +
        `${params.seats.filter((s) => s.isBot).length} bots).`,
    );
    if (engine.isLive) {
      this.startTickLoop(session);
    } else {
      this.maybeScheduleBot(session);
    }
    return session;
  }

  /**
   * Wall-clock loop for live/real-time games. Every ~250 ms the engine gets a
   * chance to advance time-driven state (countdowns, bot reactions, physics
   * settlement…). We only broadcast when the engine bumps the version, so idle
   * ticks are cheap and clients are never spammed.
   */
  private startTickLoop(session: ActiveSession): void {
    if (session.tickTimer) return;
    session.tickTimer = setInterval(() => {
      if (session.settled || session.state.phase !== 'in_progress') {
        this.stopTickLoop(session);
        return;
      }
      const beforeVersion = session.state.version;
      const beforePhase = session.state.phase;
      // Expose AI-taken-over seats to live engines (pool/carrom) so a
      // disconnected human's aim phase is still played. Server-only field,
      // never included in any engine's redacted client view.
      (session.state as unknown as { __autoSeats?: boolean[] }).__autoSeats = session.seats.map(
        (s, i) => s.isBot || session.autoPlay.has(i),
      );
      const next = session.engine.tick(session.state, new Date());
      if (next !== session.state) {
        session.state = next;
        if (session.state.version !== beforeVersion) {
          session.log.push({
            action: { seat: -1, type: '__tick__', payload: { v: session.state.version } },
            version: session.state.version,
            at: new Date().toISOString(),
          });
          if (session.state.phase === 'completed') {
            this.broadcast(session, 'game:update');
            void this.settle(session);
            this.stopTickLoop(session);
            return;
          }
          this.broadcast(session, 'game:update');
        }
      } else if (beforePhase !== session.state.phase) {
        this.broadcast(session, 'game:update');
      }
    }, 250);
    // Don't keep the process alive solely for a game loop.
    (session.tickTimer as { unref?: () => void }).unref?.();
  }

  private stopTickLoop(session: ActiveSession): void {
    if (session.tickTimer) {
      clearInterval(session.tickTimer);
      session.tickTimer = null;
    }
  }

  // ── Socket presence / reconnection ────────────────────────────────────────

  /** Registers a live socket for a player. Returns the seat index or -1. */
  connectPlayer(session: ActiveSession, playerId: string, socketId: string): number {
    const seat = session.playerSeat.get(playerId);
    if (seat === undefined) return -1;
    const set = session.connected.get(seat)!;
    set.add(socketId);
    session.state.seats[seat].connected = true;
    // Reconnected human resumes control: cancel any AI takeover pending move.
    if (session.autoPlay.delete(seat)) {
      const pending = session.botTimers.get(seat);
      if (pending) {
        clearTimeout(pending);
        session.botTimers.delete(seat);
      }
    }
    this.broadcast(session, 'game:presence');
    return seat;
  }

  /** Marks a socket gone; if it was the last for that seat, starts grace. */
  disconnectPlayer(session: ActiveSession, socketId: string): void {
    for (const [seat, set] of session.connected) {
      if (set.delete(socketId)) {
        const seatInfo = session.seats[seat];
        if (!seatInfo.isBot && set.size === 0) {
          session.state.seats[seat].connected = false;
          this.broadcast(session, 'game:presence');
          this.scheduleAbandonCheck(session, seat);
        }
      }
    }
  }

  private scheduleAbandonCheck(session: ActiveSession, seat: number): void {
    const graceMs = this.reconnectGraceSeconds * 1000;
    setTimeout(() => {
      const current = this.sessions.get(session.sessionId);
      if (!current || current.settled) return;
      if (current.state.phase !== 'in_progress') return;
      if ((current.connected.get(seat)?.size ?? 0) > 0) return;
      // Opponent gone past the reconnect window: hand the seat to the engine's
      // AI for the rest of their absence so the table never stalls. A blind
      // "pass" is illegal in games where a legal move is forced (e.g. dominoes
      // with a playable tile), so we always use the engine's legal move brain.
      current.autoPlay.add(seat);
      this.logger.log(`Seat ${seat} did not reconnect; AI taking over until they return.`);
      if (current.state.phase === 'in_progress' && current.state.currentSeat === seat) {
        this.maybeScheduleBot(current);
      }
    }, graceMs).unref?.();
  }

  // ── Cosmetics ─────────────────────────────────────────────────────────────

  /**
   * Copies each seat's equipped cosmetics (piece set / board theme / dice) on
   * to the public seat descriptors. Cosmetics are public by design — every
   * player must see the pieces their opponents bought — and they are never a
   * bot tell (bots receive a rotating skin from the same catalogue).
   */
  private stampCosmetics(seats: SeatInfo[], state: GameState): void {
    seats.forEach((seat, index) => {
      const target = state.seats[index];
      if (!target) return;
      if (seat.cosmetics && Object.keys(seat.cosmetics).length > 0) {
        target.cosmetics = { ...seat.cosmetics };
      }
    });
  }

  /**
   * Some engines rebuild the seat array between rounds (trivia, charades…)
   * and would drop the cosmetic stamps; re-apply them on every outgoing view
   * so clients always render the right skins.
   */
  private withCosmetics(session: ActiveSession, view: GameState): GameState {
    let changed = false;
    const seats = view.seats.map((s, i) => {
      const cosmetics = session.seats[i]?.cosmetics;
      if (!cosmetics || Object.keys(cosmetics).length === 0 || s.cosmetics) return s;
      changed = true;
      return { ...s, cosmetics: { ...cosmetics } };
    });
    return changed ? { ...view, seats } : view;
  }

  // ── Views (redacted) ──────────────────────────────────────────────────────

  /** Full snapshot for a player seat (sees own hidden info). */
  viewForPlayer(session: ActiveSession, playerId: string): SessionSnapshot {
    const seat = session.playerSeat.get(playerId) ?? -1;
    return {
      sessionId: session.sessionId,
      channel: session.channel,
      gameSlug: session.config.gameSlug,
      version: session.state.version,
      state: this.withCosmetics(
        session,
        seat >= 0 ? session.engine.playerView(session.state, seat) : session.engine.spectatorView(session.state),
      ),
    };
  }

  /** Redacted snapshot for a spectator (no hidden info). */
  viewForSpectator(session: ActiveSession): SessionSnapshot {
    return {
      sessionId: session.sessionId,
      channel: session.channel,
      gameSlug: session.config.gameSlug,
      version: session.state.version,
      state: this.withCosmetics(session, session.engine.spectatorView(session.state)),
    };
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Validates and applies a human action. Throws with a friendly message on
   * illegal moves so the gateway can return an error to the acting client.
   */
  submitAction(session: ActiveSession, playerId: string, type: string, payload: Record<string, unknown>): { ok: boolean; error?: string } {
    const seat = session.playerSeat.get(playerId);
    if (seat === undefined) return { ok: false, error: 'You are not seated at this table.' };
    if (session.state.phase !== 'in_progress') return { ok: false, error: 'This game has already ended.' };
    const action: GameAction = { seat, type, payload };
    // The engine decides whether this seat is allowed to act now. Turn-based
    // games gate on the active seat; live games allow per-seat actions during
    // shared phases. validate() remains the final legality authority.
    if (!session.engine.canSeatAct(session.state, action)) {
      return { ok: false, error: 'It is not your turn.' };
    }
    return this.applyAction(session, action);
  }

  private applyAction(session: ActiveSession, action: GameAction): { ok: boolean; error?: string } {
    const validation = session.engine.validate(session.state, action);
    if (!validation.ok) {
      return { ok: false, error: validation.error ?? 'Illegal move.' };
    }
    // Clear any pending bot timer for the acting seat.
    const pending = session.botTimers.get(action.seat);
    if (pending) {
      clearTimeout(pending);
      session.botTimers.delete(action.seat);
    }

    session.state = session.engine.applyAction(session.state, action);
    session.state.version += 1;
    session.log.push({ action, version: session.state.version, at: new Date().toISOString() });

    if (session.state.phase === 'completed' && !session.settled) {
      this.broadcast(session, 'game:update');
      void this.settle(session);
      return { ok: true };
    }

    this.broadcast(session, 'game:update');
    this.maybeScheduleBot(session);
    return { ok: true };
  }

  // ── Bots ──────────────────────────────────────────────────────────────────

  private maybeScheduleBot(session: ActiveSession): void {
    if (session.state.phase !== 'in_progress') return;
    const seat = session.state.currentSeat;
    const info = session.seats[seat];
    if (!info) return;
    // The active seat is driven by AI when it is either a real bot or a human
    // who disconnected past the grace window (auto-play keeps the game moving).
    const drivenByAi = info.isBot || session.autoPlay.has(seat);
    if (!drivenByAi) return;
    if (session.botTimers.has(seat)) return;
    const move = session.engine.chooseBotMove(session.state, seat, info.botDifficulty ?? 'medium');
    // Normalise the move's seat to the active seat (engines should already).
    const action: GameAction = { ...move.action, seat };
    const delayMs = Math.max(0, Math.round(move.delayMs / this.thinkDivisor));
    const timer = setTimeout(() => {
      session.botTimers.delete(seat);
      this.applyAction(session, action);
    }, delayMs);
    // Don't keep the process alive solely for a bot think timer.
    (timer as { unref?: () => void }).unref?.();
    session.botTimers.set(seat, timer);
  }

  // ── Settlement ────────────────────────────────────────────────────────────

  private async settle(session: ActiveSession): Promise<void> {
    if (session.settled) return;
    session.settled = true;
    this.stopTickLoop(session);
    for (const timer of session.botTimers.values()) clearTimeout(timer);
    session.botTimers.clear();

    const winnerSeats = new Set<number>(
      session.state.winnerSeats && session.state.winnerSeats.length > 0
        ? session.state.winnerSeats
        : session.state.winnerSeat !== null && session.state.winnerSeat !== undefined
          ? [session.state.winnerSeat]
          : [],
    );
    const seats: SeatResult[] = session.seats.map((info, seat) => {
      const result: SeatResult['result'] =
        winnerSeats.size === 0 ? 'draw' : winnerSeats.has(seat) ? 'win' : 'loss';
      return {
        playerId: info.playerId,
        seatNumber: seat,
        isBot: info.isBot,
        score: session.state.scores[seat] ?? 0,
        result,
      };
    });

    try {
      const { matchId } = await this.results.settle({
        gameId: session.gameId,
        roomId: session.roomId,
        isRanked: session.isRanked,
        entryFeeCoins: session.entryFeeCoins,
        seats,
        replayData: {
          engine: session.config.gameSlug,
          log: session.log,
          finalBoard: session.state.board,
          finalScores: session.state.scores,
        },
        durationSeconds: Math.max(1, Math.round((Date.now() - session.startedAt) / 1000)),
      });
      this.broadcast(session, 'game:finish', { matchId, seats: this.publicResults(session, seats) });
      this.logger.log(`Settled session ${session.sessionId} → match ${matchId}.`);
    } catch (error) {
      this.logger.error(`Failed to settle session ${session.sessionId}`, error as Error);
    } finally {
      // Keep the session around briefly for late reconnects/final views, then evict.
      setTimeout(() => this.sessions.delete(session.sessionId), 15 * 60 * 1000).unref?.();
    }
  }

  /** Client-safe results: strips isBot entirely. */
  private publicResults(session: ActiveSession, seats: SeatResult[]): Array<Record<string, unknown>> {
    return seats.map((s, i) => ({
      seatNumber: s.seatNumber,
      playerId: s.playerId,
      displayName: session.seats[i].displayName,
      avatarUrl: session.seats[i].avatarUrl,
      score: s.score,
      result: s.result,
    }));
  }

  // ── Broadcast ─────────────────────────────────────────────────────────────

  private broadcast(session: ActiveSession, event: string, extra: Record<string, unknown> = {}): void {
    if (!this.server) return;
    const channel = this.server.to(session.channel);
    // Per-seat hidden info means we can't emit one shared payload to everyone:
    // emit a spectator-safe frame to the room, then private frames to each seat.
    const spectatorFrame = {
      sessionId: session.sessionId,
      gameSlug: session.config.gameSlug,
      version: session.state.version,
      state: this.withCosmetics(session, session.engine.spectatorView(session.state)),
      ...extra,
    };
    channel.emit(event, spectatorFrame);
    for (const info of session.seats) {
      if (info.isBot) continue;
      const seat = session.playerSeat.get(info.playerId)!;
      this.server
        .to(`user:${info.playerId}`)
        .emit(event, {
          sessionId: session.sessionId,
          gameSlug: session.config.gameSlug,
          version: session.state.version,
          state: this.withCosmetics(session, session.engine.playerView(session.state, seat)),
          ...extra,
        });
    }
  }
}
