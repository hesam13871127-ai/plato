import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BAN_TYPES,
  CURRENCIES,
  GAME_STATUSES,
  ITEM_TYPES,
  ITEM_RARITIES,
  USER_ROLES,
} from '../../database/enums';

// ── Users ─────────────────────────────────────────────────────────────────

export class AdminUserListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended', 'banned'] })
  @IsOptional()
  @IsIn(['active', 'suspended', 'banned'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class AdminUpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended', 'banned'] })
  @IsOptional()
  @IsIn(['active', 'suspended', 'banned'])
  status?: string;

  @ApiPropertyOptional({ enum: USER_ROLES })
  @IsOptional()
  @IsIn(USER_ROLES)
  role?: string;
}

export class AdminBanUserDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: BAN_TYPES })
  @IsIn(BAN_TYPES)
  type!: string;

  @ApiPropertyOptional({ description: 'Omit for a permanent ban.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(525600)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class AdminLiftBanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}

export class AdminGrantCurrencyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES)
  currency!: string;

  @ApiProperty({ example: 500, description: 'Positive to grant, negative to deduct.' })
  @IsNumber()
  @Min(-10_000_000)
  @Max(10_000_000)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

// ── Shop ──────────────────────────────────────────────────────────────────

export class AdminUpsertShopItemDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Required to edit; omitted to create.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiProperty({ enum: ITEM_TYPES })
  @IsIn(ITEM_TYPES)
  type!: string;

  @ApiPropertyOptional({ enum: ITEM_RARITIES })
  @IsOptional()
  @IsIn(ITEM_RARITIES)
  rarity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  imageUrl?: string;

  @ApiProperty({ example: 800 })
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  price!: number;

  @ApiPropertyOptional({ enum: CURRENCIES })
  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  discountPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isUniqueOwned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  giftable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ example: 0, description: '0 = unlimited.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class AdminShopItemIdDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;
}

// ── Games ─────────────────────────────────────────────────────────────────

export class AdminUpsertGameDto {
  @ApiPropertyOptional({ description: 'Slug of an existing game to edit.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  slug?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  iconUrl?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  minPlayers?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxPlayers?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  avgDurationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  supportsBots?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  rankedEnabled?: boolean;

  @ApiPropertyOptional({ enum: GAME_STATUSES })
  @IsOptional()
  @IsIn(GAME_STATUSES)
  status?: string;
}

export class AdminGameStatusDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  slug!: string;

  @ApiProperty({ enum: GAME_STATUSES })
  @IsIn(GAME_STATUSES)
  status!: string;
}

// ── Seasons ───────────────────────────────────────────────────────────────

export class AdminSeasonActionDto {
  @ApiPropertyOptional({ enum: ['rollover'], description: 'Currently only rollover is supported.' })
  @IsOptional()
  @IsIn(['rollover'])
  action?: string;
}
