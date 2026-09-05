import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChatMemberRole } from '../enums';
import { ChatEntity } from './chat.entity';
import { UserEntity } from './user.entity';

/**
 * A user's membership of a chat thread. Direct chats have exactly two
 * participants; group/lounge/room chats can have many (groups capped at 100).
 * `role` is only meaningful for group chats (owner/admin/member).
 */
@Entity('chat_participants')
@Index('idx_chat_participant_pair', ['chatId', 'userId'], { unique: true })
export class ChatParticipantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'chat_id', type: 'varchar', length: 36 })
  chatId: string;

  @ManyToOne(() => ChatEntity, (chat) => chat.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chat_id' })
  chat: ChatEntity;

  @Index()
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  /** owner/admin/member — defaults to member; set for group chats. */
  @Column({ name: 'role', type: 'varchar', length: 16, default: 'member' })
  role: ChatMemberRole;

  /** Per-user notification mute for this chat. */
  @Column({ name: 'is_muted', type: 'boolean', default: false })
  isMuted: boolean;

  /** High-water mark for unread-count calculation. */
  @Column({ name: 'last_read_at', type: 'datetime', precision: 6 })
  lastReadAt: Date;

  @CreateDateColumn({ name: 'joined_at', type: 'datetime', precision: 6 })
  joinedAt: Date;
}
