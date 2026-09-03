import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Currency, TransactionType } from '../database/enums';
import { ProfileEntity } from '../database/entities/profile.entity';
import { TransactionEntity } from '../database/entities/transaction.entity';
import {
  InsufficientFundsException,
  WalletNotFoundException,
} from './economy.exceptions';
import { applyXp } from './leveling.util';

export interface WalletBalance {
  coins: number;
  pips: number;
  level: number;
  xp: number;
}

interface LedgerContext {
  type: TransactionType;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
}

/**
 * The single authority over currency mutations. Every credit/debit runs inside
 * a database transaction against a row-locked wallet (`SELECT ... FOR UPDATE`
 * on MySQL), which guarantees two concurrent operations can never over-spend
 * the same balance (no double-spending) and that balances never go negative.
 *
 * Every mutation appends an immutable ledger row to `transactions`.
 */
@Injectable()
export class EconomyService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Current wallet for a user (read-only). */
  async getBalance(userId: string): Promise<WalletBalance> {
    return this.dataSource.transaction(async (manager) => this.readBalance(manager, userId));
  }

  /**
   * Credit (add) currency. `amount` must be positive. Runs inside an optional
   * external transaction (`manager`) so purchases/rewards can be atomic with
   * inventory/quest writes.
   */
  async credit(
    userId: string,
    currency: Currency,
    amount: number,
    ctx: LedgerContext,
    manager?: EntityManager,
  ): Promise<WalletBalance> {
    if (amount <= 0) throw new Error('Credit amount must be positive.');
    const run = async (m: EntityManager) => {
      const profile = await this.lockWallet(m, userId);
      this.mutate(profile, currency, amount);
      await m.save(profile);
      await this.writeLedger(m, userId, currency, amount, balanceOf(profile, currency), ctx);
      return toBalance(profile);
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /**
   * Debit (spend) currency. Throws {@link InsufficientFundsException} if the
   * balance is insufficient — the whole transaction rolls back, so no partial
   * state persists.
   */
  async debit(
    userId: string,
    currency: Currency,
    amount: number,
    ctx: LedgerContext,
    manager?: EntityManager,
  ): Promise<WalletBalance> {
    if (amount <= 0) throw new Error('Debit amount must be positive.');
    const run = async (m: EntityManager) => {
      const profile = await this.lockWallet(m, userId);
      const balance = balanceOf(profile, currency);
      if (balance < amount) {
        throw new InsufficientFundsException(currency, amount, balance);
      }
      this.mutate(profile, currency, -amount);
      await m.save(profile);
      await this.writeLedger(m, userId, currency, -amount, balanceOf(profile, currency), ctx);
      return toBalance(profile);
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /**
   * Atomic transfer from one wallet to another (used by gifting). The sender
   * is debited and the recipient credited in the same transaction; either both
   * succeed or both roll back.
   */
  async transfer(
    fromUserId: string,
    toUserId: string,
    currency: Currency,
    amount: number,
    ctx: { senderCtx: LedgerContext; recipientCtx: LedgerContext },
    manager?: EntityManager,
  ): Promise<void> {
    const run = async (m: EntityManager) => {
      const sender = await this.lockWallet(m, fromUserId);
      const senderBalance = balanceOf(sender, currency);
      if (senderBalance < amount) {
        throw new InsufficientFundsException(currency, amount, senderBalance);
      }
      this.mutate(sender, currency, -amount);
      await m.save(sender);
      await this.writeLedger(m, fromUserId, currency, -amount, balanceOf(sender, currency), ctx.senderCtx);

      const recipient = await this.lockWallet(m, toUserId);
      this.mutate(recipient, currency, amount);
      await m.save(recipient);
      await this.writeLedger(m, toUserId, currency, amount, balanceOf(recipient, currency), ctx.recipientCtx);
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /**
   * Grants XP and recomputes level (leveling is free, never a spend). Returns
   * the resulting level/up flag.
   */
  async grantXp(
    userId: string,
    deltaXp: number,
    manager?: EntityManager,
  ): Promise<{ level: number; xp: number; leveledUp: boolean }> {
    const run = async (m: EntityManager) => {
      const profile = await this.lockWallet(m, userId);
      const result = applyXp(Number(profile.level), Number(profile.xp), deltaXp);
      profile.level = result.level;
      profile.xp = result.xp;
      await m.save(profile);
      return result;
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async lockWallet(manager: EntityManager, userId: string): Promise<ProfileEntity> {
    const isMysql = this.dataSource.options.type === 'mysql';

    if (isMysql) {
      // Pessimistic row lock: serializes concurrent wallet mutations.
      const qb = manager
        .getRepository(ProfileEntity)
        .createQueryBuilder('profile')
        .setLock('pessimistic_write')
        .where('profile.userId = :userId', { userId });
      const profile = await qb.getOne();
      if (!profile) throw new WalletNotFoundException(userId);
      return profile;
    }

    // SQLite (tests/dev): no row locks; the single-writer transaction still
    // provides atomicity and the balance check prevents negative balances.
    const profile = await manager.findOne(ProfileEntity, { where: { userId } });
    if (!profile) throw new WalletNotFoundException(userId);
    return profile;
  }

  private mutate(profile: ProfileEntity, currency: Currency, delta: number): void {
    if (currency === 'coins') {
      const next = Number(profile.coins) + delta;
      profile.coins = next;
    } else {
      const next = Number(profile.pips) + delta;
      profile.pips = next;
    }
  }

  private async writeLedger(
    manager: EntityManager,
    userId: string,
    currency: Currency,
    amount: number,
    balanceAfter: number,
    ctx: LedgerContext,
  ): Promise<void> {
    const entry = manager.create(TransactionEntity, {
      userId,
      type: ctx.type,
      currency,
      amount,
      balanceAfter,
      referenceType: ctx.referenceType ?? null,
      referenceId: ctx.referenceId ?? null,
      description: ctx.description ?? null,
    });
    await manager.save(entry);
  }

  private async readBalance(manager: EntityManager, userId: string): Promise<WalletBalance> {
    const profile = await manager.findOne(ProfileEntity, { where: { userId } });
    if (!profile) throw new WalletNotFoundException(userId);
    return toBalance(profile);
  }
}

function balanceOf(profile: ProfileEntity, currency: Currency): number {
  return currency === 'coins' ? Number(profile.coins) : Number(profile.pips);
}

function toBalance(profile: ProfileEntity): WalletBalance {
  return {
    coins: Number(profile.coins),
    pips: Number(profile.pips),
    level: Number(profile.level),
    xp: Number(profile.xp),
  };
}
