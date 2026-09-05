import 'package:equatable/equatable.dart';

/// The kind of conversation. Matches the backend `chat_type` enum.
enum ChatType { direct, group, room, lounge;

  static ChatType fromString(String value) =>
      ChatType.values.firstWhere((t) => t.name == value, orElse: () => ChatType.direct);
}

/// A participant's role within a group/room chat.
enum ChatRole { owner, admin, member;

  static ChatRole fromString(String value) =>
      ChatRole.values.firstWhere((r) => r.name == value, orElse: () => ChatRole.member);

  bool get canModerate => this == ChatRole.owner || this == ChatRole.admin;
}

/// Live presence for a user.
enum Presence { online, offline, away, busy;

  static Presence fromString(String value) =>
      Presence.values.firstWhere((p) => p.name == value, orElse: () => Presence.offline);
}

/// Minimal user/author summary embedded in chat & message payloads.
class ChatAuthor extends Equatable {
  const ChatAuthor({
    required this.id,
    required this.displayName,
    this.username,
    this.avatarUrl,
    this.level,
    this.online = false,
    this.lastSeenAt,
  });

  final String id;
  final String displayName;
  final String? username;
  final String? avatarUrl;
  final int? level;
  final bool online;
  final DateTime? lastSeenAt;

  @override
  List<Object?> get props =>
      [id, displayName, username, avatarUrl, level, online, lastSeenAt];
}

/// A grouped emoji reaction on a message.
class ReactionGroup extends Equatable {
  const ReactionGroup({required this.emoji, required this.count, required this.userIds});

  final String emoji;
  final int count;
  final List<String> userIds;

  bool reactedBy(String userId) => userIds.contains(userId);

  @override
  List<Object?> get props => [emoji, count, userIds];
}

/// A quoted message preview for replies.
class ReplyPreview extends Equatable {
  const ReplyPreview({
    required this.id,
    required this.body,
    required this.senderName,
  });

  final String id;
  final String body;
  final String senderName;

  @override
  List<Object?> get props => [id, body, senderName];
}

/// A single chat message.
class ChatMessage extends Equatable {
  const ChatMessage({
    required this.id,
    required this.chatId,
    required this.senderId,
    required this.type,
    required this.body,
    required this.createdAt,
    this.metadata = const {},
    this.replyToId,
    this.replyPreview,
    this.isPinned = false,
    this.reactions = const [],
    this.editedAt,
    this.deletedAt,
    this.author,
    this.clientId,
  });

  final String id;
  final String chatId;
  final String senderId;
  final String type;
  final String body;
  final DateTime createdAt;
  final Map<String, dynamic> metadata;
  final String? replyToId;
  final ReplyPreview? replyPreview;
  final bool isPinned;
  final List<ReactionGroup> reactions;
  final DateTime? editedAt;
  final DateTime? deletedAt;
  final ChatAuthor? author;

  /// Optimistic-only client correlation id (not persisted).
  final String? clientId;

  bool get isDeleted => deletedAt != null;
  bool get isEdited => editedAt != null;

  ChatMessage copyWith({
    String? body,
    List<ReactionGroup>? reactions,
    bool? isPinned,
    DateTime? editedAt,
    DateTime? deletedAt,
    ChatAuthor? author,
  }) {
    return ChatMessage(
      id: id,
      chatId: chatId,
      senderId: senderId,
      type: type,
      body: body ?? this.body,
      createdAt: createdAt,
      metadata: metadata,
      replyToId: replyToId,
      replyPreview: replyPreview,
      isPinned: isPinned ?? this.isPinned,
      reactions: reactions ?? this.reactions,
      editedAt: editedAt ?? this.editedAt,
      deletedAt: deletedAt ?? this.deletedAt,
      author: author ?? this.author,
      clientId: clientId,
    );
  }

  @override
  List<Object?> get props => [
        id,
        chatId,
        senderId,
        type,
        body,
        createdAt,
        metadata,
        replyToId,
        replyPreview,
        isPinned,
        reactions,
        editedAt,
        deletedAt,
        author,
        clientId,
      ];
}

/// A conversation row in the inbox.
class ChatConversation extends Equatable {
  const ChatConversation({
    required this.id,
    required this.type,
    required this.title,
    this.avatarUrl,
    this.themeKey,
    this.isPublic = false,
    this.isMuted = false,
    this.role = ChatRole.member,
    this.unread = 0,
    this.memberCount = 0,
    this.lastMessageAt,
    this.lastMessageBody,
    this.lastMessageSenderId,
    this.other,
  });

  final String id;
  final ChatType type;
  final String title;
  final String? avatarUrl;
  final String? themeKey;
  final bool isPublic;
  final bool isMuted;
  final ChatRole role;
  final int unread;
  final int memberCount;
  final DateTime? lastMessageAt;
  final String? lastMessageBody;
  final String? lastMessageSenderId;
  final ChatAuthor? other;

  bool get isDirect => type == ChatType.direct;

  @override
  List<Object?> get props => [
        id,
        type,
        title,
        avatarUrl,
        themeKey,
        isPublic,
        isMuted,
        role,
        unread,
        memberCount,
        lastMessageAt,
        lastMessageBody,
        lastMessageSenderId,
        other,
      ];
}

/// A member of a chat.
class ChatMember extends Equatable {
  const ChatMember({
    required this.userId,
    required this.displayName,
    this.avatarUrl,
    this.username,
    this.role = ChatRole.member,
    this.isMuted = false,
    this.online = false,
    this.lastSeenAt,
  });

  final String userId;
  final String displayName;
  final String? avatarUrl;
  final String? username;
  final ChatRole role;
  final bool isMuted;
  final bool online;
  final DateTime? lastSeenAt;

  @override
  List<Object?> get props =>
      [userId, displayName, avatarUrl, username, role, isMuted, online, lastSeenAt];
}

/// A participant currently in the voice channel.
class VoiceParticipant extends Equatable {
  const VoiceParticipant({
    required this.userId,
    required this.displayName,
    this.avatarUrl,
    this.isMuted = false,
    this.isSpeaking = false,
    this.isBroadcasting = false,
    this.joinedAt,
  });

  final String userId;
  final String displayName;
  final String? avatarUrl;
  final bool isMuted;
  final bool isSpeaking;
  final bool isBroadcasting;
  final DateTime? joinedAt;

  @override
  List<Object?> get props =>
      [userId, displayName, avatarUrl, isMuted, isSpeaking, isBroadcasting, joinedAt];
}

/// LiveKit/voice access credentials for joining a voice room.
class VoiceToken extends Equatable {
  const VoiceToken({
    required this.provider,
    required this.token,
    required this.roomName,
    this.url,
  });

  final String provider;
  final String token;
  final String roomName;
  final String? url;

  @override
  List<Object?> get props => [provider, token, roomName, url];
}
