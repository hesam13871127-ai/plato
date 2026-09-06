import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { normalizePhone } from '../common/utils/phone.util';

/**
 * Bootstraps platform staff (admins / moderators) without any hard-coded
 * privileged account and without manual SQL.
 *
 * Set `MODERATION_ADMIN_EMAILS` (comma-separated) and/or
 * `MODERATION_ADMIN_PHONES`, and `MODERATION_MODERATOR_EMAILS`. Accounts
 * matching those identifiers are promoted:
 *
 *  - **on signup/login** via {@link applyStaffRole} (called from the auth
 *    service), so the very first signup with a listed identifier is staff
 *    immediately — no restart gymnastics; and
 *  - **on startup** via {@link onModuleInit}, which catches any account
 *    that already existed before the operator configured the variables.
 *
 * Empty by default, so nothing changes unless an operator opts in.
 */
@Injectable()
export class ModerationAdminSeeder implements OnModuleInit {
  private readonly logger = new Logger(ModerationAdminSeeder.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const email of this.list(process.env.MODERATION_ADMIN_EMAILS)) {
      await this.promote({ email }, 'admin');
    }
    for (const phone of this.list(process.env.MODERATION_ADMIN_PHONES)) {
      await this.promote({ phone }, 'admin');
    }
    for (const email of this.list(process.env.MODERATION_MODERATOR_EMAILS)) {
      await this.promote({ email }, 'moderator');
    }
  }

  /**
   * Promotes an authenticated user to `admin`/`moderator` when their email or
   * phone is listed in the bootstrap variables. Called right after signup and
   * login. Never downgrades an account that already holds a staff role, and
   * is a no-op for accounts that are banned/suspended (those cannot login
   * anyway). Returns the updated role when a promotion happened.
   */
  async applyStaffRole(user: { id: string; email?: string | null; phone?: string | null }): Promise<'admin' | 'moderator' | null> {
    try {
      const email = user.email?.toLowerCase().trim();
      const phone = user.phone ? normalizePhone(user.phone) : null;

      let target: 'admin' | 'moderator' | null = null;
      if ((email && this.list(process.env.MODERATION_ADMIN_EMAILS).includes(email)) ||
          (phone && this.list(process.env.MODERATION_ADMIN_PHONES).includes(phone))) {
        target = 'admin';
      } else if (email && this.list(process.env.MODERATION_MODERATOR_EMAILS).includes(email)) {
        target = 'moderator';
      }
      if (!target) return null;

      const fresh = await this.users.findOne({ where: { id: user.id }, select: ['id', 'role'] });
      if (!fresh) return null;
      // Never downgrade (e.g. a listed moderator who was later made admin).
      if (fresh.role === target || (fresh.role === 'admin' && target === 'moderator')) return fresh.role as 'admin' | 'moderator';

      fresh.role = target;
      await this.users.save(fresh);
      this.logger.log(`Promoted ${user.email ?? user.phone ?? user.id} to ${target} on authentication.`);
      return target;
    } catch (err) {
      this.logger.warn(`Staff role promotion failed for ${user.id}: ${(err as Error).message}`);
      return null;
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
      .map((v) => v.startsWith('+') ? normalizePhone(v) : v)
      .filter((v) => v.length > 0);
  }
}
