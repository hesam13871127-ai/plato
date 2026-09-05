import { Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import { DominoesEngine } from './dominoes.engine';
import { Connect4Engine } from './connect4.engine';
import { OchoEngine } from './ocho.engine';
import { LudoEngine } from './ludo.engine';
import { ChessEngine } from './chess.engine';
import { BingoEngine } from './bingo.engine';
import { DicePartyEngine } from './dice-party.engine';
import { WerewolfEngine } from './werewolf.engine';
import { SketchEngine } from './sketch.engine';
import { PoolEngine } from './pool.engine';
import { CarromEngine } from './carrom.engine';
import { TriviaEngine } from './trivia.engine';
import { EmojiCharadesEngine } from './emoji-charades.engine';
import { WordChainEngine } from './word-chain.engine';
import { MemoryRaceEngine } from './memory-race.engine';
import { ImpostorLightEngine } from './impostor-light.engine';
import { QuickChallengesEngine } from './quick-challenges.engine';

/**
 * Look-up table of every playable engine. New games register here; the rest of
 * the system (matchmaking, rooms, gateway) stays generic.
 */
@Injectable()
export class EngineRegistry {
  private readonly engines = new Map<string, BaseGameEngine>();

  constructor(
    dominoes: DominoesEngine,
    connect4: Connect4Engine,
    ocho: OchoEngine,
    ludo: LudoEngine,
    chess: ChessEngine,
    bingo: BingoEngine,
    diceParty: DicePartyEngine,
    werewolf: WerewolfEngine,
    sketch: SketchEngine,
    pool: PoolEngine,
    carrom: CarromEngine,
    trivia: TriviaEngine,
    emojiCharades: EmojiCharadesEngine,
    wordChain: WordChainEngine,
    memoryRace: MemoryRaceEngine,
    impostorLight: ImpostorLightEngine,
    quickChallenges: QuickChallengesEngine,
  ) {
    this.register(dominoes);
    this.register(connect4);
    this.register(ocho);
    this.register(ludo);
    this.register(chess);
    this.register(bingo);
    this.register(diceParty);
    this.register(werewolf);
    this.register(sketch);
    this.register(pool);
    this.register(carrom);
    this.register(trivia);
    this.register(emojiCharades);
    this.register(wordChain);
    this.register(memoryRace);
    this.register(impostorLight);
    this.register(quickChallenges);
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
