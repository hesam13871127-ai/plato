import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ShopItemEntity } from '../database/entities/shop-item.entity';
import { SHOP_CATALOGUE } from './shop-catalogue';

/**
 * Catalogue ids that were replaced by newer items. They are hidden (not
 * deleted — owners keep their inventory rows) so the shop never shows two
 * versions of the same cosmetic.
 */
const RETIRED_ITEM_IDS = [
  '44444444-0000-4000-9102-000000000003', // Neon Ludo Tokens → universal Neon Pieces
  '44444444-0000-4000-9105-000000000006', // Hologram Connect-4 Discs → universal sets
];

/**
 * Ensures the shop catalogue exists in the database on startup. Idempotent:
 * items are matched by fixed id; presentation fields (name, description,
 * metadata, sort order, rarity) are refreshed so catalogue edits ship without
 * a migration, while price/availability of existing rows are left to admins.
 * Mirrors `database/seed.sql`.
 */
@Injectable()
export class ShopCatalogueSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(ShopCatalogueSeeder.name);

  constructor(
    @InjectRepository(ShopItemEntity)
    private readonly shopItems: Repository<ShopItemEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const item of SHOP_CATALOGUE) {
      const existing = await this.shopItems.findOne({ where: { id: item.id } });
      if (existing) {
        existing.name = item.name;
        existing.description = item.description;
        existing.type = item.type;
        existing.rarity = item.rarity;
        existing.sortOrder = item.sortOrder;
        existing.metadata = item.metadata;
        existing.giftable = item.giftable;
        await this.shopItems.save(existing);
        continue;
      }

      await this.shopItems.save(
        this.shopItems.create({
          id: item.id,
          name: item.name,
          description: item.description,
          type: item.type,
          rarity: item.rarity,
          price: item.price,
          currency: item.currency,
          discountPercent: item.discountPercent,
          isUniqueOwned: item.isUniqueOwned,
          giftable: item.giftable,
          isAvailable: true,
          stock: 0,
          sortOrder: item.sortOrder,
          metadata: item.metadata,
        }),
      );
    }

    if (RETIRED_ITEM_IDS.length > 0) {
      const retired = await this.shopItems.find({ where: { id: In(RETIRED_ITEM_IDS) } });
      for (const row of retired) {
        if (!row.isAvailable) continue;
        row.isAvailable = false;
        await this.shopItems.save(row);
      }
    }
    this.logger.log('Shop catalogue ensured.');
  }
}
