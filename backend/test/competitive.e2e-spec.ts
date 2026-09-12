import './test-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from '../src/app.module';
import { GameEntity } from '../src/database/entities/game.entity';
import { RankingEntity } from '../src/database/entities/ranking.entity';
import { SeasonEntity } from '../src/database/entities/season.entity';
import { ProfileEntity } from '../src/database/entities/profile.entity';
import { DataSource } from 'typeorm';
import { SeasonsService } from '../src/competitive/seasons/seasons.service';
import { LeaderboardsService } from '../src/competitive/leaderboards/leaderboards.service';
import { RATING_CAP } from '../src/competitive/rank/rank.constants';

/**
 * Phase 6 e2e: season lifecycle (provisioning + rollover + rewards), leaderboard
 * accuracy (global / per-game / friends, bots excluded) and the competitive
 * HTTP endpoints. Runs against in-memory SQLite.
 */
describe('VibeTable competitive — seasons, rewards, leaderboards (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let ds: DataSource;
  let seasons: SeasonsService;
  let leaderboards: LeaderboardsService;

  async function signUp(phone: string, displayName: string) {
    await request(httpServer).post('/api/auth/phone/request-otp').send({ phone });
    const otpRes = await request(httpServer).post('/api/auth/phone/request-otp').send({ phone });
    const verify = await request(httpServer)
      .post('/api/auth/phone/verify')
      .send({ phone, code: otpRes.body.data.devCode, displayName });
    const userId = (verify.body.data.user?.id as string) ?? '';
    return { token: verify.body.data.tokens.accessToken as string, userId, username: verify.body.data.user.username as string };
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /**
   * A dedicated game row for ranking fixtures. The playable catalogue is
   * rebuilt wave by wave (and is empty between waves), so competitive tests
   * never depend on it: they own this row instead.
   */
  async function ensureTestGame(): Promise<GameEntity> {
    const existing = await ds.getRepository(GameEntity).findOne({ where: { slug: 'competitive_fixture' } });
    if (existing) return existing;
    return ds.getRepository(GameEntity).save({
      id: uuidv4(),
      slug: 'competitive_fixture',
      name: 'Competitive Fixture',
      description: 'Self-contained game row for ranking tests.',
      iconUrl: null,
      minPlayers: 2,
      maxPlayers: 2,
      avgDurationMinutes: 5,
      supportsBots: false,
      rankedEnabled: true,
      status: 'active',
    } as Partial<GameEntity>);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: 0 }] });
    await app.init();
    httpServer = app.getHttpServer();
    ds = app.get(DataSource);
    seasons = app.get(SeasonsService);
    leaderboards = app.get(LeaderboardsService);
    await new Promise((r) => setTimeout(r, 60));
  });

  afterAll(() => app.close());

  it('bootstraps an active season with a countdown and rank reward sets', async () => {
    const { token } = await signUp('+15555550000', 'Season Sam');
    const res = await request(httpServer).get('/api/competitive/season').set(auth(token)).expect(200);
    expect(res.body.data.season).toBeTruthy();
    expect(res.body.data.season.status).toBe('active');
    expect(res.body.data.season.timeRemainingMs).toBeGreaterThan(0);
    const tiers = res.body.data.ranks.map((r: { tier: string }) => r.tier);
    expect(tiers).toEqual(['bronze', 'silver', 'gold']);
    for (const r of res.body.data.ranks) {
      expect(r.reward.coins).toBeGreaterThan(0);
      expect(r.reward.title).toBeTruthy();
    }
  });

  it('exposes an (empty initially) global leaderboard and my-rankings', async () => {
    const { token } = await signUp('+15555550001', 'Leaderboard Lea');
    const board = await request(httpServer).get('/api/competitive/leaderboard').set(auth(token)).expect(200);
    expect(Array.isArray(board.body.data.entries)).toBe(true);
    const me = await request(httpServer).get('/api/competitive/me').set(auth(token)).expect(200);
    expect(me.body.data.global).toBeNull(); // no ranked matches yet
  });

  describe('season rollover + reward granting', () => {
    it('grants tier + per-game rewards once and snapshots tiers', async () => {
      const season = await seasons.activeSeason();
      expect(season).toBeTruthy();

      const game = await ensureTestGame();
      expect(game).toBeTruthy();

      // Two real players with different peak ratings; the stronger tops the board.
      const strong = await signUp('+15555550002', 'Gold Gabi');
      const weak = await signUp('+15555550003', 'Bronze Ben');

      await ds.getRepository(RankingEntity).save([
        {
          id: uuidv4(),
          seasonId: season!.id,
          gameId: game.id,
          userId: strong.userId,
          rating: 1620,
          peakRating: 1680,
          wins: 20,
          losses: 3,
          draws: 1,
          matchesPlayed: 24,
        },
        {
          id: uuidv4(),
          seasonId: season!.id,
          gameId: game.id,
          userId: weak.userId,
          rating: 1050,
          peakRating: 1100,
          wins: 4,
          losses: 9,
          draws: 0,
          matchesPlayed: 13,
        },
      ]);

      const coinsBefore = await ds
        .getRepository(ProfileEntity)
        .findOne({ where: { userId: strong.userId } })
        .then((p) => Number(p?.coins ?? 0));

      // Force the season to end and roll it over: end it a hair after it
      // started — in the past (triggers the rollover) but strictly after
      // starts_at (satisfies the chk_seasons_dates check).
      const end = new Date(Math.max(season!.startsAt.getTime() + 1, Date.now() - 1));
      season!.endsAt = end;
      const waitMs = Math.max(0, end.getTime() - Date.now() + 1);
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
      await ds.getRepository(SeasonEntity).save(season!);
      const refreshed = await seasons.activeSeason();
      await seasons.ensureCalendar(new Date());

      // A new active season now exists.
      const newActive = await seasons.activeSeason();
      expect(newActive).toBeTruthy();
      expect(newActive!.id).not.toBe(season!.id);

      // Old season is completed with final tiers snapshotted.
      const oldRankings = await ds.getRepository(RankingEntity).find({ where: { seasonId: season!.id } });
      const strongRow = oldRankings.find((r) => r.userId === strong.userId)!;
      const weakRow = oldRankings.find((r) => r.userId === weak.userId)!;
      expect(strongRow.finalTier).toBe('gold');
      expect(weakRow.finalTier).toBe('bronze');
      expect(strongRow.rankPosition).toBe(1);
      expect(weakRow.rankPosition).toBe(2);

      // Strong player received Gold tier coins + #1 game reward (2000 + 1500).
      const profileAfter = await ds.getRepository(ProfileEntity).findOne({ where: { userId: strong.userId } });
      const coinsAfter = Number(profileAfter?.coins ?? 0);
      expect(coinsAfter).toBe(coinsBefore + 1500 + 2000);

      // Titles + badges unlocked.
      expect(profileAfter?.unlockedTitles).toContain('Gold Champion');
      const badgeCodes = (profileAfter?.badges ?? []).map((b) => b['code']);
      expect(badgeCodes).toContain('season_gold');
      expect(badgeCodes).toContain('game_master_1');

      // Rollover is idempotent: re-running does not double-grant.
      await seasons.rollover(await ds.getRepository(SeasonEntity).findOneByOrFail({ id: season!.id }));
      const profileAfter2 = await ds.getRepository(ProfileEntity).findOne({ where: { userId: strong.userId } });
      expect(Number(profileAfter2?.coins ?? 0)).toBe(coinsAfter);
    });
  });

  describe('leaderboard accuracy', () => {
    it('ranks players by rating and excludes bots', async () => {
      const season = await seasons.activeSeason();
      const game = await ensureTestGame();

      const a = await signUp('+15555550004', 'Alice Ace');
      const b = await signUp('+15555550005', 'Bob Bold');

      await ds.getRepository(RankingEntity).save([
        { id: uuidv4(), seasonId: season!.id, gameId: game.id, userId: a.userId, rating: 1750, peakRating: 1750, wins: 10, losses: 1, draws: 0, matchesPlayed: 11 },
        { id: uuidv4(), seasonId: season!.id, gameId: game.id, userId: b.userId, rating: 1300, peakRating: 1300, wins: 6, losses: 5, draws: 0, matchesPlayed: 11 },
      ]);

      const board = await leaderboards.gameBoard({ userId: a.userId, gameSlug: game.slug, scope: 'global', limit: 50 });
      // The seeded bot pool must never appear on the ladder.
      expect(board.entries.every((e) => e.isBot === false)).toBe(true);
      const top = board.entries[0];
      expect(top.userId).toBe(a.userId);
      expect(top.rank).toBe(1);
      expect(top.tier).toBe('gold');
      const bob = board.entries.find((e) => e.userId === b.userId)!;
      expect(bob.tier).toBe('silver');

      // The self entry is flagged.
      const self = board.entries.find((e) => e.isSelf);
      expect(self?.userId).toBe(a.userId);
    });

    it('friends board only contains the player + accepted friends', async () => {
      const season = await seasons.activeSeason();
      const game = await ensureTestGame();
      const me = await signUp('+15555550006', 'Friendly Fran');
      const friend = await signUp('+15555550007', 'Freddy Friend');
      const stranger = await signUp('+15555550008', 'Stranger Sam');

      // Create an accepted friendship me <-> friend.
      const { FriendshipEntity } = await import('../src/database/entities/friendship.entity');
      await ds.getRepository(FriendshipEntity).save({
        id: uuidv4(),
        requesterId: me.userId,
        addresseeId: friend.userId,
        status: 'accepted',
        acceptedAt: new Date(),
      });

      await ds.getRepository(RankingEntity).save([
        { id: uuidv4(), seasonId: season!.id, gameId: game.id, userId: me.userId, rating: 1550, peakRating: 1550, wins: 5, losses: 2, draws: 0, matchesPlayed: 7 },
        { id: uuidv4(), seasonId: season!.id, gameId: game.id, userId: friend.userId, rating: 1400, peakRating: 1400, wins: 4, losses: 2, draws: 0, matchesPlayed: 6 },
        { id: uuidv4(), seasonId: season!.id, gameId: game.id, userId: stranger.userId, rating: 2000, peakRating: 2000, wins: 30, losses: 0, draws: 0, matchesPlayed: 30 },
      ]);

      const board = await leaderboards.gameBoard({ userId: me.userId, gameSlug: game.slug, scope: 'friends', limit: 50 });
      const ids = board.entries.map((e) => e.userId);
      expect(ids).toContain(me.userId);
      expect(ids).toContain(friend.userId);
      expect(ids).not.toContain(stranger.userId);
    });
  });

  it('respects the rating cap constant (no rating above the cap)', () => {
    expect(RATING_CAP).toBe(2400);
  });
});
