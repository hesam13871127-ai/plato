import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { REPORT_REASONS, REPORT_STATUSES, REPORT_TARGET_TYPES, BAN_TYPES } from '../../database/enums';

export class ReportContentDto {
  @ApiProperty({ enum: REPORT_TARGET_TYPES })
  @IsIn(REPORT_TARGET_TYPES)
  targetType!: string;

  @ApiProperty({ description: 'UUID of the reported user/message/room/group.' })
  @IsString()
  @MaxLength(36)
  targetId!: string;

  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ResolveReportDto {
  @ApiProperty({ enum: ['dismiss', 'warn', 'mute', 'ban', 'delete'] })
  @IsIn(['dismiss', 'warn', 'mute', 'ban', 'delete'])
  action!: 'dismiss' | 'warn' | 'mute' | 'ban' | 'delete';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: 'Ban/mute duration in minutes.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(525_600)
  durationMinutes?: number;
}

export class AdminBanDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: BAN_TYPES })
  @IsIn(BAN_TYPES)
  type!: string;

  @ApiPropertyOptional({ description: 'Omit for a permanent ban.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(525_600)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class LiftBanDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;
}

export class SetRoleDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: ['player', 'moderator', 'admin'] })
  @IsIn(['player', 'moderator', 'admin'])
  role!: 'player' | 'moderator' | 'admin';
}

export class DeleteMessageDto {
  @ApiProperty()
  @IsUUID()
  messageId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class ReportQueueQueryDto {
  @ApiPropertyOptional({ enum: REPORT_STATUSES })
  @IsOptional()
  @IsIn(REPORT_STATUSES)
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
