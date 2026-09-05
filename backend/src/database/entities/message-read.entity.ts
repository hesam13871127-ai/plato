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
 * Per-user read receipts for messages. Chat-level cursors live on
 * chat_participants (`last_read_at`); this table powers "seen by" lists.
 */
@Entity('message_reads')
@Index('idx_message_read_pair', ['messageId', 'userId'], { unique: true })
export class MessageReadEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'message_id', type: 'varchar', length: 36 })
  messageId: string;

  @ManyToOne(() => MessageEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message: MessageEntity;

  @Index()
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @CreateDateColumn({ name: 'read_at', type: 'datetime', precision: 6 })
  readAt: Date;
}
