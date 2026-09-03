import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BanType } from '../enums';
import { UserEntity } from './user.entity';

/**
 * Enforcement action applied to a user. A non-null `expiresAt` is a temporary
 * ban; null with type `permanent` is indefinite.
 */
@Entity('bans')
@Index('idx_bans_active', ['userId', 'type', 'expiresAt'])
export class BanEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 16 })
  type: BanType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  bannedBy: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'banned_by' })
  banner: UserEntity | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  liftedAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
