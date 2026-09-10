import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuestEntity } from '../database/entities/quest.entity';
import { QUEST_CATALOGUE } from './catalogue';

/**
 * Ensures the daily-quest catalogue exists in the database on startup.
 * Idempotent: existing quests (matched by fixed id/code) are left intact so
 * production data is never overwritten.
 */
@Injectable()
export class CatalogueSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogueSeeder.name);

  constructor(
    @InjectRepository(QuestEntity)
    private readonly quests: Repository<QuestEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const item of QUEST_CATALOGUE) {
      const existing = await this.quests.findOne({ where: { code: item.code } });
      if (existing) continue;

      await this.quests.save(
        this.quests.create({
          id: item.id,
          code: item.code,
          name: item.name,
          description: item.description,
          goalType: item.goalType,
          goalTarget: item.goalTarget,
          rewardCoins: item.rewardCoins,
          rewardPips: item.rewardPips,
          rewardXp: item.rewardXp,
          rewardCurrency: item.rewardPips > 0 ? 'pips' : 'coins',
          sortOrder: item.sortOrder,
          isActive: true,
        }),
      );
    }
    this.logger.log('Daily quest catalogue ensured.');
  }
}
