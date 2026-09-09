import { Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import { DominoesEngine } from './dominoes.engine';
import { LudoEngine } from './ludo.engine';

/**
 * Look-up table of every playable engine. New games register here; the rest of
 * the system (matchmaking, rooms, gateway) stays generic.
 *
 * The catalogue is being rebuilt wave by wave (logic + 3D board + shop items
 * per game); every wave injects its engines here.
 */
@Injectable()
export class EngineRegistry {
  private readonly engines = new Map<string, BaseGameEngine>();

  constructor(dominoes: DominoesEngine, ludo: LudoEngine) {
    this.register(dominoes);
    this.register(ludo);
  }

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
