import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameEntity } from '../database/entities/game.entity';
import { EngineRegistry } from './engine/engine.registry';

interface GameSeed {
  slug: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  avgDurationMinutes: number;
  supportsBots: boolean;
  rankedEnabled: boolean;
  status: 'active' | 'coming_soon';
}

/**
 * The playable catalogue. The rebuild ships games wave by wave — each wave
 * appends its fully playable entries here (engine + 3D board + shop items +
 * bilingual tutorial + 3D logo) so the hub never shows a game that cannot be
 * played end to end.
 */
const CATALOG: GameSeed[] = [];

/** Ensures the game catalogue matches the registered engines. */
@Injectable()
export class GameCatalogSeeder {
  private readonly logger = new Logger(GameCatalogSeeder.name);

  constructor(
    @InjectRepository(GameEntity) private readonly games: Repository<GameEntity>,
    private readonly engines: EngineRegistry,
  ) {}

  async seed(): Promise<void> {
    for (const seed of CATALOG) {
      const existing = await this.games.findOne({ where: { slug: seed.slug } });
      const playable = this.engines.has(seed.slug);
      const status = playable && seed.status === 'active' ? 'active' : seed.status;
      if (existing) {
        existing.name = seed.name;
        existing.description = seed.description;
        existing.minPlayers = seed.minPlayers;
        existing.maxPlayers = seed.maxPlayers;
        existing.avgDurationMinutes = seed.avgDurationMinutes;
        existing.supportsBots = seed.supportsBots;
        existing.rankedEnabled = seed.rankedEnabled;
        existing.status = status as GameEntity['status'];
        await this.games.save(existing);
      } else {
        await this.games.save(
          this.games.create({
            slug: seed.slug,
            name: seed.name,
            description: seed.description,
            iconUrl: null,
            minPlayers: seed.minPlayers,
            maxPlayers: seed.maxPlayers,
            avgDurationMinutes: seed.avgDurationMinutes,
            supportsBots: seed.supportsBots,
            rankedEnabled: seed.rankedEnabled,
            status: status as GameEntity['status'],
          }),
        );
      }
    }
    this.logger.log(`Game catalogue ensured (${CATALOG.length} games).`);
  }
}
