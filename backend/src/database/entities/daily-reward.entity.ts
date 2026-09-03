import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

/**
 * One row per user per day they claim the free daily login reward. The streak
 * counter and reward schedule live on the application side; this table is the
 * authoritative claim ledger used to prevent double-claims.
 */
@Entity('daily_reward_claims')
@Index('idx_daily_reward_unique', ['userId', 'day'], { unique: true })
export class DailyRewardClaimEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  /** Claimed day as `YYYY-MM-DD` (UTC). */
  @Column({ type: 'date' })
  day: string;

  /** Consecutive-day streak at the time of this claim (1-based). */
  @Column({ type: 'int', default: 1 })
  streakDay: number;

  @Column({ type: 'bigint', default: 0 })
  coinsAwarded: number;

  @Column({ type: 'bigint', default: 0 })
  pipsAwarded: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  claimedAt: Date;
}
