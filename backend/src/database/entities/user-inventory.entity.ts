import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ShopItemEntity } from './shop-item.entity';
import { UserEntity } from './user.entity';

/**
 * An item owned by a user. Unique items have one row; consumables accumulate
 * `quantity`. The one-per-user constraint for unique items is enforced at the
 * database level by a generated `unique_key` column in `schema.sql` (MySQL) and
 * by the purchase service transaction elsewhere.
 */
@Entity('user_inventory')
@Index('idx_inventory_user', ['userId'])
@Index('idx_inventory_item', ['itemId'])
export class UserInventoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  itemId: string;

  @ManyToOne(() => ShopItemEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item: ShopItemEntity;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'boolean', default: false })
  isEquipped: boolean;

  @Column({ type: 'boolean', default: true })
  isUniqueOwned: boolean;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  acquiredAt: Date;
}
