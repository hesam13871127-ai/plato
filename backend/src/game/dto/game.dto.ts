import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class EnqueueDto {
  @IsString()
  @Length(2, 32)
  gameSlug!: string;

  @IsOptional()
  @IsBoolean()
  isRanked?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(4)
  seats?: number;
}

export class CreateRoomDto {
  @IsString()
  @Length(2, 32)
  gameSlug!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @IsOptional()
  @IsBoolean()
  isRanked?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(4)
  maxPlayers?: number;

  @IsOptional()
  @IsBoolean()
  fillWithBots?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  settings?: Record<string, unknown>;
}

export class JoinRoomDto {
  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  @Length(4, 16)
  accessCode?: string;
}

export class ReadyDto {
  @IsBoolean()
  isReady!: boolean;
}
