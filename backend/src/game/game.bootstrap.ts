import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { BotService } from './bot/bot.service';
import { GameCatalogSeeder } from './game-catalog.seeder';

/**
 * Runs once the Nest app is ready: ensures the game catalogue rows exist and a
 * healthy pool of invisible bots is provisioned before players start matching.
 */
@Injectable()
export class GameBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(GameBootstrap.name);

  constructor(
    private readonly catalog: GameCatalogSeeder,
    private readonly bots: BotService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.catalog.seed();
      const count = await this.bots.seedPool();
      this.logger.log(`Game subsystem ready (${count} bots in pool).`);
    } catch (error) {
      // Never crash the app on seeding issues — matchmaking self-seeds on demand.
      this.logger.error('Game bootstrap seeding failed.', error as Error);
    }
  }
}
