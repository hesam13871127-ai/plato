import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Currency, ItemRarity, ItemType } from '../enums';

/**
 * Catalogue of purchasable cosmetic / consumable items.
 */
@Entity('shop_items')
export class ShopItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  description: string | null;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  type: ItemType;

  @Column({ type: 'varchar', length: 16, default: 'common' })
  rarity: ItemRarity;

  @Column({ type: 'varchar', length: 512, nullable: true })
  imageUrl: string | null;

  /** Amount in the pricing currency's minor unit (whole coins/gems here). */
  @Column({ type: 'bigint', default: 0 })
  price: number;

  @Column({ type: 'varchar', length: 16, default: 'coins' })
  currency: Currency;

  @Column({ type: 'int', default: 0 })
  discountPercent: number;

  /** true => one purchase per account (cosmetics); false => consumables. */
  @Column({ type: 'boolean', default: true })
  isUniqueOwned: boolean;

  @Column({ type: 'boolean', default: true })
  isAvailable: boolean;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
