import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShopItemEntity } from '../database/entities/shop-item.entity';
import { SHOP_CATALOGUE } from './shop-catalogue';

/**
 * Ensures the shop catalogue exists in the database on startup. Idempotent:
 * items are matched by fixed id and left intact if already present. Mirrors
 * `database/seed.sql`.
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
      if (existing) continue;

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
    this.logger.log('Shop catalogue ensured.');
  }
}
