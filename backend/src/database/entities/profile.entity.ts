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
import { UserEntity } from './user.entity';

/**
 * Public profile + wallet + aggregate statistics for a user. Kept in a 1:1
 * table so the authentication row stays lean and profile writes do not touch
 * login credentials. The profile is identified by its `user_id` foreign key.
 */
@Entity('profiles')
export class ProfileEntity {
  /** Primary key and foreign key to `users.id` (1:1). */
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @OneToOne(() => UserEntity, (user) => user.profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  username: string;

  @Column({ type: 'varchar', length: 64 })
  displayName: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  bio: string | null;

  @Column({ type: 'int', default: 0 })
  level: number;

  @Column({ type: 'int', default: 0 })
  xp: number;

  @Column({ type: 'bigint', default: 0 })
  coins: number;

  @Column({ type: 'bigint', default: 0 })
  gems: number;

  @Column({ type: 'int', default: 0 })
  gamesPlayed: number;

  @Column({ type: 'int', default: 0 })
  gamesWon: number;

  @Column({ type: 'int', default: 0 })
  gamesLost: number;

  @Column({ type: 'int', default: 0 })
  gamesDrawn: number;

  @Column({ type: 'int', default: 0 })
  streakDays: number;

  @Column({ type: 'json', nullable: true })
  settings: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
