import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ReportStatus, ReportTargetType } from '../enums';
import { UserEntity } from './user.entity';

/**
 * Moderation report filed by a user against another user, message, room or
 * group.
 */
@Entity('reports')
@Index('idx_reports_target', ['targetType', 'targetId'])
export class ReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  reporterId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: UserEntity;

  @Column({ type: 'varchar', length: 16 })
  targetType: ReportTargetType;

  @Column({ type: 'varchar', length: 36 })
  targetId: string;

  @Column({ type: 'varchar', length: 128 })
  reason: string;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: ReportStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  resolvedBy: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'resolved_by' })
  resolver: UserEntity | null;

  @Column({ type: 'text', nullable: true })
  resolutionNote: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
