import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class LeaderboardQueryDto {
  @ApiPropertyOptional({ description: 'Game slug for a per-game board; omit for the global board.' })
  @IsOptional()
  @IsString()
  game?: string;

  @ApiPropertyOptional({ enum: ['global', 'friends'], default: 'global' })
  @IsOptional()
  @IsIn(['global', 'friends'])
  scope?: 'global' | 'friends';

  @ApiPropertyOptional({ description: 'Max entries to return (1-100).', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
