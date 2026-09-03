import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EconomyService } from '../economy/economy.service';
import { QuestsService } from '../quests/quests.service';
import { ProfileEntity } from '../database/entities/profile.entity';
import { ShopItemEntity } from '../database/entities/shop-item.entity';
import { TransactionEntity } from '../database/entities/transaction.entity';
import { UserInventoryEntity } from '../database/entities/user-inventory.entity';
import { ItemType } from '../database/enums';
import {
  ChangeUsernameDto,
  InventoryItemDto,
  ShopItemDto,
  ShopQueryDto,
  TransactionDto,
} from './dto/shop.dto';

/** Maps an equippable item type to the profile slot that holds its inventory id. */
const EQUIP_SLOT: Partial<Record<ItemType, keyof ProfileEntity>> = {
  avatar_frame: 'equippedFrameId',
  banner: 'equippedBannerId',
  chat_bubble: 'equippedChatBubbleId',
  theme: 'equippedThemeId',
  id_color: 'equippedIdColorId',
};

const EQUIPPABLE_TYPES = new Set<ItemType>(Object.keys(EQUIP_SLOT) as ItemType[]);

@Injectable()
export class ShopService {
  constructor(
    @InjectRepository(ShopItemEntity)
    private readonly shopItems: Repository<ShopItemEntity>,
    @InjectRepository(UserInventoryEntity)
    private readonly inventory: Repository<UserInventoryEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactions: Repository<TransactionEntity>,
    private readonly economy: EconomyService,
    private readonly questsService: QuestsService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Catalogue ─────────────────────────────────────────────────────────────

  async listItems(userId: string, query: ShopQueryDto): Promise<{ items: ShopItemDto[] }> {
    const qb = this.shopItems
      .createQueryBuilder('item')
      .where('item.isAvailable = :avail', { avail: true });

    if (query.type) {
      qb.andWhere('item.type = :type', { type: query.type });
    }
    if (query.search) {
      qb.andWhere('(item.name LIKE :q OR item.description LIKE :q)', { q: `%${query.search}%` });
    }
    qb.orderBy('item.sortOrder', 'ASC').addOrderBy('item.name', 'ASC');

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    qb.skip((page - 1) * limit).take(limit);

    const items = await qb.getMany();
    const owned = await this.inventory.find({ where: { userId } });
    const ownedByItem = new Map(owned.map((o) => [o.itemId, o]));

    return {
      items: items.map((item) => {
        const inv = ownedByItem.get(item.id);
        return this.toItemDto(item, !!inv, inv?.isEquipped ?? false);
      }),
    };
  }

  // ── Purchase ──────────────────────────────────────────────────────────────

  async purchase(userId: string, itemId: string): Promise<{ inventory: InventoryItemDto }> {
    const result = await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(ShopItemEntity, { where: { id: itemId } });
      if (!item || !item.isAvailable) throw new NotFoundException('Item not found.');
      if (item.stock > 0 && item.stock <= 0) throw new ConflictException('This item is out of stock.');

      const buyerProfile = await this.lockProfile(manager, userId);
      const effectivePrice = this.effectivePrice(item);

      // Unique items may only be owned once.
      if (item.isUniqueOwned) {
        const existing = await manager.findOne(UserInventoryEntity, {
          where: { userId, itemId: item.id },
        });
        if (existing) throw new ConflictException('You already own this item.');
      }

      // Atomic spend (throws InsufficientFundsException and rolls back).
      await this.economy.debit(
        userId,
        item.currency,
        effectivePrice,
        {
          type: 'purchase',
          referenceType: 'shop_item',
          referenceId: item.id,
          description: `Purchased ${item.name}`,
        },
        manager,
      );

      const inventory = await this.grantItem({
        manager,
        userId,
        item,
        source: 'purchase',
        giftedById: null,
        profile: buyerProfile,
      });

      return { item, inventory };
    });

    return { inventory: this.toInventoryDto(result.inventory, result.item) };
  }

  // ── Gift ──────────────────────────────────────────────────────────────────

  async gift(
    senderId: string,
    itemId: string,
    recipientUsername: string,
    message?: string,
  ): Promise<{ gifted: true; recipient: string }> {
    await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(ShopItemEntity, { where: { id: itemId } });
      if (!item || !item.isAvailable) throw new NotFoundException('Item not found.');
      if (!item.giftable) throw new BadRequestException('This item cannot be gifted.');

      const recipientProfile = await manager.findOne(ProfileEntity, {
        where: { username: recipientUsername },
      });
      if (!recipientProfile) throw new NotFoundException('Recipient not found.');
      if (recipientProfile.userId === senderId) {
        throw new BadRequestException('You cannot gift an item to yourself.');
      }

      if (item.isUniqueOwned) {
        const alreadyOwns = await manager.findOne(UserInventoryEntity, {
          where: { userId: recipientProfile.userId, itemId: item.id },
        });
        if (alreadyOwns) throw new ConflictException('That player already owns this item.');
      }

      const effectivePrice = this.effectivePrice(item);
      // Charge the sender (atomic).
      await this.economy.debit(
        senderId,
        item.currency,
        effectivePrice,
        {
          type: 'gift_purchase',
          referenceType: 'shop_item',
          referenceId: item.id,
          description: `Gifted ${item.name} to @${recipientUsername}`,
        },
        manager,
      );

      // Grant to recipient.
      const recipient = await this.lockProfile(manager, recipientProfile.userId);
      recipient.giftsReceived = Number(recipient.giftsReceived) + 1;
      const sender = await this.lockProfile(manager, senderId);
      sender.giftsSent = Number(sender.giftsSent) + 1;
      await manager.save([recipient, sender]);

      await this.grantItem({
        manager,
        userId: recipientProfile.userId,
        item,
        source: 'gift',
        giftedById: senderId,
        profile: recipient,
      });

      // Record a visible ledger entry on the recipient side documenting the
      // inbound gift (no currency moves to them).
      const ledger = manager.create(TransactionEntity, {
        userId: recipientProfile.userId,
        type: 'gift',
        currency: item.currency,
        amount: 0,
        balanceAfter:
          item.currency === 'coins' ? Number(recipient.coins) : Number(recipient.pips),
        referenceType: 'shop_item',
        referenceId: item.id,
        description: `Received ${item.name} as a gift${message ? `: ${message}` : ''}`,
      });
      await manager.save(ledger);
    });

    // Progress the "send a gift" daily quest (runs in its own transaction).
    await this.questsService.recordEvent(senderId, 'send_gift', 1);

    return { gifted: true, recipient: recipientUsername };
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async getInventory(userId: string): Promise<{ items: InventoryItemDto[] }> {
    const rows = await this.inventory.find({
      where: { userId },
      relations: { item: true },
      order: { acquiredAt: 'DESC' },
    });
    return { items: rows.map((row) => this.toInventoryDto(row, row.item)) };
  }

  async equip(userId: string, inventoryId: string): Promise<{ equipped: true }> {
    await this.dataSource.transaction(async (manager) => {
      const owned = await manager.findOne(UserInventoryEntity, {
        where: { id: inventoryId, userId },
        relations: { item: true },
      });
      if (!owned) throw new NotFoundException('You do not own this item.');
      if (!owned.item) throw new NotFoundException('Item no longer exists.');

      const slot = EQUIP_SLOT[owned.item.type];
      if (!slot) {
        throw new BadRequestException('This item cannot be equipped.');
      }

      const profile = await this.lockProfile(manager, userId);

      // Unequip any other equipped item of the same category.
      const ownedItems = await manager.find(UserInventoryEntity, {
        where: { userId },
        relations: { item: true },
      });
      for (const row of ownedItems) {
        if (row.item && row.item.type === owned.item.type && row.isEquipped && row.id !== owned.id) {
          row.isEquipped = false;
          await manager.save(row);
        }
      }

      owned.isEquipped = true;
      await manager.save(owned);

      (profile[slot] as string | null) = owned.id;
      await manager.save(profile);
    });
    return { equipped: true };
  }

  async unequip(userId: string, inventoryId: string): Promise<{ unequipped: true }> {
    await this.dataSource.transaction(async (manager) => {
      const owned = await manager.findOne(UserInventoryEntity, {
        where: { id: inventoryId, userId },
        relations: { item: true },
      });
      if (!owned) throw new NotFoundException('You do not own this item.');

      if (!owned.isEquipped) return;
      owned.isEquipped = false;
      await manager.save(owned);

      const slot = owned.item ? EQUIP_SLOT[owned.item.type] : undefined;
      if (slot) {
        const profile = await this.lockProfile(manager, userId);
        (profile[slot] as string | null) = null;
        await manager.save(profile);
      }
    });
    return { unequipped: true };
  }

  // ── Username change (consumable service) ──────────────────────────────────

  async changeUsername(userId: string, dto: ChangeUsernameDto): Promise<{ username: string }> {
    const newUsername = dto.username;

    // Permission guard: the caller must own an unused username_change token.
    const token = await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(ShopItemEntity, {
        where: { type: 'username_change', isAvailable: true },
      });
      if (!item) throw new NotFoundException('Username change is not currently available.');

      const tokenRow = await manager.findOne(UserInventoryEntity, {
        where: { userId, itemId: item.id },
        order: { acquiredAt: 'ASC' },
      });
      if (!tokenRow || Number(tokenRow.quantity) < 1) {
        throw new ForbiddenException('You need a Username Change item from the shop.');
      }

      const taken = await manager.findOne(ProfileEntity, { where: { username: newUsername } });
      if (taken && taken.userId !== userId) {
        throw new ConflictException('That username is already taken.');
      }

      const profile = await this.lockProfile(manager, userId);
      profile.username = newUsername;
      await manager.save(profile);

      // Consume one token.
      const remaining = Number(tokenRow.quantity) - 1;
      if (tokenRow.isUniqueOwned || remaining <= 0) {
        await manager.delete(UserInventoryEntity, tokenRow.id);
      } else {
        tokenRow.quantity = remaining;
        await manager.save(tokenRow);
      }
      return tokenRow;
    });

    void token;
    return { username: newUsername };
  }

  // ── Transaction history ───────────────────────────────────────────────────

  async getTransactionHistory(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: TransactionDto[]; total: number; page: number; totalPages: number }> {
    const [rows, total] = await this.transactions.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const items: TransactionDto[] = rows.map((tx) => ({
      id: tx.id,
      type: tx.type,
      currency: tx.currency,
      amount: Number(tx.amount),
      balanceAfter: Number(tx.balanceAfter),
      referenceType: tx.referenceType,
      referenceId: tx.referenceId,
      description: tx.description,
      createdAt: tx.createdAt,
    }));

    return { items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private effectivePrice(item: ShopItemEntity): number {
    const base = Number(item.price);
    if (Number(item.discountPercent) <= 0) return base;
    return Math.max(0, Math.round(base * (1 - Number(item.discountPercent) / 100)));
  }

  private async grantItem(params: {
    manager: import('typeorm').EntityManager;
    userId: string;
    item: ShopItemEntity;
    source: 'purchase' | 'gift';
    giftedById: string | null;
    profile: ProfileEntity;
  }): Promise<UserInventoryEntity> {
    const { manager, userId, item, source, giftedById } = params;

    const existing = await manager.findOne(UserInventoryEntity, {
      where: { userId, itemId: item.id },
    });

    if (existing) {
      if (item.isUniqueOwned) {
        // Should have been rejected earlier; guard regardless.
        return existing;
      }
      existing.quantity = Number(existing.quantity) + 1;
      return manager.save(existing);
    }

    const row = manager.create(UserInventoryEntity, {
      userId,
      itemId: item.id,
      quantity: 1,
      isEquipped: false,
      isUniqueOwned: item.isUniqueOwned,
      source,
      giftedById,
      expiresAt: null,
    });
    return manager.save(row);
  }

  private async lockProfile(manager: import('typeorm').EntityManager, userId: string): Promise<ProfileEntity> {
    const isMysql = this.dataSource.options.type === 'mysql';
    let profile: ProfileEntity | null;
    if (isMysql) {
      profile = await manager
        .getRepository(ProfileEntity)
        .createQueryBuilder('profile')
        .setLock('pessimistic_write')
        .where('profile.userId = :userId', { userId })
        .getOne();
    } else {
      profile = await manager.findOne(ProfileEntity, { where: { userId } });
    }
    if (!profile) throw new NotFoundException('Profile not found.');
    return profile;
  }

  private toItemDto(item: ShopItemEntity, owned: boolean, equipped: boolean): ShopItemDto {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      type: item.type,
      rarity: item.rarity,
      imageUrl: item.imageUrl,
      price: Number(item.price),
      currency: item.currency,
      discountPercent: Number(item.discountPercent),
      effectivePrice: this.effectivePrice(item),
      isUniqueOwned: item.isUniqueOwned,
      giftable: item.giftable,
      metadata: item.metadata,
      owned,
      equipped,
    };
  }

  private toInventoryDto(row: UserInventoryEntity, item: ShopItemEntity): InventoryItemDto {
    return {
      id: row.id,
      itemId: row.itemId,
      name: item.name,
      type: item.type,
      rarity: item.rarity,
      imageUrl: item.imageUrl,
      quantity: Number(row.quantity),
      isEquipped: row.isEquipped,
      source: row.source,
      metadata: item.metadata,
      acquiredAt: row.acquiredAt,
    };
  }
}
