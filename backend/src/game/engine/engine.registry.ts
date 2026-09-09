import { Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';

/**
 * Look-up table of every playable engine. New games register here; the rest of
 * the system (matchmaking, rooms, gateway) stays generic.
 *
 * The catalogue is being rebuilt wave by wave (logic + 3D board + shop items
 * per game), so the registry starts empty and fills up as each wave lands:
 * engines are injected here and registered in the constructor.
 */
@Injectable()
export class EngineRegistry {
  private readonly engines = new Map<string, BaseGameEngine>();

  register(engine: BaseGameEngine): void {
    this.engines.set(engine.slug, engine);
  }

  get(slug: string): BaseGameEngine | undefined {
    return this.engines.get(slug);
  }

  require(slug: string): BaseGameEngine {
    const engine = this.engines.get(slug);
    if (!engine) {
      throw new Error(`No engine registered for game "${slug}".`);
    }
    return engine;
  }

  has(slug: string): boolean {
    return this.engines.has(slug);
  }

  get slugs(): string[] {
    return [...this.engines.keys()];
  }
}
