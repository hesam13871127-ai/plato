import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EconomyModule } from '../economy/economy.module';
import { DailyRewardClaimEntity } from '../database/entities/daily-reward.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { QuestEntity } from '../database/entities/quest.entity';
import { UserQuestEntity } from '../database/entities/user-quest.entity';
import { CatalogueSeeder } from './catalogue-seeder';
import { QuestsController } from './quests.controller';
import { QuestsService } from './quests.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuestEntity,
      UserQuestEntity,
      DailyRewardClaimEntity,
      ProfileEntity,
    ]),
    EconomyModule,
  ],
  controllers: [QuestsController],
  providers: [QuestsService, CatalogueSeeder],
  exports: [QuestsService],
})
export class QuestsModule {}
