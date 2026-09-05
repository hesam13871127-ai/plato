import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SeasonEntity } from './season.entity';
import { UserEntity } from './user.entity';

/**
 * Records that a player has been granted a season reward, so rollover is
 * idempotent. A player receives at most:
 *   - one `tier` claim per season (based on their overall best tier), and
 *   - one `game` claim per (season, game) for top leaderboard finishers.
 */
@Entity('season_reward_claims')
@Index('idx_season_claim_unique', ['seasonId', 'userId', 'kind', 'gameId'], { unique: true })
export class SeasonRewardClaimEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  seasonId: string;

  @ManyToOne(() => SeasonEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'season_id' })
  season: SeasonEntity;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  /** 'tier' = Bronze/Silver/Gold season reward; 'game' = per-game top-finisher reward. */
  @Column({ type: 'varchar', length: 16, default: 'tier' })
  kind: 'tier' | 'game';

  /** Set only for `kind = 'game'` rewards. */
  @Column({ name: 'game_id', type: 'varchar', length: 36, nullable: true })
  gameId: string | null;

  /** Tier reached / leaderboard rank that earned the reward. */
  @Column({ type: 'int', default: 0 })
  rankAchieved: number;

  @Column({ type: 'varchar', length: 16, default: 'bronze' })
  tier: string;

  /** Coins granted (auditable snapshot). */
  @Column({ type: 'bigint', default: 0 })
  coinsGranted: number;

  @Column({ type: 'bigint', default: 0 })
  pipsGranted: number;

  @Column({ type: 'bigint', default: 0 })
  xpGranted: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  grantedAt: Date;
}
