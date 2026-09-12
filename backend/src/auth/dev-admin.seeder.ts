import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { ProfileEntity } from '../database/entities/profile.entity';
import { UserEntity } from '../database/entities/user.entity';

/**
 * DEVELOPMENT-ONLY convenience account so the admin panel can be explored
 * locally without setting environment variables or sending an OTP.
 *
 * It runs ONLY when `NODE_ENV !== 'production'` (and can be disabled with
 * `DEV_SEED_ADMIN=false`). It is a hard no-op in production — the real
 * production path for creating staff is `MODERATION_ADMIN_EMAILS/PHONES`
 * plus the in-panel "make admin" action.
 *
 * Default credentials (override via env, never reuse in production):
 *   DEV_ADMIN_EMAIL    = admin@vibetable.local
 *   DEV_ADMIN_PASSWORD = Admin123!
 */
@Injectable()
export class DevAdminSeeder implements OnModuleInit {
  private readonly logger = new Logger(DevAdminSeeder.name);

  static readonly DEFAULT_EMAIL = 'admin@vibetable.local';
  static readonly DEFAULT_PASSWORD = 'Admin123!';
  static readonly USERNAME = 'admin';

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'production') return;
    if ((process.env.DEV_SEED_ADMIN ?? 'true').toLowerCase() === 'false') return;

    const email = (process.env.DEV_ADMIN_EMAIL ?? DevAdminSeeder.DEFAULT_EMAIL).toLowerCase();
    const password = process.env.DEV_ADMIN_PASSWORD ?? DevAdminSeeder.DEFAULT_PASSWORD;

    try {
      await this.seed(email, password);
    } catch (error) {
      // A boot-time seeding failure must never take the API down.
      this.logger.error(
        `Dev admin seeding failed: ${(error as Error).message}`,
      );
    }
  }

  private async seed(email: string, password: string): Promise<void> {

    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      // Ensure the dev account stays usable (admin + verified) even after
      // someone experimented with it.
      let changed = false;
      if (existing.role !== 'admin') { existing.role = 'admin'; changed = true; }
      if (existing.status !== 'active') { existing.status = 'active'; changed = true; }
      if (!existing.isVerified) { existing.isVerified = true; changed = true; }
      if (changed) await this.users.save(existing);
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const user = manager.create(UserEntity, {
        id: uuidv4(),
        phone: null,
        phoneNormalized: null,
        email,
        passwordHash: await bcrypt.hash(password, 12),
        primaryProvider: 'email',
        status: 'active',
        role: 'admin',
        isVerified: true,
        isBot: false,
        gender: 'unspecified',
        presence: 'offline',
      });
      await manager.save(user);

      const profile = manager.create(ProfileEntity, {
        userId: user.id,
        user,
        username: DevAdminSeeder.USERNAME,
        displayName: 'Platform Admin',
        avatarUrl: null,
        country: null,
        bio: 'Built-in development administrator account.',
        level: 1,
        xp: 0,
        coins: 1_000_000,
        pips: 100_000,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        gamesDrawn: 0,
        streakDays: 0,
        settings: { notifications: true, sound: true, music: true },
      });
      await manager.save(profile);
    });

    this.logger.warn(
      `Dev admin ready → email: ${email}  password: ${password}  ` +
        `(development only; set DEV_SEED_ADMIN=false to disable).`,
    );
  }
}
