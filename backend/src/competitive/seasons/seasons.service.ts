import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EconomyService } from '../../economy/economy.service';
import { GameEntity } from '../../database/entities/game.entity';
import { ProfileEntity } from '../../database/entities/profile.entity';
import { RankingEntity } from '../../database/entities/ranking.entity';
import { SeasonEntity } from '../../database/entities/season.entity';
import { SeasonRewardClaimEntity } from '../../database/entities/season-reward-claim.entity';
import {
  DEFAULT_RATING,
  RANK_BANDS,
  RankBand,
  RankTier,
  TIER_ORDER,
  gameSeasonRewardForRank,
  tierForRating,
} from '../rank/rank.constants';

/** Length of a competitive season. */
const SEASON_LENGTH_MS = 28 * 24 * 60 * 60 * 1000; // 28 days

export interface SeasonView {
  id: string;
  name: string;
  seasonNumber: number;
  status: string;
  startsAt: string;
  endsAt: string;
  /** Milliseconds remaining until the season closes. */
  timeRemainingMs: number;
  rewards: Record<string, unknown> | null;
}

/**
 * Owns the competitive season lifecycle: provisioning the current + upcoming
 * seasons, rolling a finished season over (snapshotting tiers, granting tier
 * and game-specific rewards) and starting the next season. Rollover is
 * idempotent — it is safe to call repeatedly (guarded by season status and the
 * per-reward claim table).
 */
@Injectable()
export class SeasonsService {
  private readonly logger = new Logger(SeasonsService.name);

  constructor(
    @InjectRepository(SeasonEntity) private readonly seasons: Repository<SeasonEntity>,
    @InjectRepository(RankingEntity) private readonly rankings: Repository<RankingEntity>,
    @InjectRepository(SeasonRewardClaimEntity)
    private readonly claims: Repository<SeasonRewardClaimEntity>,
    @InjectRepository(GameEntity) private readonly games: Repository<GameEntity>,
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    private readonly economy: EconomyService,
    private readonly dataSource: DataSource,
  ) {}

  /** The currently active season, or null before the first bootstrap. */
  async activeSeason(): Promise<SeasonEntity | null> {
    return this.seasons.findOne({ where: { status: 'active' }, order: { seasonNumber: 'DESC' } });
  }

  /**
   * Ensures the season calendar is healthy: one active season covering "now"
   * and an upcoming season queued after it. Creates season 1 on first run.
   * Called on bootstrap and from the periodic maintenance tick.
   */
  async ensureCalendar(now: Date = new Date()): Promise<SeasonEntity> {
    const existing = await this.seasons.find({ order: { seasonNumber: 'DESC' }, take: 3 });
    const active = existing.find((s) => s.status === 'active');

    if (active) {
      // Roll over if the active season has passed its end date.
      if (active.endsAt.getTime() <= now.getTime()) {
        await this.rollover(active);
        return this.ensureCalendar(now);
      }
      // Queue the next season if missing.
      const hasUpcoming = existing.some((s) => s.status === 'upcoming' && s.seasonNumber === active.seasonNumber + 1);
      if (!hasUpcoming) await this.createSeason(active.seasonNumber + 1, new Date(active.endsAt.getTime()));
      return active;
    }

    // No active season: start season 1 (or resume the most recent upcoming one).
    const firstUpcoming = existing.find((s) => s.status === 'upcoming');
    if (firstUpcoming) {
      firstUpcoming.status = 'active';
      await this.seasons.save(firstUpcoming);
      this.logger.log(`Season ${firstUpcoming.seasonNumber} is now active.`);
      return firstUpcoming;
    }
    return this.createSeason(1, now);
  }

  /** Creates a season spanning [start, start + SEASON_LENGTH), with the next queued. */
  private async createSeason(number: number, start: Date): Promise<SeasonEntity> {
    const startsAt = new Date(start);
    const endsAt = new Date(startsAt.getTime() + SEASON_LENGTH_MS);
    const season = this.seasons.create({
      name: `Season ${number}`,
      seasonNumber: number,
      startsAt,
      endsAt,
      status: 'active',
      rewards: { tiers: RANK_BANDS.map((b) => ({ tier: b.tier, ...b.seasonReward })) },
    });
    await this.seasons.save(season);
    this.logger.log(`Created season ${number} (${startsAt.toISOString()} → ${endsAt.toISOString()}).`);

    // Always keep an upcoming season queued so the rollover boundary is smooth.
    const next = this.seasons.create({
      name: `Season ${number + 1}`,
      seasonNumber: number + 1,
      startsAt: endsAt,
      endsAt: new Date(endsAt.getTime() + SEASON_LENGTH_MS),
      status: 'upcoming',
      rewards: null,
    });
    await this.seasons.save(next);
    return season;
  }

  /**
   * Closes a finished season: computes each participant's best tier across the
   * games they played, snapshots `finalTier` on every ranking row, grants the
   * tier reward set plus per-game top-finisher rewards, then activates the next
   * season. Fully idempotent (claims table + status guard).
   */
  async rollover(season: SeasonEntity): Promise<void> {
    if (season.status === 'completed') return;
    return this.dataSource.transaction(async (manager) => {
      // Re-lock the season inside the transaction to avoid double-rollover.
      const locked = await manager.findOne(SeasonEntity, { where: { id: season.id } });
      if (!locked || locked.status === 'completed') return;

      const allRankings = await manager.find(RankingEntity, { where: { seasonId: locked.id } });
      const games = await manager.find(GameEntity);
      const gameName = new Map(games.map((g) => [g.id, g]));

      // 1) Snapshot tiers per ranking row and rank each game leaderboard.
      const userBestTier = new Map<string, RankBand>();
      const byGame = new Map<string, RankingEntity[]>();
      for (const row of allRankings) {
        const band = tierForRating(row.peakRating);
        row.finalTier = band.tier;
        row.rankPosition = null; // recomputed below
        await manager.save(row);

        const current = userBestTier.get(row.userId);
        if (!current || TIER_ORDER[band.tier] > TIER_ORDER[current.tier]) {
          userBestTier.set(row.userId, band);
        }
        const list = byGame.get(row.gameId) ?? [];
        list.push(row);
        byGame.set(row.gameId, list);
      }

      // 2) Per-game leaderboard ordering (highest peak first) → rank + rewards.
      for (const [gameId, rows] of byGame) {
        rows.sort((a, b) => b.peakRating - a.peakRating || b.wins - a.wins || a.matchesPlayed - b.matchesPlayed);
        for (let i = 0; i < rows.length; i++) {
          const rank = i + 1;
          rows[i].rankPosition = rank;
          await manager.save(rows[i]);
          const reward = gameSeasonRewardForRank(rank);
          if (reward) {
            await this.grantGameReward(manager, locked, rows[i], gameId, rank, reward, gameName.get(gameId)?.name);
          }
        }
      }

      // 3) Tier reward set (one per user, based on their overall best tier).
      for (const [userId, band] of userBestTier) {
        await this.grantTierReward(manager, locked, userId, band);
      }

      // 4) Mark the season completed and activate the next one.
      locked.status = 'completed';
      await manager.save(locked);

      const next = await manager.findOne(SeasonEntity, {
        where: { seasonNumber: locked.seasonNumber + 1 },
      });
      if (next) {
        next.status = 'active';
        await manager.save(next);
      } else {
        const startsAt = new Date(locked.endsAt.getTime());
        const created = manager.create(SeasonEntity, {
          name: `Season ${locked.seasonNumber + 1}`,
          seasonNumber: locked.seasonNumber + 1,
          startsAt,
          endsAt: new Date(startsAt.getTime() + SEASON_LENGTH_MS),
          status: 'active',
          rewards: { tiers: RANK_BANDS.map((b) => ({ tier: b.tier, ...b.seasonReward })) },
        });
        await manager.save(created);
        const queued = manager.create(SeasonEntity, {
          name: `Season ${locked.seasonNumber + 2}`,
          seasonNumber: locked.seasonNumber + 2,
          startsAt: created.endsAt,
          endsAt: new Date(created.endsAt.getTime() + SEASON_LENGTH_MS),
          status: 'upcoming',
          rewards: null,
        });
        await manager.save(queued);
      }
      this.logger.log(`Season ${locked.seasonNumber} rolled over; ${userBestTier.size} players rewarded.`);
    });
  }

  /** Grants the Bronze/Silver/Gold season reward set for a user (idempotent). */
  private async grantTierReward(
    manager: import('typeorm').EntityManager,
    season: SeasonEntity,
    userId: string,
    band: RankBand,
  ): Promise<void> {
    const exists = await manager.findOne(SeasonRewardClaimEntity, {
      where: { seasonId: season.id, userId, kind: 'tier' },
    });
    if (exists) return;

    await manager.save(
      manager.create(SeasonRewardClaimEntity, {
        seasonId: season.id,
        userId,
        kind: 'tier',
        gameId: null,
        rankAchieved: TIER_ORDER[band.tier],
        tier: band.tier,
        coinsGranted: band.seasonReward.coins,
        pipsGranted: band.seasonReward.pips,
        xpGranted: band.seasonReward.xp,
      }),
    );

    const ref = {
      type: 'season_reward' as const,
      referenceType: 'season',
      referenceId: `season:${season.id}:tier:${userId}`,
      description: `${band.label} season reward — ${season.name}`,
    };
    if (band.seasonReward.coins > 0) {
      await this.economy.credit(userId, 'coins', band.seasonReward.coins, ref, manager);
    }
    if (band.seasonReward.pips > 0) {
      await this.economy.credit(userId, 'pips', band.seasonReward.pips, ref, manager);
    }
    if (band.seasonReward.xp > 0) {
      await this.economy.grantXp(userId, band.seasonReward.xp, manager);
    }

    // Unlock the tier title + badge on the player's profile.
    const profile = await manager.findOne(ProfileEntity, { where: { userId } });
    if (profile) {
      const titles = new Set(profile.unlockedTitles ?? []);
      titles.add(band.seasonReward.title);
      profile.unlockedTitles = [...titles];
      if (!profile.activeTitle) profile.activeTitle = band.seasonReward.title;

      const badges = profile.badges ?? [];
      if (!badges.some((b) => b['code'] === band.seasonReward.badgeCode)) {
        badges.push({ code: band.seasonReward.badgeCode, label: `${band.label} Season`, earnedAt: new Date().toISOString() });
        profile.badges = badges;
      }
      await manager.save(profile);
    }
  }

  /** Grants the per-game top-finisher reward (idempotent per (season,game,user)). */
  private async grantGameReward(
    manager: import('typeorm').EntityManager,
    season: SeasonEntity,
    ranking: RankingEntity,
    gameId: string,
    rank: number,
    reward: { coins: number; pips: number; xp: number; badgeCode: string },
    gameName?: string,
  ): Promise<void> {
    const exists = await manager.findOne(SeasonRewardClaimEntity, {
      where: { seasonId: season.id, userId: ranking.userId, kind: 'game', gameId },
    });
    if (exists) return;

    await manager.save(
      manager.create(SeasonRewardClaimEntity, {
        seasonId: season.id,
        userId: ranking.userId,
        kind: 'game',
        gameId,
        rankAchieved: rank,
        tier: tierForRating(ranking.peakRating).tier as RankTier,
        coinsGranted: reward.coins,
        pipsGranted: reward.pips,
        xpGranted: reward.xp,
      }),
    );

    const ref = {
      type: 'season_reward' as const,
      referenceType: 'season_game',
      referenceId: `season:${season.id}:game:${gameId}:${ranking.userId}`,
      description: `Season top-${rank} in ${gameName ?? 'game'}`,
    };
    if (reward.coins > 0) await this.economy.credit(ranking.userId, 'coins', reward.coins, ref, manager);
    if (reward.pips > 0) await this.economy.credit(ranking.userId, 'pips', reward.pips, ref, manager);
    if (reward.xp > 0) await this.economy.grantXp(ranking.userId, reward.xp, manager);

    const profile = await manager.findOne(ProfileEntity, { where: { userId: ranking.userId } });
    if (profile) {
      const badges = profile.badges ?? [];
      if (!badges.some((b) => b['code'] === reward.badgeCode)) {
        badges.push({
          code: reward.badgeCode,
          label: `${gameName ?? 'Game'} Top ${rank}`,
          gameId,
          season: season.seasonNumber,
          earnedAt: new Date().toISOString(),
        });
        profile.badges = badges;
        await manager.save(profile);
      }
    }
  }

  /** Client-safe view of the active season with a countdown. */
  async activeSeasonView(now: Date = new Date()): Promise<SeasonView | null> {
    const season = await this.activeSeason();
    if (!season) return null;
    return {
      id: season.id,
      name: season.name,
      seasonNumber: season.seasonNumber,
      status: season.status,
      startsAt: season.startsAt.toISOString(),
      endsAt: season.endsAt.toISOString(),
      timeRemainingMs: Math.max(0, season.endsAt.getTime() - now.getTime()),
      rewards: season.rewards,
    };
  }

  /** Default starting rating used when a player has no ranking row yet. */
  defaultRating(): number {
    return DEFAULT_RATING;
  }

  /** Games list for leaderboard/game-scoped responses. */
  async gameMap(): Promise<Map<string, GameEntity>> {
    const games = await this.games.find();
    return new Map(games.map((g) => [g.id, g]));
  }

  /** Returns season ids that are currently active (for settlement scoping). */
  async activeSeasonId(): Promise<string | null> {
    const season = await this.activeSeason();
    return season?.id ?? null;
  }

  /** Games repository access for the leaderboard service (avoids re-query). */
  getGames(): Promise<GameEntity[]> {
    return this.games.find();
  }
}
