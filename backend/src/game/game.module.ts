import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EconomyModule } from '../economy/economy.module';
import { BotEntity } from '../database/entities/bot.entity';
import { GameEntity } from '../database/entities/game.entity';
import { MatchEntity } from '../database/entities/match.entity';
import { MatchPlayerEntity } from '../database/entities/match-player.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { RankingEntity } from '../database/entities/ranking.entity';
import { RoomEntity } from '../database/entities/room.entity';
import { RoomPlayerEntity } from '../database/entities/room-player.entity';
import { SeasonEntity } from '../database/entities/season.entity';
import { UserEntity } from '../database/entities/user.entity';
import { BotService } from './bot/bot.service';
import { GameCatalogSeeder } from './game-catalog.seeder';
import { GameBootstrap } from './game.bootstrap';
import { GameController } from './game.controller';
import { GameGateway } from './game.gateway';
import { GameSessionService } from './game-session.service';
import { MatchmakingService } from './matchmaking.service';
import { ResultsService } from './results.service';
import { RoomService } from './room.service';
import { DominoesEngine } from './engine/dominoes.engine';
import { LudoEngine } from './engine/ludo.engine';
import { OchoEngine } from './engine/ocho.engine';
import { Connect4Engine } from './engine/connect4.engine';
import { CheckersEngine } from './engine/checkers.engine';
import { ChessEngine } from './engine/chess.engine';
import { PoolEngine } from './engine/pool.engine';
import { CarromEngine } from './engine/carrom.engine';
import { DotsAndBoxesEngine } from './engine/dots-and-boxes.engine';
import { SnakesLaddersEngine } from './engine/snakes-ladders.engine';
import { BingoEngine } from './engine/bingo.engine';
import { DicePartyEngine } from './engine/dice-party.engine';
import { BackgammonEngine } from './engine/backgammon.engine';
import { MancalaEngine } from './engine/mancala.engine';
import { BowlingEngine } from './engine/bowling.engine';
import { TriviaEngine } from './engine/trivia.engine';
import { WordChainEngine } from './engine/word-chain.engine';
import { EmojiCharadesEngine } from './engine/emoji-charades.engine';
import { MemoryEngine } from './engine/memory.engine';
import { SketchEngine } from './engine/sketch.engine';
import { WerewolfEngine } from './engine/werewolf.engine';
import { ImpostorEngine } from './engine/impostor.engine';
import { DartsEngine } from './engine/darts.engine';
import { MinigolfEngine } from './engine/minigolf.engine';
import { EngineRegistry } from './engine/engine.registry';

const ENTITIES = [
  GameEntity,
  RoomEntity,
  RoomPlayerEntity,
  MatchEntity,
  MatchPlayerEntity,
  RankingEntity,
  SeasonEntity,
  BotEntity,
  UserEntity,
  ProfileEntity,
];

/**
 * Core game module: pluggable engines, smart matchmaking (with invisible bot
 * fallback), private rooms/lobbies, live session orchestration, reconnection,
 * spectators and result settlement (Elo + economy).
 */
@Module({
  imports: [JwtModule.register({}), TypeOrmModule.forFeature(ENTITIES), EconomyModule],
  controllers: [GameController],
  providers: [
    // Engines — registered per wave as games are rebuilt (see EngineRegistry).
    DominoesEngine,
    LudoEngine,
    OchoEngine,
    Connect4Engine,
    CheckersEngine,
    ChessEngine,
    PoolEngine,
    CarromEngine,
    DotsAndBoxesEngine,
    SnakesLaddersEngine,
    BingoEngine,
    DicePartyEngine,
    BackgammonEngine,
    MancalaEngine,
    BowlingEngine,
    TriviaEngine,
    WordChainEngine,
    EmojiCharadesEngine,
    MemoryEngine,
    SketchEngine,
    WerewolfEngine,
    ImpostorEngine,
    DartsEngine,
    MinigolfEngine,
    EngineRegistry,
    // Services
    BotService,
    GameSessionService,
    MatchmakingService,
    RoomService,
    ResultsService,
    GameCatalogSeeder,
    GameBootstrap,
    // Transport
    GameGateway,
  ],
  exports: [BotService, GameSessionService, MatchmakingService, RoomService, EngineRegistry],
})
export class GameModule {}
