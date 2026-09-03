import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SeasonStatus } from '../enums';
import { RankingEntity } from './ranking.entity';

/**
 * A competitive season. Rankings are scoped per (season, game).
 */
@Entity('seasons')
export class SeasonEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'int' })
  seasonNumber: number;

  @Column({ type: 'datetime', precision: 6 })
  startsAt: Date;

  @Column({ type: 'datetime', precision: 6 })
  endsAt: Date;

  @Column({ type: 'varchar', length: 16, default: 'upcoming' })
  status: SeasonStatus;

  @Column({ type: 'json', nullable: true })
  rewards: Record<string, unknown> | null;

  @OneToMany(() => RankingEntity, (ranking) => ranking.season)
  rankings: RankingEntity[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
