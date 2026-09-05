import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GameEntity } from '../database/entities/game.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { GameSessionService } from './game-session.service';
import { MatchmakingService } from './matchmaking.service';
import { RoomService } from './room.service';
import { EngineRegistry } from './engine/engine.registry';
import { CreateRoomDto, EnqueueDto, JoinRoomDto, ReadyDto } from './dto/game.dto';
import { toGameCatalogItem } from './game.serializer';

@ApiTags('games')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('games')
export class GameController {
  constructor(
    @InjectRepository(GameEntity) private readonly gameRepo: Repository<GameEntity>,
    @InjectRepository(ProfileEntity) private readonly profileRepo: Repository<ProfileEntity>,
    private readonly rooms: RoomService,
    private readonly matchmaking: MatchmakingService,
    private readonly sessions: GameSessionService,
    private readonly engines: EngineRegistry,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List the game catalogue.' })
  async catalog(): Promise<{ games: ReturnType<typeof toGameCatalogItem>[] }> {
    const games = await this.gameRepo.find({ order: { name: 'ASC' } });
    return {
      games: games.map((g) => {
        const engine = this.engines.get(g.slug);
        return toGameCatalogItem(g, engine?.isLive ?? false);
      }),
    };
  }

  @Get('rooms')
  @ApiOperation({ summary: 'Browse open public tables.' })
  async openRooms(@Query('game') game?: string) {
    return { rooms: await this.rooms.listPublic(game) };
  }

  @Post('matchmaking/enqueue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enter the smart matchmaking queue (WebSocket drives the match).' })
  async enqueue(@CurrentUser('id') userId: string, @Body() dto: EnqueueDto) {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    const result = await this.matchmaking.enqueue(
      { id: userId, displayName: profile?.displayName ?? 'Player', avatarUrl: profile?.avatarUrl ?? null },
      { gameSlug: dto.gameSlug, isRanked: dto.isRanked ?? false, seats: dto.seats },
    );
    return result;
  }

  @Post('matchmaking/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave the matchmaking queue.' })
  cancel(@CurrentUser('id') userId: string) {
    this.matchmaking.cancel(userId, false);
    return { ok: true };
  }

  @Post('rooms')
  @ApiOperation({ summary: 'Create a private or public table.' })
  async createRoom(@CurrentUser('id') userId: string, @Body() dto: CreateRoomDto) {
    const { view } = await this.rooms.create({ id: userId }, { ...dto });
    return { room: view };
  }

  @Post('rooms/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a table by id or invite code.' })
  async joinRoom(@CurrentUser('id') userId: string, @Body() dto: JoinRoomDto) {
    const { room } = await this.rooms.join({ id: userId }, { roomId: dto.roomId, accessCode: dto.accessCode });
    return { room: await this.rooms.view({ id: userId }, room.id) };
  }

  @Get('rooms/:id')
  @ApiOperation({ summary: 'Get a table lobby state.' })
  async room(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return { room: await this.rooms.view({ id: userId }, id) };
  }

  @Post('rooms/:id/ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle ready state in a lobby.' })
  async ready(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ReadyDto) {
    await this.rooms.setReady({ id: userId }, id, dto.isReady);
    return { room: await this.rooms.view({ id: userId }, id) };
  }

  @Post('rooms/:id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Host starts the game.' })
  async start(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const { sessionId, channel } = await this.rooms.start({ id: userId }, id);
    return { sessionId, channel };
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Fetch the current redacted game state (reconnection/refresh).' })
  async session(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const session = this.sessions.get(id);
    if (!session) return { active: false };
    if (session.playerSeat.has(userId)) {
      return { active: true, ...this.sessions.viewForPlayer(session, userId) };
    }
    return { active: true, ...this.sessions.viewForSpectator(session) };
  }
}
