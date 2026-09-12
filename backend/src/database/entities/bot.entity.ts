import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BotDifficulty } from '../enums';
import { UserEntity } from './user.entity';

/**
 * Internal configuration for AI/bot accounts. The linked `users.is_bot` flag
 * is the fast path used by queries; this row tunes behaviour per game.
 */
@Entity('bots')
export class BotEntity {
  /** Primary key and foreign key to `users.id` (1:1). */
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @OneToOne(() => UserEntity, (user) => user.bot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Index('idx_bots_difficulty')
  @Column({ type: 'varchar', length: 64, default: 'medium' })
  difficulty: BotDifficulty;

  @Column({ type: 'varchar', length: 64, nullable: true })
  personality: string | null;

  @Column({ type: 'json', nullable: true })
  config: Record<string, unknown> | null;

  @Index('idx_bots_active')
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
