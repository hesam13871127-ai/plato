import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AccountStatus,
  AuthProvider,
  Gender,
  UserPresence,
  UserRole,
} from '../enums';
import { ProfileEntity } from './profile.entity';
import { BotEntity } from './bot.entity';

/**
 * Authentication identity of an account. A row is created the first time a
 * person signs in with any provider; providers then link onto the same row.
 */
@Entity('users')
// Real accounts always carry a phone or an email; bots are synthetic and
// intentionally have neither (bot pool seeder).
@Check('chk_users_phone_or_identity', 'phone IS NOT NULL OR email IS NOT NULL OR is_bot = 1')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  phoneNormalized: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 64, default: 'phone' })
  primaryProvider: AuthProvider;

  @Index('idx_users_status')
  @Column({ type: 'varchar', length: 64, default: 'active' })
  status: AccountStatus;

  /** Platform role for moderation access. Defaults to a regular player. */
  @Column({ type: 'varchar', length: 16, default: 'player' })
  role: UserRole;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Index('idx_users_is_bot')
  @Column({ type: 'boolean', default: false })
  isBot: boolean;

  @Column({ type: 'varchar', length: 16, default: 'unspecified' })
  gender: Gender;

  @Column({ type: 'varchar', length: 32, nullable: true })
  locale: string | null;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Index('idx_users_presence')
  @Column({ type: 'varchar', length: 32, default: 'offline' })
  presence: UserPresence;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  deletedAt: Date | null;

  @OneToOne(() => ProfileEntity, (profile) => profile.user, { cascade: true })
  profile: ProfileEntity;

  @OneToOne(() => BotEntity, (bot) => bot.user, { cascade: true })
  bot: BotEntity | null;
}
