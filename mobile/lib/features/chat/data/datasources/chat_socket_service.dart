import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/dio_client.dart';
import '../../../../core/socket/socket_io_client.dart';
import '../../domain/entities/chat_entities.dart';
import '../models/chat_models.dart';

/// Incoming real-time event payloads, surfaced to the presentation layer as
/// typed streams. Only one socket connection exists for the app session.
class IncomingMessage {
  const IncomingMessage(this.message, {this.clientId});
  final ChatMessage message;
  final String? clientId;
}

class ReactionUpdate {
  const ReactionUpdate({
    required this.messageId,
    required this.chatId,
    required this.groups,
    required this.byUserId,
    required this.added,
    required this.emoji,
  });
  final String messageId;
  final String chatId;
  final List<ReactionGroup> groups;
  final String byUserId;
  final bool added;
  final String emoji;
}

class MessageEdit {
  const MessageEdit({required this.messageId, required this.chatId, required this.body, this.editedAt});
  final String messageId;
  final String chatId;
  final String body;
  final DateTime? editedAt;
}

class MessageDelete {
  const MessageDelete({required this.messageId, required this.chatId});
  final String messageId;
  final String chatId;
}

class PinUpdate {
  const PinUpdate({required this.messageId, required this.chatId, required this.pinned, required this.by});
  final String messageId;
  final String chatId;
  final bool pinned;
  final String by;
}

class TypingEvent {
  const TypingEvent({required this.chatId, required this.userId, required this.isTyping, this.displayName});
  final String chatId;
  final String userId;
  final bool isTyping;
  final String? displayName;
}

class ReadEvent {
  const ReadEvent({required this.chatId, required this.userId, this.lastReadAt});
  final String chatId;
  final String userId;
  final DateTime? lastReadAt;
}

class PresenceEvent {
  const PresenceEvent({required this.userId, required this.presence});
  final String userId;
  final Presence presence;
}

class VoiceRosterEvent {
  const VoiceRosterEvent({required this.chatId, required this.participants});
  final String chatId;
  final List<VoiceParticipant> participants;
}

class VoiceStateEvent {
  const VoiceStateEvent({
    required this.chatId,
    required this.userId,
    this.isMuted,
    this.isSpeaking,
    this.isBroadcasting,
  });
  final String chatId;
  final String userId;
  final bool? isMuted;
  final bool? isSpeaking;
  final bool? isBroadcasting;
}

class NotificationEvent {
  const NotificationEvent({
    required this.chatId,
    required this.message,
    this.title,
    this.body,
  });
  final String chatId;
  final ChatMessage? message;
  final String? title;
  final String? body;
}

Map<String, dynamic> _asMap(dynamic v) => v is Map<String, dynamic> ? v : const {};
List<dynamic> _asList(dynamic v) => v is List ? v : const [];

/// Owns the [SocketIoClient] lifecycle and translates raw socket events into
/// typed broadcast streams. Emitting methods return server acknowledgements.
class ChatSocketService {
  ChatSocketService(this._socket);

  final SocketIoClient _socket;

  // Broadcast controllers so multiple providers/screens can listen.
  final _connection = StreamController<bool>.broadcast();
  final _messages = StreamController<IncomingMessage>.broadcast();
  final _reactions = StreamController<ReactionUpdate>.broadcast();
  final _edits = StreamController<MessageEdit>.broadcast();
  final _deletes = StreamController<MessageDelete>.broadcast();
  final _pins = StreamController<PinUpdate>.broadcast();
  final _typing = StreamController<TypingEvent>.broadcast();
  final _reads = StreamController<ReadEvent>.broadcast();
  final _presence = StreamController<PresenceEvent>.broadcast();
  final _voiceRoster = StreamController<VoiceRosterEvent>.broadcast();
  final _voiceState = StreamController<VoiceStateEvent>.broadcast();
  final _notifications = StreamController<NotificationEvent>.broadcast();

  bool _wired = false;
  bool get connected => _socket.isAuthenticated;

  Stream<bool> get connection => _connection.stream;
  Stream<IncomingMessage> get messages => _messages.stream;
  Stream<ReactionUpdate> get reactions => _reactions.stream;
  Stream<MessageEdit> get edits => _edits.stream;
  Stream<MessageDelete> get deletes => _deletes.stream;
  Stream<PinUpdate> get pins => _pins.stream;
  Stream<TypingEvent> get typing => _typing.stream;
  Stream<ReadEvent> get reads => _reads.stream;
  Stream<PresenceEvent> get presence => _presence.stream;
  Stream<VoiceRosterEvent> get voiceRoster => _voiceRoster.stream;
  Stream<VoiceStateEvent> get voiceState => _voiceState.stream;
  Stream<NotificationEvent> get notifications => _notifications.stream;

  Future<void> connect() async {
    _wire();
    await _socket.connect();
  }

  void disconnect() => _socket.disconnect();

  void dispose() {
    _socket.dispose();
    for (final c in [
      _connection,
      _messages,
      _reactions,
      _edits,
      _deletes,
      _pins,
      _typing,
      _reads,
      _presence,
      _voiceRoster,
      _voiceState,
      _notifications,
    ]) {
      c.close();
    }
  }

  void _wire() {
    if (_wired) return;
    _wired = true;

    _socket.onConnectionChange = (up) {
      if (!up) _connection.add(false);
    };

    // The server emits `authenticated` once the handshake JWT is accepted.
    _socket.on('authenticated', (_) => _connection.add(true));
    _socket.on('unauthorized', (_) => _connection.add(false));

    _socket.on('chat:message', (data) {
      final json = _asMap(data);
      if (json.isEmpty) return;
      final message = ChatMessageModel.fromJson(json);
      _messages.add(IncomingMessage(message, clientId: json['clientId'] as String?));
    });

    _socket.on('message:reaction:update', (data) {
      final json = _asMap(data);
      final groups = _asList(json['groups'])
          .whereType<Map<String, dynamic>>()
          .map(ReactionGroupModel.fromJson)
          .toList();
      final by = _asMap(json['by']);
      _reactions.add(ReactionUpdate(
        messageId: json['messageId'] as String? ?? '',
        chatId: json['chatId'] as String? ?? '',
        groups: groups,
        byUserId: by['userId'] as String? ?? '',
        added: by['added'] as bool? ?? true,
        emoji: by['emoji'] as String? ?? '',
      ));
    });

    _socket.on('message:edited', (data) {
      final json = _asMap(data);
      _edits.add(MessageEdit(
        messageId: json['id'] as String? ?? json['messageId'] as String? ?? '',
        chatId: json['chatId'] as String? ?? '',
        body: json['body'] as String? ?? '',
        editedAt: json['editedAt'] is String ? DateTime.tryParse(json['editedAt'] as String) : null,
      ));
    });

    _socket.on('message:deleted', (data) {
      final json = _asMap(data);
      _deletes.add(MessageDelete(
        messageId: json['id'] as String? ?? json['messageId'] as String? ?? '',
        chatId: json['chatId'] as String? ?? '',
      ));
    });

    _socket.on('message:pinned', (data) {
      final json = _asMap(data);
      _pins.add(PinUpdate(
        messageId: json['messageId'] as String? ?? json['id'] as String? ?? '',
        chatId: json['chatId'] as String? ?? '',
        pinned: json['pinned'] as bool? ?? false,
        by: json['pinnedBy'] as String? ?? json['by'] as String? ?? '',
      ));
    });

    _socket.on('typing', (data) {
      final json = _asMap(data);
      _typing.add(TypingEvent(
        chatId: json['chatId'] as String? ?? '',
        userId: json['userId'] as String? ?? '',
        isTyping: json['isTyping'] as bool? ?? true,
        displayName: json['displayName'] as String?,
      ));
    });

    _socket.on('chat:read', (data) {
      final json = _asMap(data);
      _reads.add(ReadEvent(
        chatId: json['chatId'] as String? ?? '',
        userId: json['userId'] as String? ?? '',
        lastReadAt: json['lastReadAt'] is String
            ? DateTime.tryParse(json['lastReadAt'] as String)
            : null,
      ));
    });

    _socket.on('presence:update', (data) {
      final json = _asMap(data);
      _presence.add(PresenceEvent(
        userId: json['userId'] as String? ?? '',
        presence: Presence.fromString(json['presence'] as String? ?? 'offline'),
      ));
    });

    _socket.on('voice:roster', (data) {
      final json = _asMap(data);
      final participants = _asList(json['participants'])
          .whereType<Map<String, dynamic>>()
          .map(VoiceParticipantModel.fromJson)
          .toList();
      _voiceRoster.add(VoiceRosterEvent(
        chatId: json['chatId'] as String? ?? '',
        participants: participants,
      ));
    });

    _socket.on('voice:state', (data) {
      final json = _asMap(data);
      _voiceState.add(VoiceStateEvent(
        chatId: json['chatId'] as String? ?? '',
        userId: json['userId'] as String? ?? '',
        isMuted: json['isMuted'] as bool?,
        isSpeaking: json['isSpeaking'] as bool?,
        isBroadcasting: json['isBroadcasting'] as bool?,
      ));
    });

    _socket.on('chat:notification', (data) {
      final json = _asMap(data);
      final messageJson = json['message'];
      _notifications.add(NotificationEvent(
        chatId: json['chatId'] as String? ?? '',
        title: json['title'] as String?,
        body: json['body'] as String?,
        message: messageJson is Map<String, dynamic>
            ? ChatMessageModel.fromJson(messageJson)
            : null,
      ));
    });
  }

  // ── Emits (client → server), with acks ──────────────────────────────────

  Future<bool> joinChat(String chatId) async {
    final ack = await _socket.emit('chat:join', {'chatId': chatId}, withAck: true)
        as Map<String, dynamic>?;
    return ack?['joined'] == true;
  }

  Future<void> leaveChat(String chatId) =>
      _socket.emit('chat:leave', {'chatId': chatId});

  /// Sends a message over the socket. Returns the server-assigned message id
  /// (or throws with the server error, e.g. when muted/banned).
  Future<String> sendMessage({
    required String chatId,
    required String body,
    String? replyToId,
    String? type,
    String? clientId,
  }) async {
    final ack = await _socket.emit(
      'chat:message:send',
      {
        'chatId': chatId,
        'body': body,
        if (replyToId != null) 'replyToId': replyToId,
        if (type != null) 'type': type,
        if (clientId != null) 'clientId': clientId,
      },
      withAck: true,
    ) as Map<String, dynamic>?;
    if (ack?['ok'] != true) {
      throw StateError(ack?['error']?.toString() ?? 'Message failed to send.');
    }
    return ack?['id'] as String? ?? '';
  }

  Future<void> editMessage({required String messageId, required String body}) =>
      _socket.emit('message:edit', {'messageId': messageId, 'body': body}, withAck: true);

  Future<void> deleteMessage({required String messageId}) =>
      _socket.emit('message:delete', {'messageId': messageId}, withAck: true);

  Future<void> toggleReaction({required String messageId, required String emoji}) =>
      _socket.emit('message:reaction', {'messageId': messageId, 'emoji': emoji}, withAck: true);

  Future<void> setPinned({required String messageId, required bool pinned}) =>
      _socket.emit('message:pin', {'messageId': messageId, 'pinned': pinned}, withAck: true);

  Future<void> markRead(String chatId) =>
      _socket.emit('chat:read', {'chatId': chatId});

  Future<void> setTyping({required String chatId, required bool isTyping}) =>
      _socket.emit('typing', {'chatId': chatId, 'isTyping': isTyping});

  Future<void> requestPresence(List<String> userIds) =>
      _socket.emit('presence:request', {'userIds': userIds});

  Future<void> joinVoice(String chatId) =>
      _socket.emit('voice:join', {'chatId': chatId}, withAck: true);

  Future<void> leaveVoice(String chatId) =>
      _socket.emit('voice:leave', {'chatId': chatId}, withAck: true);

  Future<void> setVoiceState({
    required String chatId,
    bool? isMuted,
    bool? isSpeaking,
    bool? isDeafened,
    bool? isBroadcasting,
  }) =>
      _socket.emit('voice:state', {
        'chatId': chatId,
        if (isMuted != null) 'isMuted': isMuted,
        if (isSpeaking != null) 'isSpeaking': isSpeaking,
        if (isDeafened != null) 'isDeafened': isDeafened,
        if (isBroadcasting != null) 'isBroadcasting': isBroadcasting,
      }, withAck: true);
}

/// The raw socket singleton, authenticated with the stored access token.
final socketIoClientProvider = Provider<SocketIoClient>((ref) {
  final storage = ref.watch(secureTokenStorageProvider);
  final client = SocketIoClient(storage: storage);
  ref.onDispose(client.dispose);
  return client;
});

/// The typed chat socket service — kept alive for the whole authenticated
/// session so presence and background notifications keep flowing.
final chatSocketServiceProvider = Provider<ChatSocketService>((ref) {
  final service = ChatSocketService(ref.watch(socketIoClientProvider));
  ref.onDispose(service.dispose);
  return service;
});
