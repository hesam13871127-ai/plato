/// Backend REST endpoints (paths are appended to `{API_BASE_URL}/api`).
class ApiEndpoints {
  ApiEndpoints._();

  // Health
  static const String health = '/health';

  // Auth
  static const String phoneRequestOtp = '/auth/phone/request-otp';
  static const String phoneVerify = '/auth/phone/verify';
  static const String emailRegister = '/auth/email/register';
  static const String emailLogin = '/auth/email/login';
  static const String refresh = '/auth/refresh';
  static const String logout = '/auth/logout';

  // Users
  static const String me = '/users/me';
  static String byUsername(String username) => '/users/by-username/$username';

  // Shop
  static const String shopItems = '/shop/items';
  static const String shopPurchase = '/shop/purchase';
  static const String shopGift = '/shop/gift';
  static const String shopInventory = '/shop/inventory';
  static const String shopEquip = '/shop/inventory/equip';
  static String shopUnequip(String inventoryId) => '/shop/inventory/$inventoryId/unequip';
  static const String shopUsernameChange = '/shop/username/change';
  static const String shopTransactions = '/shop/transactions';

  // Quests + daily rewards
  static const String questsDaily = '/quests/daily';
  static const String questsDailyClaim = '/quests/daily/claim';
  static String questClaim(String userQuestId) => '/quests/$userQuestId/claim';

  // Chat
  static const String chatConversations = '/chat/conversations';
  static const String chatDirect = '/chat/direct';
  static const String chatGroup = '/chat/group';
  static const String chatRoom = '/chat/room';
  static const String chatLounge = '/chat/lounge';
  static String chatJoin(String chatId) => '/chat/$chatId/join';
  static String chatLeave(String chatId) => '/chat/$chatId/leave';
  static String chatMessages(String chatId) => '/chat/$chatId/messages';
  static String chatPinned(String chatId) => '/chat/$chatId/pinned';
  static String chatMembers(String chatId) => '/chat/$chatId/members';
  static String chatRead(String chatId) => '/chat/$chatId/read';
  static String chatSettings(String chatId) => '/chat/$chatId/settings';
  static String chatAddMembers(String chatId) => '/chat/$chatId/members';
  static String chatMemberRole(String chatId) => '/chat/$chatId/members/role';
  static String chatReact(String messageId) => '/chat/messages/$messageId/react';
  static String chatReply(String messageId) => '/chat/messages/$messageId/reply';
  static String chatReportMessage(String messageId) => '/chat/report/message/$messageId';
  static const String chatReportUser = '/chat/report/user';
  static const String chatMute = '/chat/moderation/mute';
  static const String chatUnmute = '/chat/moderation/unmute';
  static const String chatBan = '/chat/moderation/ban';
  static const String chatKick = '/chat/moderation/kick';
  static const String chatVoiceToken = '/chat/voice/token';
  static String chatVoiceParticipants(String chatId) => '/chat/$chatId/voice/participants';

  // Moderation & reporting (Phase 9)
  static const String moderationReport = '/moderation/reports';
  static const String moderationQueue = '/moderation/reports';
  static String moderationResolve(String reportId) => '/moderation/reports/$reportId/resolve';
  static const String moderationFlags = '/moderation/flags';
  static const String moderationBans = '/moderation/bans';
  static const String moderationLiftBan = '/moderation/bans/lift';
  static const String moderationDeleteMessage = '/moderation/messages/delete';
  static const String moderationAudit = '/moderation/audit';
  static const String moderationErrors = '/moderation/errors';
  static const String moderationSetRole = '/moderation/roles';

  // Games / matchmaking / rooms
  static const String gamesCatalog = '/games';
  static const String gamesOpenRooms = '/games/rooms';
  static const String gamesEnqueue = '/games/matchmaking/enqueue';
  static const String gamesCancelMatch = '/games/matchmaking/cancel';
  static const String gamesCreateRoom = '/games/rooms';
  static const String gamesJoinRoom = '/games/rooms/join';
  static String gamesRoom(String roomId) => '/games/rooms/$roomId';
  static String gamesRoomReady(String roomId) => '/games/rooms/$roomId/ready';
  static String gamesRoomStart(String roomId) => '/games/rooms/$roomId/start';
  static String gamesSession(String sessionId) => '/games/sessions/$sessionId';

  // Competitive: ranked ladder, seasons & leaderboards
  static const String competitiveSeason = '/competitive/season';
  static const String competitiveMe = '/competitive/me';
  static const String competitiveLeaderboard = '/competitive/leaderboard';

  // Social: friends, groups/clubs, game invites
  static const String socialFriends = '/social/friends';
  static const String socialFriendsOnline = '/social/friends/online';
  static const String socialFriendRequests = '/social/friends/requests';
  static const String socialFriendsBlocked = '/social/friends/blocked';
  static const String socialFriendRelationships = '/social/friends/relationships';
  static const String socialFriendRemove = '/social/friends/remove';
  static const String socialFriendBlock = '/social/friends/block';
  static String socialFriendUnblock(String userId) => '/social/friends/unblock/$userId';
  static String socialFriendAccept(String id) => '/social/friends/requests/$id/accept';
  static String socialFriendReject(String id) => '/social/friends/requests/$id/reject';
  static String socialFriendCancel(String id) => '/social/friends/requests/$id';
  static const String socialGroups = '/social/groups';
  static String socialGroup(String id) => '/social/groups/$id';
  static String socialGroupMembers(String id) => '/social/groups/$id/members';
  static String socialGroupMember(String id, String userId) => '/social/groups/$id/members/$userId';
  static String socialGroupLeave(String id) => '/social/groups/$id/leave';
  static String socialGroupRoles(String id) => '/social/groups/$id/roles';
  static String socialGroupTransfer(String id, String userId) =>
      '/social/groups/$id/transfer/$userId';
  static const String socialInviteRoom = '/social/invites/room';
  static const String socialInviteRoomCreate = '/social/invites/room/create';
}
