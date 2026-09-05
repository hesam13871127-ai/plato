/**
 * Domain enums shared by entities, DTOs and services.
 *
 * Persisted as `varchar` columns (with CHECK constraints in the MySQL DDL)
 * instead of native ENUM types so the same entity metadata works on MySQL 8
 * in production and on SQLite in integration tests. Application-level
 * validation (class-validator / service guards) guarantees only values from
 * these unions are ever written.
 */

export type AccountStatus = 'active' | 'suspended' | 'banned' | 'deleted';
export const ACCOUNT_STATUSES: AccountStatus[] = ['active', 'suspended', 'banned', 'deleted'];

export type AuthProvider = 'phone' | 'email';
export const AUTH_PROVIDERS: AuthProvider[] = ['phone', 'email'];

export type Gender = 'male' | 'female' | 'other' | 'unspecified';
export const GENDERS: Gender[] = ['male', 'female', 'other', 'unspecified'];

export type UserPresence = 'offline' | 'online' | 'in_game' | 'away';
export const USER_PRESENCES: UserPresence[] = ['offline', 'online', 'in_game', 'away'];

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';
export const FRIENDSHIP_STATUSES: FriendshipStatus[] = ['pending', 'accepted', 'blocked'];

export type GroupMemberRole = 'owner' | 'admin' | 'member';
export const GROUP_MEMBER_ROLES: GroupMemberRole[] = ['owner', 'admin', 'member'];

export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'cancelled';
export const ROOM_STATUSES: RoomStatus[] = ['waiting', 'playing', 'finished', 'cancelled'];

export type RoomPlayerStatus = 'invited' | 'joined' | 'ready' | 'left' | 'kicked';
export const ROOM_PLAYER_STATUSES: RoomPlayerStatus[] = ['invited', 'joined', 'ready', 'left', 'kicked'];

export type GameStatus = 'active' | 'inactive' | 'maintenance' | 'coming_soon';
export const GAME_STATUSES: GameStatus[] = ['active', 'inactive', 'maintenance', 'coming_soon'];

export type MatchStatus = 'pending' | 'in_progress' | 'completed' | 'abandoned' | 'cancelled';
export const MATCH_STATUSES: MatchStatus[] = ['pending', 'in_progress', 'completed', 'abandoned', 'cancelled'];

export type MatchResult = 'win' | 'loss' | 'draw' | 'abandoned';
export const MATCH_RESULTS: MatchResult[] = ['win', 'loss', 'draw', 'abandoned'];

export type SeasonStatus = 'upcoming' | 'active' | 'completed';
export const SEASON_STATUSES: SeasonStatus[] = ['upcoming', 'active', 'completed'];

/**
 * Shop item categories. Cosmetics are owned once (unique) and equipped onto the
 * profile; `username_change` is a consumable service. Nothing in the shop
 * affects gameplay (strictly cosmetic).
 */
export type ItemType =
  | 'avatar_frame' // Frames
  | 'banner' // Banners
  | 'chat_bubble' // Chat Bubbles
  | 'theme' // Themes
  | 'game_skin' // Game Skins (table/felt skins)
  | 'id_color' // ID Color
  | 'username_change' // Username Change (consumable)
  | 'dice_set'
  | 'emote'
  | 'bundle'
  | 'consumable';
export const ITEM_TYPES: ItemType[] = [
  'avatar_frame',
  'banner',
  'chat_bubble',
  'theme',
  'game_skin',
  'id_color',
  'username_change',
  'dice_set',
  'emote',
  'bundle',
  'consumable',
];

export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';
export const ITEM_RARITIES: ItemRarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Coins (soft, earned) and Pips (premium). */
export type Currency = 'coins' | 'pips';
export const CURRENCIES: Currency[] = ['coins', 'pips'];

export type TransactionType =
  | 'purchase'
  | 'reward'
  | 'gift'
  | 'gift_purchase'
  | 'refund'
  | 'admin_adjustment'
  | 'match_payout'
  | 'daily_reward'
  | 'quest_reward'
  | 'season_reward';
export const TRANSACTION_TYPES: TransactionType[] = [
  'purchase',
  'reward',
  'gift',
  'gift_purchase',
  'refund',
  'admin_adjustment',
  'match_payout',
  'daily_reward',
  'quest_reward',
  'season_reward',
];

/** Daily quest goal categories (progress is counted by the backend). */
export type QuestGoalType =
  | 'login'
  | 'play_match'
  | 'win_match'
  | 'play_with_friends'
  | 'send_gift';
export const QUEST_GOAL_TYPES: QuestGoalType[] = [
  'login',
  'play_match',
  'win_match',
  'play_with_friends',
  'send_gift',
];

export type QuestStatus = 'in_progress' | 'claimable' | 'claimed' | 'expired';
export const QUEST_STATUSES: QuestStatus[] = ['in_progress', 'claimable', 'claimed', 'expired'];

export type ChatType = 'direct' | 'group' | 'room' | 'lounge' | 'system';
export const CHAT_TYPES: ChatType[] = ['direct', 'group', 'room', 'lounge', 'system'];

export type MessageType = 'text' | 'image' | 'system' | 'game_invite' | 'emote' | 'voice' | 'pinned';
export const MESSAGE_TYPES: MessageType[] = [
  'text',
  'image',
  'system',
  'game_invite',
  'emote',
  'voice',
  'pinned',
];

/** A user's role within a chat (owner/admin only apply to groups). */
export type ChatMemberRole = 'owner' | 'admin' | 'member';
export const CHAT_MEMBER_ROLES: ChatMemberRole[] = ['owner', 'admin', 'member'];

export type ReportTargetType = 'user' | 'message' | 'room' | 'group' | 'chat' | 'voice';
export const REPORT_TARGET_TYPES: ReportTargetType[] = [
  'user',
  'message',
  'room',
  'group',
  'chat',
  'voice',
];

/** Pre-set moderation reasons used by the report flow. */
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'sexual_content'
  | 'underage'
  | 'cheating'
  | 'impersonation'
  | 'other';
export const REPORT_REASONS: ReportReason[] = [
  'spam',
  'harassment',
  'hate_speech',
  'sexual_content',
  'underage',
  'cheating',
  'impersonation',
  'other',
];

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export const REPORT_STATUSES: ReportStatus[] = ['open', 'reviewing', 'resolved', 'dismissed'];

export type BanType = 'chat' | 'login' | 'matchmaking' | 'permanent';
export const BAN_TYPES: BanType[] = ['chat', 'login', 'matchmaking', 'permanent'];

/** Voice-channel participant states surfaced to clients over Socket.io. */
export type VoiceParticipantState = 'joined' | 'left' | 'speaking' | 'muted' | 'unmuted';
export const VOICE_PARTICIPANT_STATES: VoiceParticipantState[] = [
  'joined',
  'left',
  'speaking',
  'muted',
  'unmuted',
];

export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
export const BOT_DIFFICULTIES: BotDifficulty[] = ['easy', 'medium', 'hard', 'expert'];

export type OtpPurpose = 'login' | 'verify_phone' | 'reset';
export const OTP_PURPOSES: OtpPurpose[] = ['login', 'verify_phone', 'reset'];
