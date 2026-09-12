import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OtpPurpose } from '../enums';

/**
 * One-time passcode sent over SMS for phone authentication. Codes are stored
 * hashed, expire after a short TTL and have a bounded number of verification
 * attempts. Rate-limiting is enforced via `lastSentAt`.
 */
@Entity('otp_codes')
export class OtpCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 64, default: 'login' })
  purpose: OtpPurpose;

  /** SHA-256 hash of the numeric code. */
  @Column({ type: 'varchar', length: 64 })
  codeHash: string;

  @Index('idx_otp_expires')
  @Column({ type: 'datetime', precision: 6 })
  expiresAt: Date;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'int', default: 5 })
  maxAttempts: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  consumedAt: Date | null;

  @Column({ type: 'datetime', precision: 6 })
  lastSentAt: Date;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
