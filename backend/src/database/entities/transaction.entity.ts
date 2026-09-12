import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Currency, TransactionType } from '../enums';
import { UserEntity } from './user.entity';

/**
 * Immutable wallet ledger entry. Positive `amount` credits, negative debits.
 * Balances on `profiles` are derived/maintained from this ledger.
 */
@Entity('transactions')
@Index('idx_transactions_user_created', ['userId', 'createdAt'])
@Index('idx_transactions_reference', ['referenceType', 'referenceId'])
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Index('idx_transactions_type')
  @Column({ type: 'varchar', length: 32 })
  type: TransactionType;

  @Column({ type: 'varchar', length: 16 })
  currency: Currency;

  /** Signed amount in whole currency units. */
  @Column({ type: 'bigint' })
  amount: number;

  @Column({ type: 'bigint', default: 0 })
  balanceAfter: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  referenceType: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  referenceId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
