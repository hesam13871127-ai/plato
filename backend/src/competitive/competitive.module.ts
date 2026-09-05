import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EconomyModule } from '../economy/economy.module';
import { FriendshipEntity } from '../database/entities/friendship.entity';
import { GameEntity } from '../database/entities/game.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { RankingEntity } from '../database/entities/ranking.entity';
import { SeasonEntity } from '../database/entities/season.entity';
import { SeasonRewardClaimEntity } from '../database/entities/season-reward-claim.entity';
import { UserEntity } from '../database/entities/user.entity';
import { CompetitiveBootstrap } from './competitive.bootstrap';
import { CompetitiveController } from './competitive.controller';
import { LeaderboardsService } from './leaderboards/leaderboards.service';
import { SeasonsService } from './seasons/seasons.service';

/**
 * Ranked ladder: seasons (lifecycle + rewards), rank tiers (modified Elo with
 * rating cap + high-score protection) and global/friends leaderboards.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SeasonEntity,
      SeasonRewardClaimEntity,
      RankingEntity,
      GameEntity,
      ProfileEntity,
      UserEntity,
      FriendshipEntity,
    ]),
    EconomyModule,
  ],
  controllers: [CompetitiveController],
  providers: [SeasonsService, LeaderboardsService, CompetitiveBootstrap],
  exports: [SeasonsService, LeaderboardsService],
})
export class CompetitiveModule {}
