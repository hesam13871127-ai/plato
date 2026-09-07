import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import type { Server } from 'socket.io';
import type { AppConfig } from '../config/configuration';
import { GameEntity } from '../database/entities/game.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { RankingEntity } from '../database/entities/ranking.entity';
import { SeasonEntity } from '../database/entities/season.entity';
import { BotService } from './bot/bot.service';
import { CosmeticsService } from './cosmetics.service';
import { GameSessionService } from './game-session.service';
import type { SeatInfo } from './engine/types';

interface QueueEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  language: string | null;
  region: string | null;
  gameSlug: string;
  gameId: string;
  isRanked: boolean;
  totalSeats: number;
  enqueuedAt: number;
  fallbackTimer: NodeJS.Timeout;
}

const DEFAULT_RATING = 1000;

/**
 * Smart matchmaking queue.
 *
 * Compatibility = same game + same ranked/casual mode + skill rating within a
 * gap that widens the longer a player waits. Language and region act as
 * soft preferences (closest opponents first). If no suitable real opponent is
 * found within `MATCHMAKING_BOT_FALLBACK_SECONDS` (default 30s), the table is
 * filled with invisible, human-like bots of matching skill via BotService.
 *
 * Bots are indistinguishable on the wire: their seats carry ordinary profile
 * data and never an is_bot flag.
 */
@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);
  private readonly queue: QueueEntry[] = [];
  private server: Server | null = null;
  private readonly fallbackSeconds: number;
  private readonly maxRatingGap: number;

  constructor(
    @InjectRepository(GameEntity) private readonly games: Repository<GameEntity>,
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(RankingEntity) private readonly rankings: Repository<RankingEntity>,
    @InjectRepository(SeasonEntity) private readonly seasons: Repository<SeasonEntity>,
    private readonly bots: BotService,
    private readonly sessions: GameSessionService,
    private readonly cosmetics: CosmeticsService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.fallbackSeconds = config.get('game.botFallbackSeconds', { infer: true });
    this.maxRatingGap = config.get('game.maxRatingGap', { infer: true });
  }

  attachServer(server: Server): void {
    this.server = server;
  }

  queueSize(): number {
    return this.queue.length;
  }

  /** Adds (or refreshes) a player in the queue and attempts an instant match. */
  async enqueue(
    user: { id: string; displayName: string; avatarUrl: string | null },
    params: { gameSlug: string; isRanked: boolean; seats?: number },
  ): Promise<{ status: 'queued' | 'matched'; sessionId?: string; waitSeconds: number }> {
    const game = await this.games.findOne({ where: { slug: params.gameSlug } });
    if (!game || game.status !== 'active') {
      throw new BadRequestException('That game is not available.');
    }
    const totalSeats = Math.max(game.minPlayers, Math.min(game.maxPlayers, params.seats ?? game.minPlayers));

    // One queue position per player — replace any stale entry.
    this.cancel(user.id, false);

    const [rating, language, region] = await this.playerContext(user.id, game.id);
    const entry: QueueEntry = {
      userId: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      rating,
      language,
      region,
      gameSlug: params.gameSlug,
      gameId: game.id,
      isRanked: params.isRanked,
      totalSeats,
      enqueuedAt: Date.now(),
      fallbackTimer: setTimeout(() => {
        void this.fillWithBots(entry);
      }, this.fallbackSeconds * 1000),
    };
    entry.fallbackTimer.unref?.();
    this.queue.push(entry);
    this.emitStatus(entry, 'queued', 1);

    const matched = await this.tryForm(entry);
    if (matched) return { status: 'matched', sessionId: matched, waitSeconds: 0 };
    return { status: 'queued', waitSeconds: this.fallbackSeconds };
  }

  /** Removes a player from the queue (manual cancel or matched). */
  cancel(userId: string, notify = true): void {
    const idx = this.queue.findIndex((e) => e.userId === userId);
    if (idx === -1) return;
    const [entry] = this.queue.splice(idx, 1);
    clearTimeout(entry.fallbackTimer);
    if (notify) this.server?.to(`user:${userId}`).emit('matchmaking:status', { state: 'cancelled' });
  }

  isQueued(userId: string): boolean {
    return this.queue.some((e) => e.userId === userId);
  }

  // ── Matching ──────────────────────────────────────────────────────────────

  /** Gap widens with wait so matches always happen; starts at maxRatingGap. */
  private gapFor(entry: QueueEntry): number {
    const waited = (Date.now() - entry.enqueuedAt) / 1000;
    return this.maxRatingGap + waited * 25;
  }

  /**
   * Attempts to build a table around `entry` from compatible humans.
   * Forms immediately once two compatible humans exist for a 2-seat request;
   * larger tables form when full or via the bot fallback timer.
   */
  private async tryForm(entry: QueueEntry): Promise<string | null> {
    const compatible = this.queue
      .filter(
        (e) =>
          e.gameSlug === entry.gameSlug &&
          e.isRanked === entry.isRanked &&
          e.userId !== entry.userId &&
          Math.abs(e.rating - entry.rating) <= this.gapFor(entry),
      )
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt);

    const humans = [entry, ...compatible];
    const wantFull = entry.totalSeats;
    if (humans.length >= wantFull) {
      return await this.form(humans.slice(0, wantFull), entry);
    }
    // Common case: 2-seat request, two compatible humans ready → start now.
    if (entry.totalSeats === 2 && humans.length >= 2) {
      return await this.form(humans.slice(0, 2), entry);
    }
    // Keep waiting for more humans; report progress.
    this.emitStatus(entry, 'searching', humans.length);
    return null;
  }

  /** 30-second fallback: start with every compatible human, bots fill seats. */
  private async fillWithBots(entry: QueueEntry): Promise<void> {
    const queuedIdx = this.queue.findIndex((e) => e.userId === entry.userId);
    if (queuedIdx === -1) return; // matched/cancelled in the meantime.

    const compatible = this.queue
      .filter((e) => e.gameSlug === entry.gameSlug && e.isRanked === entry.isRanked && e.userId !== entry.userId)
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    const humans = [entry, ...compatible].slice(0, entry.totalSeats);
    await this.form(humans, entry);
  }

  private async form(humans: QueueEntry[], anchor: QueueEntry): Promise<string> {
    // Consume all human entries from the queue atomically.
    const ids = new Set(humans.map((h) => h.userId));
    for (const e of this.queue.filter((q) => ids.has(q.userId))) {
      clearTimeout(e.fallbackTimer);
    }
    const remaining = this.queue.filter((q) => !ids.has(q.userId));
    this.queue.length = 0;
    this.queue.push(...remaining);

    const seats: SeatInfo[] = humans.map((h) => ({
      playerId: h.userId,
      seatNumber: 0,
      isBot: false,
      displayName: h.displayName,
      avatarUrl: h.avatarUrl,
    }));

    // Fill empty seats with invisible, skill-matched bots.
    const usedBots = new Set<string>();
    const humanAverageRating = Math.round(humans.reduce((sum, h) => sum + h.rating, 0) / Math.max(1, humans.length));
    while (seats.length < anchor.totalSeats) {
      const bot = await this.bots.pickClosest({
        rating: humanAverageRating || humans[0]?.rating || DEFAULT_RATING,
        language: anchor.language,
        region: anchor.region,
        excludeUserIds: [...ids, ...usedBots],
      });
      usedBots.add(bot.userId);
      seats.push({
        playerId: bot.userId,
        seatNumber: 0,
        isBot: true,
        botDifficulty: bot.difficulty,
        displayName: bot.displayName,
        avatarUrl: bot.avatarUrl,
        rating: bot.rating,
      } as SeatInfo);
    }

    // Shuffle seating so bot/human positions feel natural.
    for (let i = seats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seats[i], seats[j]] = [seats[j], seats[i]];
    }
    seats.forEach((seat, index) => {
      seat.seatNumber = index;
    });
    // Attach each player's equipped pieces / board / dice (public cosmetics).
    await this.cosmetics.decorateSeats(seats, anchor.gameSlug);

    const sessionId = uuidv4();
    const session = this.sessions.start({
      sessionId,
      gameSlug: anchor.gameSlug,
      gameId: anchor.gameId,
      roomId: null,
      isRanked: anchor.isRanked,
      entryFeeCoins: 0,
      seats,
      settings: { source: 'matchmaking' },
    });

    for (const human of humans) {
      this.server?.to(`user:${human.userId}`).emit('matchmaking:found', {
        sessionId,
        channel: session.channel,
        gameSlug: anchor.gameSlug,
        isRanked: anchor.isRanked,
        waitSeconds: Math.round((Date.now() - human.enqueuedAt) / 1000),
      });
    }
    this.logger.log(`Match formed for ${humans.map((h) => h.userId).join(', ')} (${seats.length} seats).`);
    return sessionId;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async playerContext(userId: string, gameId: string): Promise<[number, string | null, string | null]> {
    const profile = await this.profiles.findOne({ where: { userId } });
    const settings = (profile?.settings ?? {}) as { language?: string; region?: string };
    const season = await this.seasons.findOne({ where: { status: 'active' }, order: { seasonNumber: 'DESC' } });
    let rating = DEFAULT_RATING;
    if (season) {
      const ranking = await this.rankings.findOne({ where: { seasonId: season.id, gameId, userId } });
      if (ranking) rating = ranking.rating;
    }
    return [rating, settings.language ?? null, settings.region ?? null];
  }

  private emitStatus(entry: QueueEntry, state: 'queued' | 'searching', playersFound: number): void {
    this.server?.to(`user:${entry.userId}`).emit('matchmaking:status', {
      state,
      gameSlug: entry.gameSlug,
      isRanked: entry.isRanked,
      playersFound,
      waitedSeconds: Math.round((Date.now() - entry.enqueuedAt) / 1000),
      fallbackInSeconds: Math.max(0, this.fallbackSeconds - Math.round((Date.now() - entry.enqueuedAt) / 1000)),
    });
  }
}
