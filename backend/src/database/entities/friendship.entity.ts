import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FriendshipStatus } from '../enums';
import { UserEntity } from './user.entity';

/**
 * Directed friendship edge:
 *  - `pending`  -> a friend request from `requesterId` to `addresseeId`
 *  - `accepted` -> a mutual friendship (a single row, the pair is unique)
 *  - `blocked`  -> `requesterId` has blocked `addresseeId`
 */
@Entity('friendships')
@Index('idx_friendship_pair', ['requesterId', 'addresseeId'], { unique: true })
// A self-friendship/block is meaningless; the service rejects it, this is
// the database-level backstop.
@Check('chk_friendships_not_self', 'requester_id <> addressee_id')
export class FriendshipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  requesterId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester: UserEntity;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  addresseeId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'addressee_id' })
  addressee: UserEntity;

  @Index('idx_friendships_status')
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: FriendshipStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  acceptedAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
