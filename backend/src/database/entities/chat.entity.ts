import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChatType } from '../enums';
import { ChatParticipantEntity } from './chat-participant.entity';
import { MessageEntity } from './message.entity';

/**
 * A conversation thread. `direct` chats are 1:1, `group` chats belong to a
 * friend group, `room` chats are ephemeral table chats, `system` chats are
 * server-generated notifications.
 */
@Entity('chats')
export class ChatEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  type: ChatType;

  @Column({ type: 'varchar', length: 128, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarUrl: string | null;

  /** Set for group / room chats: references groups.id or rooms.id. */
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  contextId: string | null;

  @OneToMany(() => ChatParticipantEntity, (participant) => participant.chat, { cascade: true })
  participants: ChatParticipantEntity[];

  @OneToMany(() => MessageEntity, (message) => message.chat)
  messages: MessageEntity[];

  @Column({ type: 'varchar', length: 36, nullable: true })
  lastMessageId: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastMessageAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
