import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MessageType } from '../enums';
import { ChatEntity } from './chat.entity';
import { UserEntity } from './user.entity';

@Entity('messages')
@Index('idx_messages_chat_created', ['chatId', 'createdAt'])
export class MessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'chat_id', type: 'varchar', length: 36 })
  chatId: string;

  @ManyToOne(() => ChatEntity, (chat) => chat.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chat_id' })
  chat: ChatEntity;

  @Index()
  @Column({ name: 'sender_id', type: 'varchar', length: 36 })
  senderId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender: UserEntity;

  @Column({ name: 'type', type: 'varchar', length: 16, default: 'text' })
  type: MessageType;

  @Column({ name: 'body', type: 'text' })
  body: string;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  /** Message this one is a reply to (self-referencing thread link). */
  @Index()
  @Column({ name: 'reply_to_id', type: 'varchar', length: 36, nullable: true })
  replyToId: string | null;

  @ManyToOne(() => MessageEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reply_to_id' })
  replyTo: MessageEntity | null;

  /** True while pinned in the chat (latest pinned message is denormalised on chats). */
  @Column({ type: 'boolean', default: false })
  isPinned: boolean;

  @Column({ name: 'pinned_at', type: 'datetime', precision: 6, nullable: true })
  pinnedAt: Date | null;

  @Column({ name: 'pinned_by', type: 'varchar', length: 36, nullable: true })
  pinnedBy: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  editedAt: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
