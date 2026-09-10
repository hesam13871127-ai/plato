import { Injectable } from '@nestjs/common';
import { BaseGameEngine } from './base-game.engine';
import { DominoesEngine } from './dominoes.engine';
import { LudoEngine } from './ludo.engine';
import { OchoEngine } from './ocho.engine';
import { Connect4Engine } from './connect4.engine';
import { CheckersEngine } from './checkers.engine';
import { ChessEngine } from './chess.engine';
import { PoolEngine } from './pool.engine';
import { CarromEngine } from './carrom.engine';
import { DotsAndBoxesEngine } from './dots-and-boxes.engine';
import { SnakesLaddersEngine } from './snakes-ladders.engine';
import { BingoEngine } from './bingo.engine';
import { DicePartyEngine } from './dice-party.engine';
import { BackgammonEngine } from './backgammon.engine';
import { MancalaEngine } from './mancala.engine';
import { BowlingEngine } from './bowling.engine';
import { TriviaEngine } from './trivia.engine';
import { WordChainEngine } from './word-chain.engine';
import { EmojiCharadesEngine } from './emoji-charades.engine';
import { MemoryEngine } from './memory.engine';
import { SketchEngine } from './sketch.engine';
import { WerewolfEngine } from './werewolf.engine';
import { ImpostorEngine } from './impostor.engine';
import { DartsEngine } from './darts.engine';
import { MinigolfEngine } from './minigolf.engine';
import { BankrollEngine } from './bankroll.engine';

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

  constructor(
    dominoes: DominoesEngine,
    ludo: LudoEngine,
    ocho: OchoEngine,
    connect4: Connect4Engine,
    checkers: CheckersEngine,
    chess: ChessEngine,
    pool: PoolEngine,
    carrom: CarromEngine,
    dots: DotsAndBoxesEngine,
    snakes: SnakesLaddersEngine,
    bingo: BingoEngine,
    dice: DicePartyEngine,
    backgammon: BackgammonEngine,
    mancala: MancalaEngine,
    bowling: BowlingEngine,
    trivia: TriviaEngine,
    wordChain: WordChainEngine,
    charades: EmojiCharadesEngine,
    memory: MemoryEngine,
    sketch: SketchEngine,
    werewolf: WerewolfEngine,
    impostor: ImpostorEngine,
    darts: DartsEngine,
    minigolf: MinigolfEngine,
    bankroll: BankrollEngine,
  ) {
    this.register(dominoes);
    this.register(ludo);
    this.register(ocho);
    this.register(connect4);
    this.register(checkers);
    this.register(chess);
    this.register(pool);
    this.register(carrom);
    this.register(dots);
    this.register(snakes);
    this.register(bingo);
    this.register(dice);
    this.register(backgammon);
    this.register(mancala);
    this.register(bowling);
    this.register(trivia);
    this.register(wordChain);
    this.register(charades);
    this.register(memory);
    this.register(sketch);
    this.register(werewolf);
    this.register(impostor);
    this.register(darts);
    this.register(minigolf);
    this.register(bankroll);
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
