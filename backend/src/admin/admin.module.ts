import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompetitiveModule } from '../competitive/competitive.module';
import { EconomyModule } from '../economy/economy.module';
import { BanEntity } from '../database/entities/ban.entity';
import { GameEntity } from '../database/entities/game.entity';
import { MatchEntity } from '../database/entities/match.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { ReportEntity } from '../database/entities/report.entity';
import { SeasonEntity } from '../database/entities/season.entity';
import { ShopItemEntity } from '../database/entities/shop-item.entity';
import { UserEntity } from '../database/entities/user.entity';
import { GameModule } from '../game/game.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * Full administration panel API (Phase 10). Depends on EconomyModule (currency
 * adjustments), CompetitiveModule (season lifecycle), GameModule (engine
 * registry for safe game activation) and the global ModerationModule (bans,
 * roles, audit). All routes are admin-only via the controller's RolesGuard.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      ProfileEntity,
      ShopItemEntity,
      GameEntity,
      MatchEntity,
      SeasonEntity,
      ReportEntity,
      BanEntity,
    ]),
    EconomyModule,
    CompetitiveModule,
    GameModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
