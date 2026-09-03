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
  @Column({ type: 'varchar', length: 36 })
  chatId: string;

  @ManyToOne(() => ChatEntity, (chat) => chat.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chat_id' })
  chat: ChatEntity;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  senderId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender: UserEntity;

  @Column({ type: 'varchar', length: 16, default: 'text' })
  type: MessageType;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  editedAt: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
