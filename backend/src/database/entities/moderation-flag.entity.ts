import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ContentVerdict, ModerationFlagReason } from '../enums';

/**
 * One automated (or reporter-driven) moderation flag raised against a piece of
 * content (currently chat messages; the target type keeps it generic). Rows
 * are written when the auto-moderation filter censors or blocks text, and
 * when enough reports accumulate. Moderators review these in the dashboard.
 */
@Entity('moderation_flags')
@Index('idx_mod_flags_status', ['status', 'createdAt'])
@Index('idx_mod_flags_target', ['targetType', 'targetId'])
@Index('idx_mod_flags_author', ['authorId'])
export class ModerationFlagEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16, default: 'message' })
  targetType: string;

  @Column({ type: 'varchar', length: 36 })
  targetId: string;

  /** User that produced the flagged content (null when unavailable). */
  @Column({ type: 'varchar', length: 36, nullable: true })
  authorId: string | null;

  @Column({ type: 'varchar', length: 24 })
  reason: ModerationFlagReason;

  /** What the filter decided about this content. */
  @Column({ type: 'varchar', length: 16, default: 'flagged' })
  verdict: ContentVerdict;

  /** The offending excerpt (truncated), for reviewer context. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  excerpt: string | null;

  /** Scores/metadata produced by the classifier (matched rules, etc.). */
  @Column({ type: 'json', nullable: true })
  details: Record<string, unknown> | null;

  /** open → reviewed / actioned / dismissed. */
  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: 'open' | 'reviewed' | 'actioned' | 'dismissed';

  @Column({ type: 'varchar', length: 36, nullable: true })
  resolvedBy: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
