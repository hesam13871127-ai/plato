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
  gems: number;

  @ApiProperty({ example: 'male' })
  gender: Gender;

  @ApiProperty({ example: 'online' })
  presence: string;

  @ApiProperty({ example: 0 })
  gamesPlayed: number;

  @ApiProperty({ example: 0 })
  gamesWon: number;

  @ApiProperty()
  createdAt: Date;
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
}
