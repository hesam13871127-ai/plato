import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuestStatus } from '../enums';
import { QuestEntity } from './quest.entity';
import { UserEntity } from './user.entity';

/**
 * A user's progress for a single quest on a single day. One row per
 * (user, quest, day) — the unique index enforces this.
 */
@Entity('user_quests')
@Index('idx_user_quest_unique', ['userId', 'questId', 'day'], { unique: true })
export class UserQuestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Index()
  @Column({ name: 'quest_id', type: 'varchar', length: 36 })
  questId: string;

  @ManyToOne(() => QuestEntity, (quest) => quest.userQuests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quest_id' })
  quest: QuestEntity;

  /** Day (local) this quest instance belongs to, as `YYYY-MM-DD` (UTC). */
  @Index('idx_user_quests_day')
  @Column({ type: 'date' })
  day: string;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ type: 'int', default: 1 })
  goalTarget: number;

  @Column({ type: 'varchar', length: 16, default: 'in_progress' })
  status: QuestStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  completedAt: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  claimedAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
