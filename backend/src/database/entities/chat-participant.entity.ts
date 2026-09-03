import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChatEntity } from './chat.entity';
import { UserEntity } from './user.entity';

@Entity('chat_participants')
@Index('idx_chat_participant_pair', ['chatId', 'userId'], { unique: true })
export class ChatParticipantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  chatId: string;

  @ManyToOne(() => ChatEntity, (chat) => chat.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chat_id' })
  chat: ChatEntity;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'boolean', default: false })
  isMuted: boolean;

  @Column({ type: 'datetime', precision: 6 })
  lastReadAt: Date;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  joinedAt: Date;
}
