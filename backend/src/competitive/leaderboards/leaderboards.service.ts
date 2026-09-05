import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FriendshipEntity } from '../../database/entities/friendship.entity';
import { GameEntity } from '../../database/entities/game.entity';
import { ProfileEntity } from '../../database/entities/profile.entity';
import { RankingEntity } from '../../database/entities/ranking.entity';
import { SeasonEntity } from '../../database/entities/season.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { RankTier, tierForRating } from '../rank/rank.constants';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  rating: number;
  peakRating: number;
  tier: RankTier;
  tierLabel: string;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  isBot: false;
  isSelf: boolean;
}

export interface MyRankingView {
  gameId: string | null;
  gameSlug: string | null;
  gameName: string | null;
  rating: number;
  peakRating: number;
  tier: RankTier;
  tierLabel: string;
  /** Aggregate/global rating (average across played games) — used for the global board. */
  globalRating: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
}

const LEADERBOARD_LIMIT = 100;

/**
 * Reads seasonal rankings for the leaderboard.
 *
 * Performance: every query is backed by the composite index
 * `idx_ranking_leaderboard (season_id, game_id, rating)` (and the unique
 * `(season_id, game_id, user_id)` index), so per-game boards are a single
 * indexed range scan + a small bounded `IN` lookup for profile names. The
 * global board aggregates one row per (user, game) for the active season in a
 * single query and ranks in application code over the small active-player set;
 * bots are never included.
 */
@Injectable()
export class LeaderboardsService {
  constructor(
    @InjectRepository(RankingEntity) private readonly rankings: Repository<RankingEntity>,
    @InjectRepository(SeasonEntity) private readonly seasons: Repository<SeasonEntity>,
    @InjectRepository(GameEntity) private readonly games: Repository<GameEntity>,
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(FriendshipEntity) private readonly friendships: Repository<FriendshipEntity>,
  ) {}

  private async activeSeasonId(): Promise<string | null> {
    const season = await this.seasons.findOne({ where: { status: 'active' }, order: { seasonNumber: 'DESC' } });
    return season?.id ?? null;
  }

  /** Global leaderboard across all games (aggregated mean rating per player). */
  async global(opts: { userId: string; scope: 'global' | 'friends'; limit?: number }): Promise<{
    entries: LeaderboardEntry[];
    self: LeaderboardEntry | null;
    totalPlayers: number;
  }> {
    const seasonId = await this.activeSeasonId();
    if (!seasonId) return { entries: [], self: null, totalPlayers: 0 };

    let rows = await this.rankings.find({ where: { seasonId } });
    if (opts.scope === 'friends') {
      const friendIds = await this.friendIds(opts.userId);
      const allowed = new Set([...friendIds, opts.userId]);
      rows = rows.filter((r) => allowed.has(r.userId));
    }

    // Aggregate mean rating per user across the games they played this season.
    const aggregated = this.aggregate(rows);
    const userIds = [...aggregated.keys()];

    const profiles = await this.profiles.find({ where: { userId: In(userIds) } });
    const bots = await this.botIds(userIds);
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

    const entries = this.toEntries(aggregated, profileByUser, bots, opts.userId, opts.limit ?? LEADERBOARD_LIMIT);
    const self = entries.find((e) => e.isSelf) ?? null;
    return { entries, self, totalPlayers: entries.length };
  }

  /** Per-game leaderboard for a single game slug in the active season. */
  async gameBoard(opts: {
    userId: string;
    gameSlug: string;
    scope: 'global' | 'friends';
    limit?: number;
  }): Promise<{ entries: LeaderboardEntry[]; self: LeaderboardEntry | null; totalPlayers: number }> {
    const seasonId = await this.activeSeasonId();
    const game = await this.games.findOne({ where: { slug: opts.gameSlug } });
    if (!seasonId || !game) return { entries: [], self: null, totalPlayers: 0 };

    let rows = await this.rankings.find({ where: { seasonId, gameId: game.id }, order: { rating: 'DESC' } });
    if (opts.scope === 'friends') {
      const friendIds = await this.friendIds(opts.userId);
      const allowed = new Set([...friendIds, opts.userId]);
      rows = rows.filter((r) => allowed.has(r.userId));
    }

    const map = new Map<string, RankingEntity>();
    for (const r of rows) if (!map.has(r.userId)) map.set(r.userId, r);

    const userIds = [...map.keys()];
    const profiles = await this.profiles.find({ where: { userId: In(userIds) } });
    const bots = await this.botIds(userIds);
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

    // For a single game the rating is the row rating directly.
    const agg = new Map<string, { rating: number; peak: number; wins: number; losses: number; draws: number; matches: number }>();
    for (const [uid, r] of map) {
      agg.set(uid, { rating: r.rating, peak: r.peakRating, wins: r.wins, losses: r.losses, draws: r.draws, matches: r.matchesPlayed });
    }

    const entries = this.toEntries(agg, profileByUser, bots, opts.userId, opts.limit ?? LEADERBOARD_LIMIT);
    const self = entries.find((e) => e.isSelf) ?? null;
    return { entries, self, totalPlayers: entries.length };
  }

  /** The requesting player's ranking across each game + an overall (global) rating. */
  async myRankings(userId: string): Promise<{ global: MyRankingView | null; games: MyRankingView[] }> {
    const seasonId = await this.activeSeasonId();
    if (!seasonId) return { global: null, games: [] };

    const rows = await this.rankings.find({ where: { seasonId, userId } });
    if (rows.length === 0) return { global: null, games: [] };

    const gameIds = [...new Set(rows.map((r) => r.gameId))];
    const games = await this.games.find({ where: { id: In(gameIds) } });
    const gameById = new Map(games.map((g) => [g.id, g]));

    const games2: MyRankingView[] = rows.map((r) => {
      const g = gameById.get(r.gameId);
      const band = tierForRating(r.rating);
      return {
        gameId: r.gameId,
        gameSlug: g?.slug ?? null,
        gameName: g?.name ?? null,
        rating: r.rating,
        peakRating: r.peakRating,
        tier: band.tier,
        tierLabel: band.label,
        globalRating: r.rating,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        matchesPlayed: r.matchesPlayed,
      };
    });

    // Global = mean of the player's per-game ratings (same aggregation as the board).
    const mean = Math.round(rows.reduce((s, r) => s + r.rating, 0) / rows.length);
    const peak = Math.max(...rows.map((r) => r.peakRating));
    const band = tierForRating(mean);
    const global: MyRankingView = {
      gameId: null,
      gameSlug: null,
      gameName: null,
      rating: mean,
      peakRating: peak,
      tier: band.tier,
      tierLabel: band.label,
      globalRating: mean,
      wins: rows.reduce((s, r) => s + r.wins, 0),
      losses: rows.reduce((s, r) => s + r.losses, 0),
      draws: rows.reduce((s, r) => s + r.draws, 0),
      matchesPlayed: rows.reduce((s, r) => s + r.matchesPlayed, 0),
    };

    games2.sort((a, b) => b.rating - a.rating);
    return { global, games: games2 };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Mean rating + summed stats per user from raw ranking rows. */
  private aggregate(rows: RankingEntity[]): Map<string, { rating: number; peak: number; wins: number; losses: number; draws: number; matches: number }> {
    const byUser = new Map<string, { sum: number; count: number; peak: number; wins: number; losses: number; draws: number; matches: number }>();
    for (const r of rows) {
      const cur = byUser.get(r.userId) ?? { sum: 0, count: 0, peak: 0, wins: 0, losses: 0, draws: 0, matches: 0 };
      cur.sum += r.rating;
      cur.count += 1;
      cur.peak = Math.max(cur.peak, r.peakRating);
      cur.wins += r.wins;
      cur.losses += r.losses;
      cur.draws += r.draws;
      cur.matches += r.matchesPlayed;
      byUser.set(r.userId, cur);
    }
    const result = new Map<string, { rating: number; peak: number; wins: number; losses: number; draws: number; matches: number }>();
    for (const [uid, c] of byUser) {
      result.set(uid, {
        rating: Math.round(c.sum / c.count),
        peak: c.peak,
        wins: c.wins,
        losses: c.losses,
        draws: c.draws,
        matches: c.matches,
      });
    }
    return result;
  }

  private toEntries(
    agg: Map<string, { rating: number; peak: number; wins: number; losses: number; draws: number; matches: number }>,
    profileByUser: Map<string, ProfileEntity>,
    bots: Set<string>,
    selfId: string,
    limit: number,
  ): LeaderboardEntry[] {
    const ranked = [...agg.entries()]
      .filter(([uid]) => !bots.has(uid)) // bots are invisible on the ladder
      .map(([uid, s]) => {
        const p = profileByUser.get(uid);
        const band = tierForRating(s.rating);
        return {
          userId: uid,
          displayName: p?.displayName ?? 'Player',
          username: p?.username ?? 'player',
          avatarUrl: p?.avatarUrl ?? null,
          rating: s.rating,
          peakRating: s.peak,
          tier: band.tier,
          tierLabel: band.label,
          wins: s.wins,
          losses: s.losses,
          draws: s.draws,
          matchesPlayed: s.matches,
        };
      })
      .sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.matchesPlayed - b.matchesPlayed);

    return ranked.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1, isBot: false as const, isSelf: e.userId === selfId }));
  }

  private async botIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const bots = await this.users.find({ where: { id: In(userIds), isBot: true }, select: { id: true } });
    return new Set(bots.map((b) => b.id));
  }

  private async friendIds(userId: string): Promise<string[]> {
    const friends = await this.friendships.find({
      where: [{ requesterId: userId, status: 'accepted' }, { addresseeId: userId, status: 'accepted' }],
    });
    return friends.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
  }
}
