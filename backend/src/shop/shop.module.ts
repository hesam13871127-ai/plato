import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EconomyModule } from '../economy/economy.module';
import { QuestsModule } from '../quests/quests.module';
import { ProfileEntity } from '../database/entities/profile.entity';
import { ShopItemEntity } from '../database/entities/shop-item.entity';
import { TransactionEntity } from '../database/entities/transaction.entity';
import { UserInventoryEntity } from '../database/entities/user-inventory.entity';
import { ShopCatalogueSeeder } from './shop-catalogue-seeder';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShopItemEntity,
      UserInventoryEntity,
      ProfileEntity,
      TransactionEntity,
    ]),
    EconomyModule,
    QuestsModule,
  ],
  controllers: [ShopController],
  providers: [ShopService, ShopCatalogueSeeder],
  exports: [ShopService, TypeOrmModule],
})
export class ShopModule {}
