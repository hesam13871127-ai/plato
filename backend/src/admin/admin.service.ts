import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { EngineRegistry } from '../game/engine/engine.registry';
import { EconomyService } from '../economy/economy.service';
import { ModerationService } from '../moderation/moderation.service';
import { SeasonsService } from '../competitive/seasons/seasons.service';
import { BanEntity } from '../database/entities/ban.entity';
import { GameEntity } from '../database/entities/game.entity';
import { MatchEntity } from '../database/entities/match.entity';
import { ProfileEntity } from '../database/entities/profile.entity';
import { ReportEntity } from '../database/entities/report.entity';
import { SeasonEntity } from '../database/entities/season.entity';
import { ShopItemEntity } from '../database/entities/shop-item.entity';
import { UserEntity } from '../database/entities/user.entity';
import { AdminGrantCurrencyDto, AdminUpdateUserDto, AdminUpsertGameDto, AdminUpsertShopItemDto } from './dto/admin.dto';

export interface AdminUserRow {
  id: string;
  phone: string | null;
  email: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  role: string;
  isBot: boolean;
  isVerified: boolean;
  coins: number;
  pips: number;
  level: number;
  gamesPlayed: number;
  presence: string;
  createdAt: string;
}

/**
 * Platform administration operations: user management, currency adjustments,
 * shop catalogue editing, game catalogue control, season administration and
 * global analytics. Every operation is also reachable through the role guard
 * (admin) in the controller and is recorded via the moderation audit trail.
 */
@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(ShopItemEntity) private readonly shopItems: Repository<ShopItemEntity>,
    @InjectRepository(GameEntity) private readonly games: Repository<GameEntity>,
    @InjectRepository(MatchEntity) private readonly matches: Repository<MatchEntity>,
    @InjectRepository(SeasonEntity) private readonly seasons: Repository<SeasonEntity>,
    @InjectRepository(ReportEntity) private readonly reports: Repository<ReportEntity>,
    @InjectRepository(BanEntity) private readonly bans: Repository<BanEntity>,
    private readonly economy: EconomyService,
    private readonly moderation: ModerationService,
    private readonly seasonsService: SeasonsService,
    private readonly engines: EngineRegistry,
  ) {}

  // ── Analytics / overview ────────────────────────────────────────────────

  async overview(): Promise<Record<string, unknown>> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, activeUsers, gamesCount, matchesTotal, matchesToday, openReports] = await Promise.all([
      this.users.count({ where: { isBot: false } }),
      this.users.count({ where: { isBot: false, lastSeenAt: MoreThan(sevenDaysAgo) } }),
      this.games.count({ where: { status: 'active' } }),
      this.matches.count(),
      this.matches.count({ where: { createdAt: MoreThan(today) } }),
      this.reports.count({ where: { status: 'open' as never } }),
    ]);

    const coinsRows = await this.profiles
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.coins), 0)', 'coins')
      .addSelect('COALESCE(SUM(p.pips), 0)', 'pips')
      .getRawOne<{ coins: string; pips: string }>();

    // Matches per day for the last 14 days (driver-agnostic date extraction).
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const dateExpr = this.matches.manager.connection.driver.options.type === 'mysql'
      ? 'DATE(m.createdAt)'
      : "date(m.createdAt)";
    const recent = await this.matches
      .createQueryBuilder('m')
      .select(`${dateExpr}`, 'day')
      .addSelect('COUNT(*)', 'matches')
      .where('m.createdAt > :since', { since })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; matches: string }>();

    // Most-played games (join to games for slug/name).
    const byGame = await this.matches
      .createQueryBuilder('m')
      .leftJoin('m.game', 'g')
      .select('g.slug', 'slug')
      .addSelect('g.name', 'name')
      .addSelect('COUNT(*)', 'plays')
      .where('g.slug IS NOT NULL')
      .groupBy('g.slug')
      .addGroupBy('g.name')
      .orderBy('plays', 'DESC')
      .limit(10)
      .getRawMany<{ slug: string; name: string; plays: string }>();

    return {
      users: { total: totalUsers, active7d: activeUsers },
      games: { active: gamesCount },
      matches: { total: matchesTotal, today: matchesToday },
      economy: {
        coinsInCirculation: Number(coinsRows?.coins ?? 0),
        pipsInCirculation: Number(coinsRows?.pips ?? 0),
      },
      moderation: { openReports },
      matchesByDay: recent.map((r) => ({ day: r.day, matches: Number(r.matches) })),
      topGames: byGame.map((r) => ({ slug: r.slug, name: r.name, plays: Number(r.plays) })),
    };
  }

  // ── Users ───────────────────────────────────────────────────────────────

  async listUsers(query: { search?: string; status?: string; limit?: number; offset?: number }): Promise<{ items: AdminUserRow[]; total: number }> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);

    const qb = this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .where('user.isBot = :bot', { bot: false });

    if (query.status) {
      qb.andWhere('user.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere('(user.email LIKE :q OR user.phone LIKE :q OR profile.username LIKE :q OR profile.displayName LIKE :q)', {
        q: `%${query.search}%`,
      });
    }
    qb.orderBy('user.createdAt', 'DESC').skip(offset).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((u) => this.toUserRow(u)), total };
  }

  async updateUser(adminId: string, userId: string, dto: AdminUpdateUserDto): Promise<AdminUserRow> {
    const user = await this.users.findOne({ where: { id: userId }, relations: { profile: true } });
    if (!user) throw new NotFoundException('User not found.');

    if (dto.displayName != null && user.profile) {
      user.profile.displayName = dto.displayName;
    }
    if (dto.status != null) user.status = dto.status as UserEntity['status'];
    if (dto.role != null) {
      await this.moderation.setRole(userId, dto.role as never, adminId);
      user.role = dto.role as UserEntity['role'];
    }
    await this.users.save(user);
    if (user.profile) await this.profiles.save(user.profile);
    await this.audit(adminId, 'user_updated', 'user', userId, `status=${dto.status ?? ''} role=${dto.role ?? ''} name=${dto.displayName ?? ''}`);
    return this.toUserRow(user);
  }

  /** Ban via the moderation service (also writes the audit trail). */
  async banUser(adminId: string, dto: { userId: string; type: string; durationMinutes?: number; reason?: string }): Promise<{ banned: true }> {
    await this.moderation.banUser({
      userId: dto.userId,
      bannedBy: adminId,
      type: dto.type as never,
      durationMinutes: dto.durationMinutes,
      reason: dto.reason ?? 'Admin action',
    });
    return { banned: true };
  }

  async liftBan(adminId: string, userId: string): Promise<{ lifted: number }> {
    const lifted = await this.moderation.liftBan(userId, adminId);
    return { lifted };
  }

  async grantCurrency(adminId: string, dto: AdminGrantCurrencyDto): Promise<{ balance: { coins: number; pips: number } }> {
    const user = await this.users.findOne({ where: { id: dto.userId }, select: ['id'] });
    if (!user) throw new NotFoundException('User not found.');

    const currency = dto.currency as 'coins' | 'pips';
    const amount = Math.trunc(dto.amount);
    const ctx = {
      type: 'admin_adjustment' as const,
      referenceType: 'admin',
      referenceId: adminId,
      description: `Admin adjustment: ${dto.reason ?? 'manual grant'}`,
    };
    if (amount >= 0) {
      await this.economy.credit(dto.userId, currency, amount, ctx);
    } else {
      await this.economy.debit(dto.userId, currency, -amount, ctx);
    }
    const balance = await this.economy.getBalance(dto.userId);
    await this.audit(adminId, 'currency_adjusted', 'user', dto.userId, `${dto.currency} ${amount}: ${dto.reason ?? 'manual'}`);
    return { balance: { coins: balance.coins, pips: balance.pips } };
  }

  // ── Shop management ─────────────────────────────────────────────────────

  async listAllShopItems(): Promise<ShopItemEntity[]> {
    return this.shopItems.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async upsertShopItem(adminId: string, dto: AdminUpsertShopItemDto): Promise<ShopItemEntity> {
    let item: ShopItemEntity;
    if (dto.id) {
      const existing = await this.shopItems.findOne({ where: { id: dto.id } });
      if (!existing) throw new NotFoundException('Shop item not found.');
      item = existing;
    } else {
      item = this.shopItems.create();
    }

    item.name = dto.name;
    item.description = dto.description ?? item.description ?? null;
    item.type = dto.type as ShopItemEntity['type'];
    item.rarity = (dto.rarity as ShopItemEntity['rarity']) ?? item.rarity ?? 'common';
    item.imageUrl = dto.imageUrl ?? item.imageUrl ?? null;
    item.price = dto.price;
    item.currency = (dto.currency as ShopItemEntity['currency']) ?? item.currency ?? 'coins';
    item.discountPercent = dto.discountPercent ?? item.discountPercent ?? 0;
    if (dto.isUniqueOwned != null) item.isUniqueOwned = dto.isUniqueOwned;
    if (dto.giftable != null) item.giftable = dto.giftable;
    if (dto.isAvailable != null) item.isAvailable = dto.isAvailable;
    if (dto.stock != null) item.stock = dto.stock;
    if (dto.sortOrder != null) item.sortOrder = dto.sortOrder;

    const saved = await this.shopItems.save(item);
    await this.audit(adminId, 'shop_item_saved', 'shop_item', saved.id, dto.name);
    return saved;
  }

  async deleteShopItem(adminId: string, itemId: string): Promise<{ deleted: true }> {
    const result = await this.shopItems.delete({ id: itemId });
    if (!result.affected) throw new NotFoundException('Shop item not found.');
    await this.audit(adminId, 'shop_item_deleted', 'shop_item', itemId, null);
    return { deleted: true };
  }

  // ── Game management ─────────────────────────────────────────────────────

  listGames(): Promise<GameEntity[]> {
    return this.games.find({ order: { name: 'ASC' } });
  }

  /**
   * Adds a new game to the catalogue. A game whose slug has no registered
   * engine is persisted as `coming_soon` (and cannot be activated), so the
   * catalogue can safely advertise in-development titles without the lobby
   * offering a game the backend cannot run.
   */
  async createGame(adminId: string, dto: AdminUpsertGameDto): Promise<GameEntity> {
    if (!dto.slug) throw new BadRequestException('A slug is required to add a game.');
    const existing = await this.games.findOne({ where: { slug: dto.slug } });
    if (existing) throw new BadRequestException('A game with that slug already exists.');

    const engineReady = this.engines.has(dto.slug);
    const requestedStatus = (dto.status as GameEntity['status']) ?? 'coming_soon';
    const status = requestedStatus === 'active' && !engineReady ? 'coming_soon' : requestedStatus;

    const game = this.games.create({
      slug: dto.slug,
      name: dto.name,
      description: dto.description ?? null,
      iconUrl: dto.iconUrl ?? null,
      minPlayers: dto.minPlayers ?? 2,
      maxPlayers: dto.maxPlayers ?? 6,
      avgDurationMinutes: dto.avgDurationMinutes ?? 10,
      supportsBots: dto.supportsBots ?? true,
      rankedEnabled: dto.rankedEnabled ?? true,
      status: status as GameEntity['status'],
    });
    const saved = await this.games.save(game);
    await this.audit(adminId, 'game_created', 'game', saved.slug, saved.name);
    return saved;
  }

  async setGameStatus(adminId: string, slug: string, status: string): Promise<GameEntity> {
    const game = await this.games.findOne({ where: { slug } });
    if (!game) throw new NotFoundException('Game not found.');
    if (status === 'active' && !this.engines.has(slug)) {
      throw new BadRequestException('That game has no playable engine and cannot be activated yet.');
    }
    game.status = status as GameEntity['status'];
    const saved = await this.games.save(game);
    await this.audit(adminId, 'game_status', 'game', slug, status);
    return saved;
  }

  async updateGame(adminId: string, slug: string, dto: AdminUpsertGameDto): Promise<GameEntity> {
    const game = await this.games.findOne({ where: { slug } });
    if (!game) throw new NotFoundException('Game not found.');
    game.name = dto.name ?? game.name;
    if (dto.description !== undefined) game.description = dto.description;
    if (dto.iconUrl !== undefined) game.iconUrl = dto.iconUrl;
    if (dto.minPlayers != null) game.minPlayers = dto.minPlayers;
    if (dto.maxPlayers != null) game.maxPlayers = dto.maxPlayers;
    if (dto.avgDurationMinutes != null) game.avgDurationMinutes = dto.avgDurationMinutes;
    if (dto.supportsBots != null) game.supportsBots = dto.supportsBots;
    if (dto.rankedEnabled != null) game.rankedEnabled = dto.rankedEnabled;
    if (dto.status != null) game.status = dto.status as GameEntity['status'];
    const saved = await this.games.save(game);
    await this.audit(adminId, 'game_updated', 'game', slug, dto.name ?? game.name);
    return saved;
  }

  // ── Seasons ─────────────────────────────────────────────────────────────

  async listSeasons(): Promise<SeasonEntity[]> {
    return this.seasons.find({ order: { seasonNumber: 'DESC' }, take: 10 });
  }

  async activeSeason(): Promise<SeasonEntity | null> {
    return this.seasonsService.activeSeason();
  }

  /** Forces the active season to roll over (snapshot, grant rewards, start next). */
  async rolloverSeason(adminId: string): Promise<{ rolledOver: true }> {
    const active = await this.seasonsService.activeSeason();
    if (!active) throw new BadRequestException('No active season.');
    await this.seasonsService.rollover(active);
    await this.audit(adminId, 'season_rollover', 'season', active.id, active.name);
    return { rolledOver: true };
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private toUserRow(user: UserEntity): AdminUserRow {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      username: user.profile?.username ?? '',
      displayName: user.profile?.displayName ?? '',
      avatarUrl: user.profile?.avatarUrl ?? null,
      status: user.status,
      role: user.role ?? 'player',
      isBot: user.isBot,
      isVerified: user.isVerified,
      coins: Number(user.profile?.coins ?? 0),
      pips: Number(user.profile?.pips ?? 0),
      level: Number(user.profile?.level ?? 1),
      gamesPlayed: Number(user.profile?.gamesPlayed ?? 0),
      presence: user.presence,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private async audit(actorId: string, action: string, targetType: string, targetId: string, reason: string | null): Promise<void> {
    try {
      await this.moderation.writeAudit({
        actorId,
        action: action as never,
        targetType,
        targetId,
        reason,
      });
    } catch {
      // audit failures must never break the admin action
    }
  }
}
