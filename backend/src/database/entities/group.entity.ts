import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { GroupMemberEntity } from './group-member.entity';

/**
 * A player-created friend group / club with its own group chat.
 */
@Entity('groups')
export class GroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  description: string | null;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  ownerId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner: UserEntity;

  @OneToMany(() => GroupMemberEntity, (member) => member.group)
  members: GroupMemberEntity[];

  @Column({ type: 'int', default: 1 })
  memberCount: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
