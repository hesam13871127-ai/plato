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

  @Index('idx_chats_type')
  @Column({ type: 'varchar', length: 16 })
  type: ChatType;

  @Column({ type: 'varchar', length: 128, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarUrl: string | null;

  /** Set for group / room / lounge chats: references groups.id or rooms.id. */
  @Index()
  @Column({ name: 'context_id', type: 'varchar', length: 36, nullable: true })
  contextId: string | null;

  /** Join code for pass-gated groups/lounges (null = open). */
  @Column({ name: 'access_pass', type: 'varchar', length: 64, nullable: true })
  accessPass: string | null;

  /** Per-chat visual theme key (overrides the default bubble styling). */
  @Column({ name: 'theme_key', type: 'varchar', length: 32, nullable: true })
  themeKey: string | null;

  /** True for the public Lounge chat (single global room). */
  @Index('idx_chats_public')
  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic: boolean;

  @OneToMany(() => ChatParticipantEntity, (participant) => participant.chat, { cascade: true })
  participants: ChatParticipantEntity[];

  @OneToMany(() => MessageEntity, (message) => message.chat)
  messages: MessageEntity[];

  @Column({ name: 'last_message_id', type: 'varchar', length: 36, nullable: true })
  lastMessageId: string | null;

  @Index('idx_chats_last_message')
  @Column({ name: 'last_message_at', type: 'datetime', precision: 6, nullable: true })
  lastMessageAt: Date | null;

  /** Denormalised pointer to the currently pinned message. */
  @Column({ name: 'pinned_message_id', type: 'varchar', length: 36, nullable: true })
  pinnedMessageId: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
