import {
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
import { MatchStatus } from '../enums';
import { GameEntity } from './game.entity';
import { SeasonEntity } from './season.entity';
import { RoomEntity } from './room.entity';
import { MatchPlayerEntity } from './match-player.entity';

/**
 * A finished or in-progress game instance with its outcome and replay state.
 */
@Entity('matches')
export class MatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  gameId: string;

  @ManyToOne(() => GameEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'game_id' })
  game: GameEntity;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  roomId: string | null;

  @ManyToOne(() => RoomEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'room_id' })
  room: RoomEntity | null;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  seasonId: string | null;

  @ManyToOne(() => SeasonEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'season_id' })
  season: SeasonEntity | null;

  @Column({ type: 'boolean', default: false })
  isRanked: boolean;

  @Column({ type: 'bigint', default: 0 })
  entryFeeCoins: number;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: MatchStatus;

  @Column({ type: 'json', nullable: true })
  results: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  replayData: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  finishedAt: Date | null;

  @OneToMany(() => MatchPlayerEntity, (player) => player.match, { cascade: true })
  players: MatchPlayerEntity[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
