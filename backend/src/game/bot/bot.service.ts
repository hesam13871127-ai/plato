import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import type { AppConfig } from '../../config/configuration';
import { BotEntity } from '../../database/entities/bot.entity';
import { ProfileEntity } from '../../database/entities/profile.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { BotDifficulty } from '../../database/enums';

export interface BotCandidate {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  level: number;
  rating: number;
  difficulty: BotDifficulty;
  language: string;
  region: string;
}

const FIRST_NAMES = [
  'Aria', 'Marco', 'Lena', 'Kian', 'Nora', 'Theo', 'Mira', 'Sami', 'Elif', 'Omar',
  'Zara', 'Leo', 'Ines', 'Noah', 'Maya', 'Ravi', 'Lina', 'Yusuf', 'Eva', 'Darius',
  'Sofia', 'Amir', 'Clara', 'Idris', 'Nadia', 'Felix', 'Yara', 'Bram', 'Selin', 'Jonas',
];
const NAME_PARTS = ['plays', 'rolls', 'tiles', 'table', 'lucky', 'neon', 'king', 'ace', 'dice', 'moves'];
const LANGUAGES = ['en', 'fa', 'tr', 'ar', 'de', 'fr', 'es'];
const REGIONS = ['eu', 'na', 'me', 'asia'];
const DIFFICULTIES: BotDifficulty[] = ['easy', 'medium', 'hard', 'expert'];

/**
 * Owns the pool of invisible AI players. Bots are real `users` rows flagged
 * `is_bot = true` (never serialised to clients — the user DTO omits that flag),
 * with complete, believable profiles, ratings and localisation. Matchmaking
 * draws the closest bot to a human's skill/language/region.
 */
@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private readonly poolSize: number;

  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(BotEntity) private readonly bots: Repository<BotEntity>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    this.poolSize = this.configService.get('game.botPoolSize', { infer: true });
  }

  /** Ensures a healthy pool of bots exists; called on bootstrap. */
  async seedPool(): Promise<number> {
    const existing = await this.bots.count({ where: { isActive: true } });
    if (existing >= this.poolSize) {
      this.logger.log(`Bot pool ready (${existing} bots).`);
      return existing;
    }

    let created = 0;
    await this.dataSource.transaction(async (manager) => {
      const usedUsernames = new Set(
        (await manager.find(ProfileEntity, { select: { username: true } })).map((p) => p.username),
      );

      for (let i = existing; i < this.poolSize; i++) {
        const username = this.uniqueUsername(usedUsernames);
        const displayName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
        const language = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];
        const region = REGIONS[Math.floor(Math.random() * REGIONS.length)];
        // Skill distribution: mostly medium, a few easy/hard/expert.
        const difficulty = this.rollDifficulty();
        const rating = this.ratingForDifficulty(difficulty) + Math.floor(Math.random() * 160) - 80;
        const level = 1 + Math.floor(Math.random() * 40);
        const wins = Math.floor(Math.random() * 120);
        const losses = Math.floor(wins * (0.6 + Math.random() * 0.9));

        const user = manager.create(UserEntity, {
          id: uuidv4(),
          phone: null,
          email: null,
          passwordHash: null,
          primaryProvider: 'email',
          status: 'active',
          isVerified: true,
          isBot: true,
          gender: 'unspecified',
          presence: 'offline',
        });
        await manager.save(user);

        const profile = manager.create(ProfileEntity, {
          userId: user.id,
          user,
          username,
          displayName,
          avatarUrl: null,
          country: region.toUpperCase(),
          bio: this.bioFor(displayName),
          level,
          xp: level * 100,
          coins: 500 + Math.floor(Math.random() * 9500),
          pips: Math.floor(Math.random() * 200),
          gamesPlayed: wins + losses,
          gamesWon: wins,
          gamesLost: losses,
          gamesDrawn: Math.floor(Math.random() * 10),
          streakDays: Math.floor(Math.random() * 7),
          giftsSent: Math.floor(Math.random() * 30),
          giftsReceived: Math.floor(Math.random() * 60),
          badges: [
            { code: 'games_50', label: 'Regular' },
            ...(wins > 50 ? [{ code: 'winner_50', label: 'Sharp Eye' }] : []),
          ],
          settings: { language, region },
        });
        await manager.save(profile);

        await manager.save(
          manager.create(BotEntity, {
            userId: user.id,
            difficulty,
            personality: this.personalityFor(difficulty),
            config: { language, region, baseRating: rating },
            isActive: true,
          }),
        );
        created++;
      }
    });

    this.logger.log(`Seeded ${created} bots (pool total ${existing + created}).`);
    return existing + created;
  }

  /**
   * Finds the closest active bot to a human's rating/language/region.
   * Skill closeness dominates; shared language then region break ties so the
   * match feels natural. Never exposes isBot to the caller's serialiser.
   */
  async pickClosest(opts: {
    rating: number;
    language?: string | null;
    region?: string | null;
    excludeUserIds?: string[];
  }): Promise<BotCandidate> {
    const exclude = new Set(opts.excludeUserIds ?? []);
    const rows = await this.bots.find({
      where: { isActive: true },
      order: { createdAt: 'ASC' },
    });
    const botUserIds = rows.map((b) => b.userId);
    if (botUserIds.length === 0) {
      await this.seedPool();
      return this.pickClosest(opts);
    }

    const users = await this.users.find({ where: { id: In(botUserIds) } });
    const profiles = await this.profiles.find({ where: { userId: In(botUserIds) } });
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
    const botByUser = new Map(rows.map((b) => [b.userId, b]));

    const scored: Array<BotCandidate & { distance: number }> = [];
    for (const user of users) {
      if (exclude.has(user.id)) continue;
      const profile = profileByUser.get(user.id);
      const bot = botByUser.get(user.id);
      if (!profile || !bot) continue;
      const settings = (profile.settings ?? {}) as { language?: string; region?: string };
      const baseRating = ((bot.config as { baseRating?: number } | null)?.baseRating) ?? 1000;

      let distance = Math.abs(baseRating - opts.rating);
      if (opts.language && settings.language === opts.language) distance -= 120;
      if (opts.region && settings.region === opts.region) distance -= 60;
      scored.push({
        userId: user.id,
        displayName: profile.displayName,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        level: Number(profile.level),
        rating: baseRating,
        difficulty: bot.difficulty,
        language: settings.language ?? 'en',
        region: settings.region ?? 'eu',
        distance,
      });
    }

    if (scored.length === 0) {
      return this.pickClosest({ ...opts, excludeUserIds: [] });
    }
    scored.sort((a, b) => a.distance - b.distance);
    const { distance: _distance, ...best } = scored[0];
    void _distance;
    return best;
  }

  async difficultyFor(userId: string): Promise<BotDifficulty> {
    const bot = await this.bots.findOne({ where: { userId } });
    return bot?.difficulty ?? 'medium';
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private rollDifficulty(): BotDifficulty {
    const r = Math.random();
    if (r < 0.2) return 'easy';
    if (r < 0.7) return 'medium';
    if (r < 0.92) return 'hard';
    return 'expert';
  }

  private ratingForDifficulty(d: BotDifficulty): number {
    switch (d) {
      case 'easy':
        return 850;
      case 'medium':
        return 1050;
      case 'hard':
        return 1300;
      case 'expert':
        return 1550;
    }
  }

  private personalityFor(d: BotDifficulty): string {
    switch (d) {
      case 'easy':
        return 'casual';
      case 'medium':
        return 'friendly';
      case 'hard':
        return 'calculated';
      case 'expert':
        return 'aggressive';
    }
  }

  private bioFor(name: string): string {
    const bios = [
      `${name} here for a good game and good vibes.`,
      'Coffee, tables and a little luck.',
      'Love a quick match between breaks.',
      'Rolling tiles since forever.',
      'Here to relax and play.',
    ];
    return bios[Math.floor(Math.random() * bios.length)];
  }

  private uniqueUsername(used: Set<string>): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      const part = NAME_PARTS[Math.floor(Math.random() * NAME_PARTS.length)];
      const num = Math.floor(Math.random() * 9000) + 1000;
      const candidate = `${part}_${num}`;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
    return `player_${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`;
  }
}
