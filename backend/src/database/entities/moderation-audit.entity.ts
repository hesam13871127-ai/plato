import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditAction } from '../enums';

/**
 * Immutable audit trail of moderation actions. Every enforcement action —
 * automatic or taken by a moderator/admin — is appended here so the platform
 * has a tamper-evident history of who did what and why.
 */
@Entity('moderation_audit_log')
@Index('idx_audit_created', ['createdAt'])
@Index('idx_audit_target', ['targetType', 'targetId'])
@Index('idx_audit_actor', ['actorId'])
export class ModerationAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Who performed the action ('system' for automatic moderation). */
  @Column({ type: 'varchar', length: 36, default: 'system' })
  actorId: string;

  @Column({ type: 'varchar', length: 32 })
  action: AuditAction;

  @Column({ type: 'varchar', length: 16, nullable: true })
  targetType: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  targetId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
