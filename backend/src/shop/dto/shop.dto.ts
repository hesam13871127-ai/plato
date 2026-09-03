import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CURRENCIES, Currency, ITEM_TYPES, ItemType } from '../../database/enums';

export class ShopItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ enum: ITEM_TYPES })
  type: ItemType;

  @ApiProperty({ example: 'rare' })
  rarity: string;

  @ApiProperty({ nullable: true })
  imageUrl: string | null;

  @ApiProperty({ example: 800 })
  price: number;

  @ApiProperty({ enum: CURRENCIES })
  currency: Currency;

  @ApiProperty({ example: 10 })
  discountPercent: number;

  /** Price after applying the discount, in whole units. */
  @ApiProperty({ example: 720 })
  effectivePrice: number;

  @ApiProperty({ example: true })
  isUniqueOwned: boolean;

  @ApiProperty({ example: true })
  giftable: boolean;

  @ApiProperty({ nullable: true, type: Object })
  metadata: Record<string, unknown> | null;

  @ApiProperty({
    nullable: true,
    description: 'Populated when the requesting user already owns the item.',
  })
  owned: boolean | null;

  @ApiProperty({
    nullable: true,
    description: 'Whether the requesting user has this item equipped.',
  })
  equipped: boolean | null;
}

export class PurchaseItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;
}

export class GiftItemDto {
  @ApiProperty({ format: 'uuid', description: 'The item to gift (from the shop).' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ description: "Recipient's username." })
  @IsString()
  recipientUsername!: string;

  @ApiPropertyOptional({ description: 'Optional note attached to the gift.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}

export class EquipItemDto {
  @ApiProperty({ format: 'uuid', description: 'The inventory row id to equip.' })
  @IsUUID()
  inventoryId!: string;
}

export class ChangeUsernameDto {
  @ApiProperty({ example: 'NeonRider2', minLength: 3, maxLength: 32 })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_]+$/, {
    message: 'username may only contain letters, numbers and underscores',
  })
  username!: string;
}

export class ShopQueryDto {
  @ApiPropertyOptional({ enum: ITEM_TYPES })
  @IsOptional()
  @IsIn(ITEM_TYPES)
  type?: ItemType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class InventoryItemDto {
  @ApiProperty({ format: 'uuid', description: 'Inventory record id (used for equipping).' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  itemId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ITEM_TYPES })
  type: ItemType;

  @ApiProperty()
  rarity: string;

  @ApiProperty({ nullable: true })
  imageUrl: string | null;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  isEquipped: boolean;

  @ApiProperty({ example: 'purchase' })
  source: string;

  @ApiProperty({ nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiProperty()
  acquiredAt: Date;
}

export class TransactionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  type: string;

  @ApiProperty({ enum: CURRENCIES })
  currency: Currency;

  @ApiProperty({ description: 'Signed amount (positive credit, negative debit).' })
  amount: number;

  @ApiProperty()
  balanceAfter: number;

  @ApiProperty({ nullable: true })
  referenceType: string | null;

  @ApiProperty({ nullable: true })
  referenceId: string | null;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty()
  createdAt: Date;
}
