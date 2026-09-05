/**
 * Single registry of all TypeORM entities. Used by the TypeORM module, the
 * CLI data source and tests. Order follows foreign-key dependency direction.
 */
import { UserEntity } from './user.entity';
import { ProfileEntity } from './profile.entity';
import { RefreshTokenEntity } from './refresh-token.entity';
import { OtpCodeEntity } from './otp-code.entity';
import { BotEntity } from './bot.entity';
import { FriendshipEntity } from './friendship.entity';
import { GroupEntity } from './group.entity';
import { GroupMemberEntity } from './group-member.entity';
import { GameEntity } from './game.entity';
import { RoomEntity } from './room.entity';
import { RoomPlayerEntity } from './room-player.entity';
import { SeasonEntity } from './season.entity';
import { SeasonRewardClaimEntity } from './season-reward-claim.entity';
import { MatchEntity } from './match.entity';
import { MatchPlayerEntity } from './match-player.entity';
import { RankingEntity } from './ranking.entity';
import { ShopItemEntity } from './shop-item.entity';
import { UserInventoryEntity } from './user-inventory.entity';
import { TransactionEntity } from './transaction.entity';
import { ChatEntity } from './chat.entity';
import { ChatParticipantEntity } from './chat-participant.entity';
import { MessageEntity } from './message.entity';
import { MessageReadEntity } from './message-read.entity';
import { MessageReactionEntity } from './message-reaction.entity';
import { VoiceSessionEntity } from './voice-session.entity';
import { ReportEntity } from './report.entity';
import { BanEntity } from './ban.entity';
import { QuestEntity } from './quest.entity';
import { UserQuestEntity } from './user-quest.entity';
import { DailyRewardClaimEntity } from './daily-reward.entity';

export * from './user.entity';
export * from './profile.entity';
export * from './refresh-token.entity';
export * from './otp-code.entity';
export * from './bot.entity';
export * from './friendship.entity';
export * from './group.entity';
export * from './group-member.entity';
export * from './game.entity';
export * from './room.entity';
export * from './room-player.entity';
export * from './season.entity';
export * from './season-reward-claim.entity';
export * from './match.entity';
export * from './match-player.entity';
export * from './ranking.entity';
export * from './shop-item.entity';
export * from './user-inventory.entity';
export * from './transaction.entity';
export * from './chat.entity';
export * from './chat-participant.entity';
export * from './message.entity';
export * from './message-read.entity';
export * from './message-reaction.entity';
export * from './voice-session.entity';
export * from './report.entity';
export * from './ban.entity';
export * from './quest.entity';
export * from './user-quest.entity';
export * from './daily-reward.entity';

export const entities = [
  UserEntity,
  ProfileEntity,
  RefreshTokenEntity,
  OtpCodeEntity,
  BotEntity,
  FriendshipEntity,
  GroupEntity,
  GroupMemberEntity,
  GameEntity,
  RoomEntity,
  RoomPlayerEntity,
  SeasonEntity,
  SeasonRewardClaimEntity,
  MatchEntity,
  MatchPlayerEntity,
  RankingEntity,
  ShopItemEntity,
  UserInventoryEntity,
  TransactionEntity,
  ChatEntity,
  ChatParticipantEntity,
  MessageEntity,
  MessageReadEntity,
  MessageReactionEntity,
  VoiceSessionEntity,
  ReportEntity,
  BanEntity,
  QuestEntity,
  UserQuestEntity,
  DailyRewardClaimEntity,
];
