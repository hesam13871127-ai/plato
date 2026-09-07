import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { GameEntity } from '../database/entities/game.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { RankingEntity } from '../database/entities/ranking.entity';
import { RoomEntity } from '../database/entities/room.entity';
import { RoomPlayerEntity } from '../database/entities/room-player.entity';
import { SeasonEntity } from '../database/entities/season.entity';
import { UserEntity } from '../database/entities/user.entity';
import { BotService } from './bot/bot.service';
import { CosmeticsService } from './cosmetics.service';
import { GameSessionService } from './game-session.service';
import type { SeatInfo } from './engine/types';

const DEFAULT_RATING = 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface RoomPlayerView {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  level: number;
  seatNumber: number;
  isReady: boolean;
  isHost: boolean;
  status: string;
}

export interface RoomView {
  id: string;
  gameSlug: string;
  gameName: string;
  name: string | null;
  isPrivate: boolean;
  /** Present only for members (never exposed in public listings). */
  accessCode: string | null;
  isRanked: boolean;
  maxPlayers: number;
  status: string;
  hostId: string;
  settings: Record<string, unknown> | null;
  players: RoomPlayerView[];
  /** True once the table is live (a session exists). */
  isLive: boolean;
  sessionId: string | null;
  inviteUrl: string | null;
}

/**
 * Private/custom tables and their lobby lifecycle. Rooms persist in the DB;
 * seat/ready updates are broadcast live. When the host starts the game the
 * GameSessionService opens a table; empty seats are filled by invisible bots
 * (identical to matchmaking fallback) so a host never waits alone.
 */
@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);

  constructor(
    @InjectRepository(GameEntity) private readonly games: Repository<GameEntity>,
    @InjectRepository(RoomEntity) private readonly rooms: Repository<RoomEntity>,
    @InjectRepository(RoomPlayerEntity) private readonly roomPlayers: Repository<RoomPlayerEntity>,
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(RankingEntity) private readonly rankings: Repository<RankingEntity>,
    @InjectRepository(SeasonEntity) private readonly seasons: Repository<SeasonEntity>,
    private readonly bots: BotService,
    private readonly sessions: GameSessionService,
    private readonly cosmetics: CosmeticsService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    user: { id: string },
    params: {
      gameSlug: string;
      name?: string;
      isPrivate?: boolean;
      isRanked?: boolean;
      maxPlayers?: number;
      fillWithBots?: boolean;
      settings?: Record<string, unknown>;
    },
  ): Promise<{ room: RoomEntity; view: RoomView }> {
    const game = await this.games.findOne({ where: { slug: params.gameSlug } });
    if (!game || game.status !== 'active') throw new BadRequestException('That game is not available.');
    const maxPlayers = Math.max(game.minPlayers, Math.min(game.maxPlayers, params.maxPlayers ?? game.maxPlayers));

    return this.dataSource.transaction(async (manager) => {
      const room = manager.create(RoomEntity, {
        id: uuidv4(),
        gameId: game.id,
        hostId: user.id,
        name: params.name?.slice(0, 128) ?? null,
        accessCode: params.isPrivate ? this.generateCode() : null,
        isPrivate: params.isPrivate ?? false,
        isRanked: params.isRanked ?? false,
        entryFeeCoins: 0,
        maxPlayers,
        status: 'waiting',
        settings: { ...(params.settings ?? {}), fillWithBots: params.fillWithBots ?? true },
      });
      await manager.save(room);

      await manager.save(
        manager.create(RoomPlayerEntity, {
          id: uuidv4(),
          roomId: room.id,
          userId: user.id,
          seatNumber: 0,
          isBot: false,
          isReady: true,
          status: 'joined',
        }),
      );

      // Host may pre-fill seats with bots so they can start instantly.
      if (params.fillWithBots ?? true) {
        const [rating, language, region] = await this.playerContext(user.id, game.id);
        const used = new Set<string>();
        for (let seat = 1; seat < maxPlayers; seat++) {
          const bot = await this.bots.pickClosest({
            rating,
            language,
            region,
            excludeUserIds: [user.id, ...used],
          });
          used.add(bot.userId);
          await manager.save(
            manager.create(RoomPlayerEntity, {
              id: uuidv4(),
              roomId: room.id,
              userId: bot.userId,
              seatNumber: seat,
              isBot: true,
              isReady: true,
              status: 'joined',
            }),
          );
        }
      }

      const players = await this.memberViews(manager, room.id);
      const fullRoom = await manager.findOne(RoomEntity, {
        where: { id: room.id },
        relations: { game: true },
      });
      return { room, view: this.toView(fullRoom ?? room, players, true) };
    });
  }

  async join(
    user: { id: string },
    params: { roomId?: string; accessCode?: string },
  ): Promise<{ room: RoomEntity; players: RoomPlayerView[] }> {
    const room = await this.resolveRoom(params.roomId ?? null, params.accessCode ?? null);
    if (room.status !== 'waiting') throw new BadRequestException('This table has already started.');

    const existing = await this.roomPlayers.findOne({ where: { roomId: room.id, userId: user.id } });
    if (existing) return { room, players: await this.memberViews(this.dataSource.manager, room.id) };

    const count = await this.roomPlayers.count({ where: { roomId: room.id } });
    if (count >= room.maxPlayers) throw new BadRequestException('This table is full.');

    await this.roomPlayers.save(
      this.roomPlayers.create({
        id: uuidv4(),
        roomId: room.id,
        userId: user.id,
        seatNumber: count,
        isBot: false,
        isReady: false,
        status: 'joined',
      }),
    );
    return { room, players: await this.memberViews(this.dataSource.manager, room.id) };
  }

  async leave(user: { id: string }, roomId: string): Promise<void> {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found.');
    const membership = await this.roomPlayers.findOne({ where: { roomId, userId: user.id } });
    if (!membership) return;
    await this.roomPlayers.remove(membership);

    const remaining = await this.roomPlayers.find({ where: { roomId }, order: { seatNumber: 'ASC' } });
    const humans = remaining.filter((p) => !p.isBot);
    if (humans.length === 0) {
      room.status = 'cancelled';
      room.endedAt = new Date();
      await this.rooms.save(room);
      return;
    }
    // Re-seat to keep seat numbers dense and transfer host if needed.
    if (room.hostId === user.id) room.hostId = humans[0].userId;
    await this.rooms.save(room);
    remaining.forEach((p, i) => {
      p.seatNumber = i;
    });
    await this.roomPlayers.save(remaining);
  }

  async setReady(user: { id: string }, roomId: string, isReady: boolean): Promise<RoomPlayerView[]> {
    const membership = await this.roomPlayers.findOne({ where: { roomId, userId: user.id } });
    if (!membership) throw new ForbiddenException('You are not in this room.');
    membership.isReady = isReady;
    await this.roomPlayers.save(membership);
    return this.memberViews(this.dataSource.manager, roomId);
  }

  /**
   * Host starts the game. Seats are the room's human members; bots fill to the
   * engine's minimum if fewer humans are present (unless pre-filled).
   */
  async start(user: { id: string }, roomId: string): Promise<{ sessionId: string; channel: string }> {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found.');
    if (room.hostId !== user.id) throw new ForbiddenException('Only the host can start the game.');
    if (room.status !== 'waiting') throw new BadRequestException('Game already in progress.');

    const members = await this.roomPlayers.find({ where: { roomId: room.id }, order: { seatNumber: 'ASC' } });
    const game = await this.games.findOne({ where: { id: room.gameId } });
    if (!game) throw new NotFoundException('Game not found.');

    // Gather seat profile data.
    const humanMembers = members.filter((m) => !m.isBot);
    const profiles = await this.profiles.find({ where: { userId: In(humanMembers.map((m) => m.userId)) } });
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

    const botDifficultyByUser = new Map<string, SeatInfo['botDifficulty']>();
    for (const botMember of members.filter((m) => m.isBot)) {
      botDifficultyByUser.set(botMember.userId, await this.bots.difficultyFor(botMember.userId));
    }

    const seats: SeatInfo[] = members.map((m, index) => {
      const profile = profileByUser.get(m.userId);
      return {
        playerId: m.userId,
        seatNumber: index,
        isBot: m.isBot,
        botDifficulty: m.isBot ? botDifficultyByUser.get(m.userId) : undefined,
        displayName: profile?.displayName ?? 'Player',
        avatarUrl: profile?.avatarUrl ?? null,
      };
    });

    // Top up with invisible bots to the engine minimum if needed.
    if (seats.length < game.minPlayers) {
      const [rating, language, region] = await this.playerContext(user.id, game.id);
      const used = new Set(seats.map((s) => s.playerId));
      while (seats.length < game.minPlayers) {
        const bot = await this.bots.pickClosest({ rating, language, region, excludeUserIds: [...used] });
        used.add(bot.userId);
        seats.push({
          playerId: bot.userId,
          seatNumber: seats.length,
          isBot: true,
          botDifficulty: bot.difficulty,
          displayName: bot.displayName,
          avatarUrl: bot.avatarUrl,
        });
      }
    }

    // Trim to engine max if a room was configured larger than the engine allows.
    const finalSeats = seats.slice(0, game.maxPlayers);
    finalSeats.forEach((seat, index) => {
      seat.seatNumber = index;
    });
    // Attach each player's equipped pieces / board / dice (public cosmetics).
    await this.cosmetics.decorateSeats(finalSeats, game.slug);

    room.status = 'playing';
    room.startedAt = new Date();
    await this.rooms.save(room);

    const session = this.sessions.start({
      sessionId: uuidv4(),
      gameSlug: game.slug,
      gameId: game.id,
      roomId: room.id,
      isRanked: room.isRanked,
      entryFeeCoins: Number(room.entryFeeCoins),
      seats: finalSeats,
      settings: { source: 'room', roomName: room.name },
    });
    return { sessionId: session.sessionId, channel: session.channel };
  }

  async view(user: { id: string }, roomId: string): Promise<RoomView> {
    const room = await this.rooms.findOne({ where: { id: roomId }, relations: { game: true } });
    if (!room) throw new NotFoundException('Room not found.');
    const membership = await this.roomPlayers.findOne({ where: { roomId, userId: user.id } });
    if (room.isPrivate && !membership) {
      throw new ForbiddenException('This is a private table.');
    }
    const players = await this.memberViews(this.dataSource.manager, roomId);
    return this.toView(room, players, !!membership);
  }

  /** Public lobby listing (open tables only; private codes never listed). */
  async listPublic(gameSlug?: string): Promise<RoomView[]> {
    const rooms = await this.rooms.find({
      where: { status: 'waiting', isPrivate: false, ...(gameSlug ? { game: { slug: gameSlug } } : {}) },
      relations: { game: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const views: RoomView[] = [];
    for (const room of rooms) {
      const players = await this.memberViews(this.dataSource.manager, room.id);
      views.push(this.toView(room, players, false));
    }
    return views;
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async resolveRoom(roomId: string | null, accessCode: string | null): Promise<RoomEntity> {
    if (accessCode) {
      const room = await this.rooms.findOne({ where: { accessCode: accessCode.toUpperCase() } });
      if (!room) throw new NotFoundException('No table matches that invite code.');
      return room;
    }
    if (roomId) {
      const room = await this.rooms.findOne({ where: { id: roomId } });
      if (!room) throw new NotFoundException('Room not found.');
      if (room.isPrivate) throw new ForbiddenException('This table is private; use an invite link.');
      return room;
    }
    throw new BadRequestException('Provide a room id or invite code.');
  }

  private async memberViews(
    manager: import('typeorm').EntityManager,
    roomId: string,
  ): Promise<RoomPlayerView[]> {
    const members = await manager.find(RoomPlayerEntity, { where: { roomId }, order: { seatNumber: 'ASC' } });
    const userIds = members.map((m) => m.userId);
    const profiles = await manager.find(ProfileEntity, { where: { userId: In(userIds) } });
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
    const room = await manager.findOne(RoomEntity, { where: { id: roomId } });

    return members.map((m) => {
      const p = profileByUser.get(m.userId);
      return {
        userId: m.userId,
        displayName: p?.displayName ?? 'Player',
        username: p?.username ?? '',
        avatarUrl: p?.avatarUrl ?? null,
        level: Number(p?.level ?? 1),
        seatNumber: m.seatNumber,
        isReady: m.isReady,
        isHost: room?.hostId === m.userId,
        status: m.status,
        // NOTE: isBot is intentionally absent — bots are invisible to clients.
      };
    });
  }

  private toView(room: RoomEntity, players: RoomPlayerView[], isMember: boolean): RoomView {
    const session = room.status === 'playing' ? this.sessions.getByRoom(room.id) : null;
    return {
      id: room.id,
      gameSlug: room.game?.slug ?? '',
      gameName: room.game?.name ?? '',
      name: room.name,
      isPrivate: room.isPrivate,
      accessCode: isMember && room.isPrivate ? room.accessCode : null,
      isRanked: room.isRanked,
      maxPlayers: room.maxPlayers,
      status: room.status,
      hostId: room.hostId,
      settings: room.settings,
      players,
      isLive: room.status === 'playing',
      sessionId: session?.sessionId ?? null,
      inviteUrl: room.isPrivate ? `/join/${room.accessCode}` : null,
    };
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return code;
  }

  private async playerContext(userId: string, gameId: string): Promise<[number, string | null, string | null]> {
    const profile = await this.profiles.findOne({ where: { userId } });
    const settings = (profile?.settings ?? {}) as { language?: string; region?: string };
    const season = await this.seasons.findOne({ where: { status: 'active' }, order: { seasonNumber: 'DESC' } });
    let rating = DEFAULT_RATING;
    if (season) {
      const ranking = await this.rankings.findOne({ where: { seasonId: season.id, gameId, userId } });
      if (ranking) rating = ranking.rating;
    }
    return [rating, settings.language ?? null, settings.region ?? null];
  }
}
