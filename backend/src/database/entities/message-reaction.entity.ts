import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MessageEntity } from './message.entity';
import { UserEntity } from './user.entity';

/**
 * A single emoji reaction on a message. One row per (message, user, emoji);
 * a user toggling the same emoji removes the row, toggling a different emoji
 * adds one. Counts are aggregated per message when read.
 */
@Entity('message_reactions')
@Index('idx_reaction_unique', ['messageId', 'userId', 'emoji'], { unique: true })
export class MessageReactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'message_id', type: 'varchar', length: 36 })
  messageId: string;

  @ManyToOne(() => MessageEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message: MessageEntity;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  /** The emoji character (or short code) e.g. "👍", "😂", "❤️". */
  @Column({ name: 'emoji', type: 'varchar', length: 16 })
  emoji: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
}
