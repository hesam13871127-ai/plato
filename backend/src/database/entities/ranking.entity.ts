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
import { GameEntity } from './game.entity';
import { SeasonEntity } from './season.entity';
import { UserEntity } from './user.entity';

/**
 * Per-user rating snapshot for a game within a season. The (season, game,
 * user) triple is unique; leaderboard queries use the composite index.
 */
@Entity('rankings')
@Index('idx_ranking_unique', ['seasonId', 'gameId', 'userId'], { unique: true })
@Index('idx_ranking_leaderboard', ['seasonId', 'gameId', 'rating'])
export class RankingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  seasonId: string;

  @ManyToOne(() => SeasonEntity, (season) => season.rankings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'season_id' })
  season: SeasonEntity;

  @Column({ type: 'varchar', length: 36 })
  gameId: string;

  @ManyToOne(() => GameEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game: GameEntity;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'int', default: 1000 })
  rating: number;

  @Column({ type: 'int', default: 0 })
  peakRating: number;

  @Column({ type: 'int', default: 0 })
  wins: number;

  @Column({ type: 'int', default: 0 })
  losses: number;

  @Column({ type: 'int', default: 0 })
  draws: number;

  @Column({ type: 'int', default: 0 })
  matchesPlayed: number;

  @Column({ type: 'int', nullable: true })
  rankPosition: number | null;

  /** Snapshot of the tier reached by the end of the season (null while active). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  finalTier: string | null;

  /** True once season-end rewards for this (season, game) row have been paid. */
  @Column({ type: 'boolean', default: false })
  rewardsGranted: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
