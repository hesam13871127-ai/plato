import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RoomStatus } from '../enums';
import { GameEntity } from './game.entity';
import { UserEntity } from './user.entity';
import { RoomPlayerEntity } from './room-player.entity';

/**
 * A lobby/table created by a player. Rooms become matches once a game starts.
 */
@Entity('rooms')
@Check('chk_rooms_fee', 'entry_fee_coins >= 0')
export class RoomEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  gameId: string;

  @ManyToOne(() => GameEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'game_id' })
  game: GameEntity;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  hostId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'host_id' })
  host: UserEntity;

  @Column({ type: 'varchar', length: 128, nullable: true })
  name: string | null;

  @Index('idx_rooms_access_code')
  @Column({ type: 'varchar', length: 64, nullable: true })
  accessCode: string | null;

  @Column({ type: 'boolean', default: false })
  isPrivate: boolean;

  @Column({ type: 'boolean', default: false })
  isRanked: boolean;

  @Column({ type: 'bigint', default: 0 })
  entryFeeCoins: number;

  @Column({ type: 'int', default: 2 })
  maxPlayers: number;

  @Index('idx_rooms_status')
  @Column({ type: 'varchar', length: 16, default: 'waiting' })
  status: RoomStatus;

  @Column({ type: 'json', nullable: true })
  settings: Record<string, unknown> | null;

  @OneToMany(() => RoomPlayerEntity, (player) => player.room)
  players: RoomPlayerEntity[];

  @Column({ type: 'datetime', precision: 6, nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  endedAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
