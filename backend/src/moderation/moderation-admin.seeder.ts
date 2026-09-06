import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';

/**
 * Bootstraps the first platform administrator(s) without any manual SQL.
 *
 * Set `MODERATION_ADMIN_EMAILS` (comma-separated) and/or
 * `MODERATION_ADMIN_PHONES` to existing accounts; on startup those accounts
 * are promoted to `admin` (and any account in `MODERATION_MODERATOR_EMAILS`
 * to `moderator`). Empty by default, so nothing changes unless an operator
 * opts in — which keeps the rule that there is no hard-coded privileged user.
 */
@Injectable()
export class ModerationAdminSeeder implements OnModuleInit {
  private readonly logger = new Logger(ModerationAdminSeeder.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    const adminEmails = this.list(process.env.MODERATION_ADMIN_EMAILS);
    const adminPhones = this.list(process.env.MODERATION_ADMIN_PHONES);
    const modEmails = this.list(process.env.MODERATION_MODERATOR_EMAILS);

    for (const email of adminEmails) {
      await this.promote({ email }, 'admin');
    }
    for (const phone of adminPhones) {
      await this.promote({ phone }, 'admin');
    }
    for (const email of modEmails) {
      await this.promote({ email }, 'moderator');
    }
  }

  private async promote(where: { email?: string; phone?: string }, role: 'admin' | 'moderator'): Promise<void> {
    try {
      const criteria = where.email ? { email: where.email } : { phone: where.phone ?? '' };
      const user = await this.users.findOne({ where: criteria, select: ['id', 'role', 'email', 'phone'] });
      if (!user) {
        this.logger.warn(`Moderation bootstrap: no account for ${JSON.stringify(where)} yet; skipping.`);
        return;
      }
      if (user.role === role) return;
      user.role = role;
      await this.users.save(user);
      this.logger.log(`Promoted ${user.email ?? user.phone ?? user.id} to ${role}.`);
    } catch (err) {
      this.logger.warn(`Moderation bootstrap failed for ${JSON.stringify(where)}: ${(err as Error).message}`);
    }
  }

  private list(value: string | undefined): string[] {
    return (value ?? '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.length > 0);
  }
}
