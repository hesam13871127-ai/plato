import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Send a friend request by the addressee's username or user id. */
export class SendFriendRequestDto {
  @IsOptional()
  @IsString()
  @Length(3, 32)
  username?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class RespondFriendRequestDto {
  @IsUUID()
  requestId!: string;
}

export class RemoveFriendDto {
  @IsUUID()
  friendId!: string;
}

export class BlockUserDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @Length(3, 32)
  username?: string;
}

export class CreateGroupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string;
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string;
}

export class GroupMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  @Type(() => String)
  userIds!: string[];
}

export class GroupMemberRoleDto {
  @IsUUID()
  userId!: string;

  @IsString()
  role!: 'admin' | 'member';
}

export class InviteToRoomDto {
  @IsUUID()
  roomId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  @Type(() => String)
  userIds!: string[];
}

export class CreateInviteRoomDto {
  @IsString()
  @Length(2, 32)
  gameSlug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isRanked?: boolean;

  @IsOptional()
  @IsBoolean()
  fillWithBots?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  @Type(() => String)
  inviteUserIds?: string[];
}
