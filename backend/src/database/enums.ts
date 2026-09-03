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

export type AuthProvider = 'phone' | 'google' | 'apple' | 'email';
export const AUTH_PROVIDERS: AuthProvider[] = ['phone', 'google', 'apple', 'email'];

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

export type ItemType = 'table_skin' | 'dice_set' | 'avatar_frame' | 'emote' | 'consumable' | 'bundle';
export const ITEM_TYPES: ItemType[] = ['table_skin', 'dice_set', 'avatar_frame', 'emote', 'consumable', 'bundle'];

export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';
export const ITEM_RARITIES: ItemRarity[] = ['common', 'rare', 'epic', 'legendary'];

export type Currency = 'coins' | 'gems';
export const CURRENCIES: Currency[] = ['coins', 'gems'];

export type TransactionType = 'purchase' | 'reward' | 'gift' | 'refund' | 'admin_adjustment' | 'match_payout';
export const TRANSACTION_TYPES: TransactionType[] = ['purchase', 'reward', 'gift', 'refund', 'admin_adjustment', 'match_payout'];

export type ChatType = 'direct' | 'group' | 'room' | 'system';
export const CHAT_TYPES: ChatType[] = ['direct', 'group', 'room', 'system'];

export type MessageType = 'text' | 'image' | 'system' | 'game_invite' | 'emote';
export const MESSAGE_TYPES: MessageType[] = ['text', 'image', 'system', 'game_invite', 'emote'];

export type ReportTargetType = 'user' | 'message' | 'room' | 'group';
export const REPORT_TARGET_TYPES: ReportTargetType[] = ['user', 'message', 'room', 'group'];

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export const REPORT_STATUSES: ReportStatus[] = ['open', 'reviewing', 'resolved', 'dismissed'];

export type BanType = 'chat' | 'login' | 'matchmaking' | 'permanent';
export const BAN_TYPES: BanType[] = ['chat', 'login', 'matchmaking', 'permanent'];

export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
export const BOT_DIFFICULTIES: BotDifficulty[] = ['easy', 'medium', 'hard', 'expert'];

export type OtpPurpose = 'login' | 'verify_phone' | 'reset';
export const OTP_PURPOSES: OtpPurpose[] = ['login', 'verify_phone', 'reset'];
