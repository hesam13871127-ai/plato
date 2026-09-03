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
import { RoomPlayerStatus } from '../enums';
import { RoomEntity } from './room.entity';
import { UserEntity } from './user.entity';

@Entity('room_players')
@Index('idx_room_player_pair', ['roomId', 'userId'], { unique: true })
export class RoomPlayerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  roomId: string;

  @ManyToOne(() => RoomEntity, (room) => room.players, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: RoomEntity;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'int', default: 0 })
  seatNumber: number;

  @Column({ type: 'boolean', default: false })
  isBot: boolean;

  @Column({ type: 'boolean', default: false })
  isReady: boolean;

  @Column({ type: 'varchar', length: 16, default: 'invited' })
  status: RoomPlayerStatus;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  joinedAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
