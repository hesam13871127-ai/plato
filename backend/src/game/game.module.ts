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
import { Connect4Engine } from './engine/connect4.engine';
import { OchoEngine } from './engine/ocho.engine';
import { LudoEngine } from './engine/ludo.engine';
import { ChessEngine } from './engine/chess.engine';
import { BingoEngine } from './engine/bingo.engine';
import { DicePartyEngine } from './engine/dice-party.engine';
import { WerewolfEngine } from './engine/werewolf.engine';
import { SketchEngine } from './engine/sketch.engine';
import { PoolEngine } from './engine/pool.engine';
import { CarromEngine } from './engine/carrom.engine';
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
    // Engines
    DominoesEngine,
    Connect4Engine,
    OchoEngine,
    LudoEngine,
    ChessEngine,
    BingoEngine,
    DicePartyEngine,
    WerewolfEngine,
    SketchEngine,
    PoolEngine,
    CarromEngine,
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
