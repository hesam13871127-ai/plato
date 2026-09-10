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
 * `quantity`. The one-per-user rule for unique items is enforced by the shop
 * purchase transaction, which takes a `FOR UPDATE` lock on the buyer's
 * profile row so concurrent purchases of the same item serialize safely.
 */
@Entity('user_inventory')
@Index('idx_inventory_user', ['userId'])
@Index('idx_inventory_item', ['itemId'])
export class UserInventoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Index()
  @Column({ name: 'item_id', type: 'varchar', length: 36 })
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

  /** How the item was acquired. */
  @Column({ type: 'varchar', length: 16, default: 'purchase' })
  source: 'purchase' | 'gift';

  /** Set when `source = 'gift'` — the user who gifted this item. */
  @Index()
  @Column({ name: 'gifted_by_id', type: 'varchar', length: 36, nullable: true })
  giftedById: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'gifted_by_id' })
  giftedBy: UserEntity | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  acquiredAt: Date;
}
