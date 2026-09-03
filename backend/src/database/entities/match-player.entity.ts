import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MatchResult } from '../enums';
import { MatchEntity } from './match.entity';
import { UserEntity } from './user.entity';

@Entity('match_players')
@Index('idx_match_player_pair', ['matchId', 'userId'], { unique: true })
export class MatchPlayerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  matchId: string;

  @ManyToOne(() => MatchEntity, (match) => match.players, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match: MatchEntity;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'int', default: 0 })
  seatNumber: number;

  @Column({ type: 'int', nullable: true })
  placement: number | null;

  @Column({ type: 'int', default: 0 })
  score: number;

  @Column({ type: 'varchar', length: 16, default: 'abandoned' })
  result: MatchResult;

  @Column({ type: 'int', default: 0 })
  ratingDelta: number;

  @Column({ type: 'bigint', default: 0 })
  coinsDelta: number;

  @Column({ type: 'boolean', default: false })
  isBot: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
