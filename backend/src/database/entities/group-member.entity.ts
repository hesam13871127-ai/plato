import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { GroupMemberRole } from '../enums';
import { GroupEntity } from './group.entity';
import { UserEntity } from './user.entity';

@Entity('group_members')
@Index('idx_group_member_pair', ['groupId', 'userId'], { unique: true })
export class GroupMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  groupId: string;

  @ManyToOne(() => GroupEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: GroupEntity;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 16, default: 'member' })
  role: GroupMemberRole;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastReadAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  joinedAt: Date;
}
