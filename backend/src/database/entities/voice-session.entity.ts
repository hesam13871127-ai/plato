import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

/**
 * A user currently joined to a voice channel. One active row per
 * (user, chat). The LiveKit room name equals `voice:{chatId}`. Rows are
 * created on join and removed on leave/disconnect, so the table doubles as a
 * durable roster for late-join presence and clean-up of stale sessions.
 */
@Entity('voice_sessions')
@Index('idx_voice_session_pair', ['chatId', 'userId'], { unique: true })
@Index('idx_voice_session_user', ['userId'])
export class VoiceSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Chat the voice channel is attached to (group/room/lounge). */
  @Index()
  @Column({ name: 'chat_id', type: 'varchar', length: 36 })
  chatId: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  /** LiveKit participant identity (stable across reconnects). */
  @Column({ name: 'identity', type: 'varchar', length: 64 })
  identity: string;

  @Column({ name: 'is_muted', type: 'boolean', default: false })
  isMuted: boolean;

  @Column({ name: 'is_deafened', type: 'boolean', default: false })
  isDeafened: boolean;

  @Column({ name: 'is_speaking', type: 'boolean', default: false })
  isSpeaking: boolean;

  /** Set while the user is screen/camera sharing. */
  @Column({ name: 'is_broadcasting', type: 'boolean', default: false })
  isBroadcasting: boolean;

  @CreateDateColumn({ name: 'joined_at', type: 'datetime', precision: 6 })
  joinedAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
