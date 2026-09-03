import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

/**
 * Persisted refresh-token family used for rotation + reuse detection.
 * Only a SHA-256 hash of the token is stored; the raw token lives only in
 * the client's secure storage. On rotation the old token is marked `rotated`;
 * presenting it again is treated as theft and revokes the whole family.
 */
@Entity('refresh_tokens')
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  /** SHA-256 hash of the raw refresh token (unique). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  /** Identifier grouping all rotations descended from one login. */
  @Index()
  @Column({ type: 'varchar', length: 36 })
  familyId: string;

  @Column({ type: 'datetime', precision: 6 })
  expiresAt: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  rotatedAt: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'boolean', default: false })
  reused: boolean;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
