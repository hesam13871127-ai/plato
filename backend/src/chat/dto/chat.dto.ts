import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
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
import { ChatType, MESSAGE_TYPES, MessageType, REPORT_REASONS, ReportReason } from '../../database/enums';

export class CreateDirectChatDto {
  @ApiProperty({ format: 'uuid', description: 'The other participant (recipient) user id.' })
  @IsUUID()
  userId!: string;
}

export class CreateGroupChatDto {
  @ApiProperty({ example: 'Weekend Rollers' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  title!: string;

  @ApiPropertyOptional({ example: 'Our table club' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ type: [String], description: 'Initial member user ids (besides creator).' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds?: string[];

  @ApiPropertyOptional({ description: 'Optional Chat Pass code required to join.' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'pass may only contain letters, numbers, _ and -' })
  accessPass?: string;

  @ApiPropertyOptional({ description: 'Optional visual theme key for the chat.' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  themeKey?: string;
}

export class JoinChatDto {
  @ApiPropertyOptional({ description: 'Chat Pass code (required for pass-gated chats).' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  accessPass?: string;
}

export class AddMembersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds!: string[];
}

export class UpdateMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: ['admin', 'member'] })
  @IsIn(['admin', 'member'] as const)
  role!: 'admin' | 'member';
}

/**
 * Payload for sending a message over a REST path (`/chat/:chatId/messages` or
 * `/chat/messages/:id/reply`). The chatId is provided by the route/parent, so it
 * is not part of the validated body here.
 */
export class SendMessageDto {
  @ApiProperty({ example: 'Good luck at the table!' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional({ enum: MESSAGE_TYPES })
  @IsOptional()
  @IsIn(MESSAGE_TYPES)
  type?: MessageType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Message id being replied to.' })
  @IsOptional()
  @IsUUID()
  replyToId?: string;

  @ApiPropertyOptional({ description: 'Optional structured metadata (emote id, image url…).' })
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Temporary client id for optimistic delivery / ack.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientId?: string;
}

export class EditMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class ReactDto {
  @ApiProperty({ example: '👍' })
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  emoji!: string;
}

export class TypingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  chatId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isTyping?: boolean;
}

export class ReportMessageDto {
  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS)
  reason!: ReportReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ReportUserDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS)
  reason!: ReportReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ModerationActionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  chatId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ example: 'Off-topic spam' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Mute/ban duration in minutes (omit for indefinite where applicable).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60 * 24 * 365)
  durationMinutes?: number;
}

export class UpdateChatSettingsDto {
  @ApiPropertyOptional({ example: 'New group name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ description: 'Set/clear (null) the Chat Pass code.' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'pass may only contain letters, numbers, _ and -' })
  accessPass?: string | null;

  @ApiPropertyOptional({ description: 'Set/clear (null) the visual theme key.' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  themeKey?: string | null;
}

export class JoinRoomChatDto {
  @ApiProperty({ format: 'uuid', description: 'Room (table) id to attach the in-game chat to.' })
  @IsUUID()
  roomId!: string;
}

export class MessageQueryDto {
  @ApiPropertyOptional({ description: 'Return messages older than this cursor (message id).' })
  @IsOptional()
  @IsUUID()
  before?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class VoiceTokenDto {
  @ApiProperty({ format: 'uuid', description: 'Chat the voice channel is attached to.' })
  @IsUUID()
  chatId!: string;
}

export const CHAT_TYPES_FOR_QUERY: ChatType[] = ['direct', 'group', 'room', 'lounge', 'system'];
