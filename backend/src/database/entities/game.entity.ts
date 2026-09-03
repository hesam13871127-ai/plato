import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GameStatus } from '../enums';

/**
 * Catalogue entry for a playable table game (backgammon, dominoes, Ludo…).
 */
@Entity('games')
export class GameEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  slug: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  iconUrl: string | null;

  @Column({ type: 'int', default: 2 })
  minPlayers: number;

  @Column({ type: 'int', default: 2 })
  maxPlayers: number;

  @Column({ type: 'int', default: 15 })
  avgDurationMinutes: number;

  @Column({ type: 'boolean', default: true })
  supportsBots: boolean;

  @Column({ type: 'boolean', default: true })
  rankedEnabled: boolean;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: GameStatus;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
