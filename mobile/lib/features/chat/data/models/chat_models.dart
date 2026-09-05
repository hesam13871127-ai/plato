import '../../domain/entities/chat_entities.dart';

// ── helpers ─────────────────────────────────────────────────────────────────

DateTime? _parseDate(dynamic value) {
  if (value is String && value.isNotEmpty) return DateTime.tryParse(value)?.toLocal();
  return null;
}

Map<String, dynamic> _asMap(dynamic value) =>
    value is Map<String, dynamic> ? value : const {};

List<dynamic> _asList(dynamic value) => value is List ? value : const [];

// ── Author ──────────────────────────────────────────────────────────────────

class ChatAuthorModel extends ChatAuthor {
  const ChatAuthorModel({
    required super.id,
    required super.displayName,
    super.username,
    super.avatarUrl,
    super.level,
    super.online,
    super.lastSeenAt,
  });

  factory ChatAuthorModel.fromJson(Map<String, dynamic> json) {
    return ChatAuthorModel(
      id: json['id'] as String? ?? '',
      displayName: json['displayName'] as String? ?? 'Player',
      username: json['username'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      level: json['level'] is num ? (json['level'] as num).toInt() : null,
      online: json['online'] as bool? ?? false,
      lastSeenAt: _parseDate(json['lastSeenAt']),
    );
  }
}

// ── Reactions ───────────────────────────────────────────────────────────────

class ReactionGroupModel extends ReactionGroup {
  const ReactionGroupModel({
    required super.emoji,
    required super.count,
    required super.userIds,
  });

  factory ReactionGroupModel.fromJson(Map<String, dynamic> json) {
    return ReactionGroupModel(
      emoji: json['emoji'] as String? ?? '👍',
      count: (json['count'] as num?)?.toInt() ?? 0,
      userIds: _asList(json['userIds']).whereType<String>().toList(),
    );
  }
}

// ── Reply preview ───────────────────────────────────────────────────────────

class ReplyPreviewModel extends ReplyPreview {
  const ReplyPreviewModel({
    required super.id,
    required super.body,
    required super.senderName,
  });

  factory ReplyPreviewModel.fromJson(Map<String, dynamic> json) {
    return ReplyPreviewModel(
      id: json['id'] as String? ?? '',
      body: json['body'] as String? ?? '',
      senderName: json['senderName'] as String? ?? '',
    );
  }
}

// ── Message ─────────────────────────────────────────────────────────────────

class ChatMessageModel extends ChatMessage {
  const ChatMessageModel({
    required super.id,
    required super.chatId,
    required super.senderId,
    required super.type,
    required super.body,
    required super.createdAt,
    super.metadata,
    super.replyToId,
    super.replyPreview,
    super.isPinned,
    super.reactions,
    super.editedAt,
    super.deletedAt,
    super.author,
    super.clientId,
  });

  factory ChatMessageModel.fromJson(Map<String, dynamic> json) {
    final authorJson = json['author'];
    final replyJson = json['replyPreview'];
    return ChatMessageModel(
      id: json['id'] as String? ?? '',
      chatId: json['chatId'] as String? ?? '',
      senderId: json['senderId'] as String? ?? '',
      type: json['type'] as String? ?? 'text',
      body: json['body'] as String? ?? '',
      createdAt: _parseDate(json['createdAt']) ?? DateTime.fromMillisecondsSinceEpoch(0),
      metadata: (json['metadata'] as Map<String, dynamic>?) ?? const {},
      replyToId: json['replyToId'] as String?,
      replyPreview: replyJson is Map<String, dynamic>
          ? ReplyPreviewModel.fromJson(replyJson)
          : null,
      isPinned: json['isPinned'] as bool? ?? false,
      reactions: _asList(json['reactions'])
          .whereType<Map<String, dynamic>>()
          .map(ReactionGroupModel.fromJson)
          .toList(),
      editedAt: _parseDate(json['editedAt']),
      deletedAt: _parseDate(json['deletedAt']),
      author: authorJson is Map<String, dynamic>
          ? ChatAuthorModel.fromJson(authorJson)
          : null,
      clientId: json['clientId'] as String?,
    );
  }
}

// ── Conversation ────────────────────────────────────────────────────────────

class ChatConversationModel extends ChatConversation {
  const ChatConversationModel({
    required super.id,
    required super.type,
    required super.title,
    super.avatarUrl,
    super.themeKey,
    super.isPublic,
    super.isMuted,
    super.role,
    super.unread,
    super.memberCount,
    super.lastMessageAt,
    super.lastMessageBody,
    super.lastMessageSenderId,
    super.other,
  });

  factory ChatConversationModel.fromJson(Map<String, dynamic> json) {
    final otherJson = json['other'];
    final lastMessage = _asMap(json['lastMessage']);
    return ChatConversationModel(
      id: json['id'] as String? ?? '',
      type: ChatType.fromString(json['type'] as String? ?? 'direct'),
      title: json['title'] as String? ?? 'Chat',
      avatarUrl: json['avatarUrl'] as String?,
      themeKey: json['themeKey'] as String?,
      isPublic: json['isPublic'] as bool? ?? false,
      isMuted: json['isMuted'] as bool? ?? false,
      role: ChatRole.fromString(json['role'] as String? ?? 'member'),
      unread: (json['unread'] as num?)?.toInt() ?? 0,
      memberCount: (json['memberCount'] as num?)?.toInt() ?? 0,
      lastMessageAt: _parseDate(json['lastMessageAt']),
      lastMessageBody: lastMessage['body'] as String?,
      lastMessageSenderId: lastMessage['senderId'] as String?,
      other: otherJson is Map<String, dynamic>
          ? ChatAuthorModel.fromJson(otherJson)
          : null,
    );
  }
}

// ── Member ──────────────────────────────────────────────────────────────────

class ChatMemberModel extends ChatMember {
  const ChatMemberModel({
    required super.userId,
    required super.displayName,
    super.avatarUrl,
    super.username,
    super.role,
    super.isMuted,
    super.online,
    super.lastSeenAt,
  });

  factory ChatMemberModel.fromJson(Map<String, dynamic> json) {
    return ChatMemberModel(
      userId: json['userId'] as String? ?? json['id'] as String? ?? '',
      displayName: json['displayName'] as String? ?? 'Player',
      avatarUrl: json['avatarUrl'] as String?,
      username: json['username'] as String?,
      role: ChatRole.fromString(json['role'] as String? ?? 'member'),
      isMuted: json['isMuted'] as bool? ?? false,
      online: json['online'] as bool? ?? false,
      lastSeenAt: _parseDate(json['lastSeenAt']),
    );
  }
}

// ── Voice participant ───────────────────────────────────────────────────────

class VoiceParticipantModel extends VoiceParticipant {
  const VoiceParticipantModel({
    required super.userId,
    required super.displayName,
    super.avatarUrl,
    super.isMuted,
    super.isSpeaking,
    super.isBroadcasting,
    super.joinedAt,
  });

  factory VoiceParticipantModel.fromJson(Map<String, dynamic> json) {
    return VoiceParticipantModel(
      userId: json['userId'] as String? ?? '',
      displayName: json['displayName'] as String? ?? 'Player',
      avatarUrl: json['avatarUrl'] as String?,
      isMuted: json['isMuted'] as bool? ?? false,
      isSpeaking: json['isSpeaking'] as bool? ?? false,
      isBroadcasting: json['isBroadcasting'] as bool? ?? false,
      joinedAt: _parseDate(json['joinedAt']),
    );
  }
}

// ── Voice token ─────────────────────────────────────────────────────────────

class VoiceTokenModel extends VoiceToken {
  const VoiceTokenModel({
    required super.provider,
    required super.token,
    required super.roomName,
    super.url,
  });

  factory VoiceTokenModel.fromJson(Map<String, dynamic> json) {
    return VoiceTokenModel(
      provider: json['provider'] as String? ?? 'livekit',
      token: json['token'] as String? ?? '',
      roomName: json['roomName'] as String? ?? '',
      url: json['url'] as String?,
    );
  }
}
