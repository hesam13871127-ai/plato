import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { EconomyService } from '../economy/economy.service';
import {
  DEFAULT_RATING,
  applyEloDelta,
  expectedScore,
  kFactorFor,
} from '../competitive/rank/rank.constants';
import { MatchEntity } from '../database/entities/match.entity';
import { MatchPlayerEntity } from '../database/entities/match-player.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { RankingEntity } from '../database/entities/ranking.entity';
import { SeasonEntity } from '../database/entities/season.entity';
import { UserEntity } from '../database/entities/user.entity';

export interface SeatResult {
  playerId: string;
  seatNumber: number;
  isBot: boolean;
  score: number;
  /** 'win' | 'loss' | 'draw' */
  result: 'win' | 'loss' | 'draw';
}

/**
 * Persists a finished match and applies consequences: Elo for ranked games,
 * win/loss stats, XP and coin rewards. Bot players skip accounts/economy (they
 * already carry static stats) but ARE recorded in match_players for replay
 * integrity — with is_bot stored server-side only.
 */
@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(
    @InjectRepository(MatchEntity) private readonly matches: Repository<MatchEntity>,
    @InjectRepository(MatchPlayerEntity) private readonly matchPlayers: Repository<MatchPlayerEntity>,
    @InjectRepository(RankingEntity) private readonly rankings: Repository<RankingEntity>,
    @InjectRepository(SeasonEntity) private readonly seasons: Repository<SeasonEntity>,
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    private readonly economy: EconomyService,
    private readonly dataSource: DataSource,
  ) {}

  async settle(params: {
    gameId: string;
    roomId: string | null;
    isRanked: boolean;
    entryFeeCoins: number;
    seats: SeatResult[];
    replayData: Record<string, unknown>;
    durationSeconds: number;
  }): Promise<{ matchId: string }> {
    const season = await this.activeSeason();

    return this.dataSource.transaction(async (manager) => {
      const match = manager.create(MatchEntity, {
        id: uuidv4(),
        gameId: params.gameId,
        roomId: params.roomId,
        seasonId: season?.id ?? null,
        isRanked: params.isRanked,
        entryFeeCoins: params.entryFeeCoins,
        status: 'completed',
        results: {
          seats: params.seats.map((s) => ({ seat: s.seatNumber, result: s.result, score: s.score })),
        },
        replayData: params.replayData,
        durationSeconds: params.durationSeconds,
        startedAt: new Date(Date.now() - params.durationSeconds * 1000),
        finishedAt: new Date(),
      });
      await manager.save(match);

      // Human seats (server knows isBot; clients never receive it).
      const humans = params.seats.filter((s) => !s.isBot);

      // Pre-compute each human's pre-match rating + match count (only between
      // humans for ranked fairness; bots carry static stats).
      const humanContext = new Map<string, { rating: number; matchesPlayed: number }>();
      if (params.isRanked && season) {
        for (const human of humans) {
          const row = await this.ratingRow(manager, season.id, params.gameId, human.playerId);
          humanContext.set(human.playerId, { rating: row.rating, matchesPlayed: row.matchesPlayed });
        }
      }

      for (const seat of params.seats) {
        let ratingDelta = 0;
        let coinsDelta = 0;

        if (!seat.isBot) {
          if (params.isRanked && season) {
            ratingDelta = this.eloDelta(humans, humanContext, seat);
          }
          // Rewards: winners earn coins + XP; losers get participation XP.
          coinsDelta = seat.result === 'win' ? 60 : seat.result === 'draw' ? 20 : 8;
        }

        await manager.save(
          manager.create(MatchPlayerEntity, {
            id: uuidv4(),
            matchId: match.id,
            userId: seat.playerId,
            seatNumber: seat.seatNumber,
            placement: this.placement(params.seats, seat),
            score: seat.score,
            result: seat.result,
            ratingDelta,
            coinsDelta,
            isBot: seat.isBot,
          }),
        );

        if (!seat.isBot) {
          await this.applyRewards(manager, seat, ratingDelta, coinsDelta, params.isRanked, season?.id ?? null, params.gameId);
        }
      }

      return { matchId: match.id };
    });
  }

  private async applyRewards(
    manager: import('typeorm').EntityManager,
    seat: SeatResult,
    ratingDelta: number,
    coinsDelta: number,
    isRanked: boolean,
    seasonId: string | null,
    gameId: string,
  ): Promise<void> {
    const profile = await manager.findOne(ProfileEntity, { where: { userId: seat.playerId } });
    if (!profile) return;

    profile.gamesPlayed = Number(profile.gamesPlayed) + 1;
    if (seat.result === 'win') profile.gamesWon = Number(profile.gamesWon) + 1;
    else if (seat.result === 'loss') profile.gamesLost = Number(profile.gamesLost) + 1;
    else if (seat.result === 'draw') profile.gamesDrawn = Number(profile.gamesDrawn) + 1;
    await manager.save(profile);

    // Economy + XP inside the settlement transaction (atomic with stats/rating).
    if (coinsDelta > 0) {
      await this.economy.credit(
        seat.playerId,
        'coins',
        coinsDelta,
        {
          type: 'match_payout',
          referenceType: 'match',
          referenceId: `match:${gameId}:${seat.playerId}`,
          description: seat.result === 'win' ? 'Match win reward' : 'Match participation',
        },
        manager,
      );
    }
    await this.economy.grantXp(seat.playerId, seat.result === 'win' ? 80 : 25, manager);

    if (isRanked && seasonId) {
      const ranking = await this.ratingRow(manager, seasonId, gameId, seat.playerId);
      // Modified Elo with a hard rating cap and high-score protection: the
      // delta was computed against pre-match ratings; apply it through the
      // shared rules so gains are capped and losses cannot drop a player below
      // the floor of the tier their peak rating reached this season.
      const result = applyEloDelta({
        currentRating: ranking.rating,
        peakRating: ranking.peakRating,
        delta: ratingDelta,
        matchesPlayed: ranking.matchesPlayed,
      });
      ranking.rating = result.rating;
      ranking.peakRating = result.peakRating;
      ranking.matchesPlayed += 1;
      if (seat.result === 'win') ranking.wins += 1;
      else if (seat.result === 'loss') ranking.losses += 1;
      else ranking.draws += 1;
      await manager.save(ranking);
    }
  }

  /**
   * Raw signed Elo delta for one human seat, averaged over the other humans.
   * Uses a per-player K-factor (smaller for high ratings, larger during
   * placement) and the standard expected-score curve.
   */
  private eloDelta(
    humans: SeatResult[],
    context: Map<string, { rating: number; matchesPlayed: number }>,
    seat: SeatResult,
  ): number {
    const own = context.get(seat.playerId);
    if (!own) return 0;
    const opponents = humans
      .filter((h) => h.playerId !== seat.playerId)
      .map((h) => ({
        rating: context.get(h.playerId)?.rating ?? DEFAULT_RATING,
        score: h.result === 'win' ? 1 : h.result === 'draw' ? 0.5 : 0,
      }));
    if (opponents.length === 0) return 0;
    const ownScore = seat.result === 'win' ? 1 : seat.result === 'draw' ? 0.5 : 0;
    const k = kFactorFor(own.rating, own.matchesPlayed);
    // Average expected score over opponents (multiplayer weighting).
    const expected = opponents.reduce((sum, o) => sum + expectedScore(own.rating, o.rating), 0) / opponents.length;
    return Math.round(k * (ownScore - expected));
  }

  private placement(seats: SeatResult[], seat: SeatResult): number {
    const winners = seats.filter((s) => s.result === 'win').length;
    if (seat.result === 'win') return 1;
    if (seat.result === 'draw') return Math.max(2, winners + 1);
    return seats.length;
  }

  private async activeSeason(): Promise<SeasonEntity | null> {
    return this.seasons.findOne({ where: { status: 'active' }, order: { seasonNumber: 'DESC' } });
  }

  private async ratingFor(
    manager: import('typeorm').EntityManager,
    seasonId: string,
    gameId: string,
    userId: string,
  ): Promise<number> {
    const row = await this.ratingRow(manager, seasonId, gameId, userId);
    return row.rating;
  }

  private async ratingRow(
    manager: import('typeorm').EntityManager,
    seasonId: string,
    gameId: string,
    userId: string,
  ): Promise<RankingEntity> {
    let row = await manager.findOne(RankingEntity, { where: { seasonId, gameId, userId } });
    if (!row) {
      row = manager.create(RankingEntity, {
        id: uuidv4(),
        seasonId,
        gameId,
        userId,
        rating: DEFAULT_RATING,
        peakRating: DEFAULT_RATING,
        wins: 0,
        losses: 0,
        draws: 0,
        matchesPlayed: 0,
      });
    }
    return row;
  }
}
