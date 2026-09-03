import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Currency, QuestGoalType } from '../enums';
import { UserQuestEntity } from './user-quest.entity';

/**
 * Catalogue of daily quests. Every active player is offered the same set each
 * day; progress rows are tracked in `user_quests`.
 */
@Entity('quests')
export class QuestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  description: string | null;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  goalType: QuestGoalType;

  /** Number of goal actions required to complete the quest. */
  @Column({ type: 'int', default: 1 })
  goalTarget: number;

  @Column({ type: 'bigint', default: 0 })
  rewardCoins: number;

  @Column({ type: 'bigint', default: 0 })
  rewardPips: number;

  @Column({ type: 'int', default: 0 })
  rewardXp: number;

  @Column({ type: 'varchar', length: 16, default: 'coins' })
  rewardCurrency: Currency;

  @Column({ type: 'int', default: 1 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => UserQuestEntity, (userQuest) => userQuest.quest)
  userQuests: UserQuestEntity[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
