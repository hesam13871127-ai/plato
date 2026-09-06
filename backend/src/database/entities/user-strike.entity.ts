import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A single conduct strike against a user. The moderation automation and human
 * moderators both append rows; the escalation policy (AutoModerationService)
 * reads the recent strike count to decide warnings / mutes / suspensions.
 */
@Entity('user_strikes')
@Index('idx_strikes_user', ['userId', 'createdAt'])
export class UserStrikeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  /** 'auto' for the classifier, otherwise the moderator/admin user id. */
  @Column({ type: 'varchar', length: 36, default: 'auto' })
  issuedBy: string;

  @Column({ type: 'varchar', length: 32 })
  reason: string;

  @Column({ type: 'tinyint', default: 1 })
  weight: number;

  /** 'warning' | 'mute' | 'ban' | 'note' — what this strike triggered. */
  @Column({ type: 'varchar', length: 16, default: 'note' })
  consequence: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  relatedFlagId: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
