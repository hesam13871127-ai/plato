import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { GENDERS, type Gender } from '../../database/enums';

export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ nullable: true, example: '+14155551234' })
  phone: string | null;

  @ApiProperty({ nullable: true, example: 'player@example.com' })
  email: string | null;

  @ApiProperty({ example: 'phone' })
  primaryProvider: string;

  @ApiProperty({ example: true })
  isVerified: boolean;

  @ApiProperty({ example: 'NeonRider' })
  username: string;

  @ApiProperty({ example: 'Neon Rider' })
  displayName: string;

  @ApiProperty({ nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ nullable: true, example: 'US' })
  country: string | null;

  @ApiProperty({ nullable: true })
  bio: string | null;

  @ApiProperty({ example: 1 })
  level: number;

  @ApiProperty({ example: 0 })
  xp: number;

  @ApiProperty({ example: 500 })
  coins: number;

  @ApiProperty({ example: 10 })
  pips: number;

  @ApiProperty({ example: 'male' })
  gender: Gender;

  @ApiProperty({ example: 'online' })
  presence: string;

  @ApiProperty({ example: 0 })
  gamesPlayed: number;

  @ApiProperty({ example: 0 })
  gamesWon: number;

  @ApiProperty({ example: 0 })
  gamesLost: number;

  @ApiProperty({ example: 0 })
  gamesDrawn: number;

  @ApiProperty({ example: 0, description: 'Current daily-login streak.' })
  streakDays: number;

  @ApiProperty({ example: 0 })
  giftsSent: number;

  @ApiProperty({ example: 0 })
  giftsReceived: number;

  @ApiProperty({ nullable: true, example: 'Lucky Roller' })
  title: string | null;

  @ApiProperty({ type: [String], example: ['Lucky Roller', 'Champion'] })
  unlockedTitles: string[];

  @ApiProperty({ type: [Object], description: 'Earned badges.' })
  badges: Array<Record<string, unknown>>;

  @ApiProperty({ nullable: true, description: 'Equipped frame item details.' })
  frame: EquippedCosmeticDto | null;

  @ApiProperty({ nullable: true, description: 'Equipped banner item details.' })
  banner: EquippedCosmeticDto | null;

  @ApiProperty({ nullable: true, description: 'Equipped chat bubble item details.' })
  chatBubble: EquippedCosmeticDto | null;

  @ApiProperty({ nullable: true, description: 'Equipped theme item details.' })
  theme: EquippedCosmeticDto | null;

  @ApiProperty({ nullable: true, description: 'Equipped ID color item details.' })
  idColor: EquippedCosmeticDto | null;

  @ApiProperty()
  createdAt: Date;
}

export class EquippedCosmeticDto {
  @ApiProperty({ format: 'uuid' })
  inventoryId: string;

  @ApiProperty({ format: 'uuid' })
  itemId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: 'avatar_frame' })
  type: string;

  @ApiProperty({ nullable: true, type: Object })
  metadata: Record<string, unknown> | null;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 32 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  avatarUrl?: string;

  @ApiPropertyOptional({ maxLength: 2, example: 'US' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  bio?: string;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS)
  gender?: Gender;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Lucky Roller',
    description: 'Set the active title, or null to clear it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  title?: string | null;
}
