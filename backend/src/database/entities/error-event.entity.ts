import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ErrorLevel } from '../enums';

/**
 * Persisted error/observability events. Captures unexpected exceptions (5xx),
 * security events (rate-limit triggers, rejected auth) and the context needed
 * to triage them — without storing secrets (tokens/body passwords are
 * stripped by the tracking service before persistence).
 */
@Entity('error_events')
@Index('idx_errors_level_time', ['level', 'createdAt'])
@Index('idx_errors_fingerprint', ['fingerprint'])
export class ErrorEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 12 })
  level: ErrorLevel;

  /** Stable hash grouping identical failures together. */
  @Column({ type: 'varchar', length: 64 })
  fingerprint: string;

  /** 'http' | 'ws' | 'system'. */
  @Column({ type: 'varchar', length: 12, default: 'http' })
  source: string;

  @Column({ type: 'varchar', length: 255 })
  message: string;

  @Column({ type: 'text', nullable: true })
  stack: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  method: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  path: string | null;

  @Column({ type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  userId: string | null;

  /** Redacted request context (headers minus cookies/auth, query, etc.). */
  @Column({ type: 'json', nullable: true })
  context: Record<string, unknown> | null;

  /** How many times this fingerprint has been seen (denormalised counter). */
  @Column({ type: 'int', default: 1 })
  occurrences: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  firstSeenAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
