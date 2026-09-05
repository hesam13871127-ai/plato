import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failures.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../data/datasources/chat_socket_service.dart';
import '../../domain/entities/chat_entities.dart';
import '../../domain/repositories/chat_repository.dart';
import 'chat_providers.dart';

/// Snapshot of an open chat: message list (oldest → newest), live typing and
/// the voice-channel roster.
class ChatThreadState {
  const ChatThreadState({
    this.messages = const [],
    this.typingUserIds = const <String>{},
    this.voiceParticipants = const [],
    this.loading = true,
    this.loadingMore = false,
    this.sending = false,
    this.error,
    this.joined = false,
    this.hasMore = true,
  });

  final List<ChatMessage> messages;
  final Set<String> typingUserIds;
  final List<VoiceParticipant> voiceParticipants;
  final bool loading;
  final bool loadingMore;
  final bool sending;
  final String? error;
  final bool joined;
  final bool hasMore;

  ChatThreadState copyWith({
    List<ChatMessage>? messages,
    Set<String>? typingUserIds,
    List<VoiceParticipant>? voiceParticipants,
    bool? loading,
    bool? loadingMore,
    bool? sending,
    String? error,
    bool? joined,
    bool? hasMore,
    bool clearError = false,
  }) {
    return ChatThreadState(
      messages: messages ?? this.messages,
      typingUserIds: typingUserIds ?? this.typingUserIds,
      voiceParticipants: voiceParticipants ?? this.voiceParticipants,
      loading: loading ?? this.loading,
      loadingMore: loadingMore ?? this.loadingMore,
      sending: sending ?? this.sending,
      error: clearError ? null : (error ?? this.error),
      joined: joined ?? this.joined,
      hasMore: hasMore ?? this.hasMore,
    );
  }
}

/// One live thread per open chat (family keyed by chatId). Subscribes to the
/// socket room, loads history, and folds every real-time event into state.
class ChatThreadNotifier extends StateNotifier<ChatThreadState> {
  ChatThreadNotifier(this._ref, this._chatId) : super(const ChatThreadState()) {
    _init();
  }

  final Ref _ref;
  final String _chatId;
  final List<StreamSubscription<dynamic>> _subs = [];
  Timer? _typingStopTimer;

  ChatRepository get _repo => _ref.read(chatRepositoryProvider);
  ChatSocketService get _socket => _ref.read(chatSocketServiceProvider);
  String get _currentUserId => _ref.read(authNotifierProvider).user.id;

  Future<void> _init() async {
    _wireSocket();
    // Join the room (also marks the conversation read).
    if (_socket.connected) {
      await _socket.joinChat(_chatId).catchError((_) => false);
      state = state.copyWith(joined: true);
    }
    await _loadHistory();
  }

  void _wireSocket() {
    _subs.add(_socket.connection.listen((connected) async {
      if (connected) {
        final ok = await _socket.joinChat(_chatId).catchError((_) => false);
        if (ok) {
          state = state.copyWith(joined: true);
          await _loadHistory();
        }
      }
    }));

    _subs.add(_socket.messages.listen((event) {
      if (event.message.chatId != _chatId) return;
      _upsertMessage(event.message);
      // Clear our own optimistic placeholder once the server echo arrives.
      if (event.clientId != null) {
        state = state.copyWith(
          messages: state.messages
              .where((m) => m.clientId != event.clientId || m.id == event.message.id)
              .toList(),
        );
      }
      // Others' messages: bring read cursor forward while the thread is open.
      if (event.message.senderId != _currentUserId) {
        unawaited(_socket.markRead(_chatId));
      }
    }));

    _subs.add(_socket.edits.listen((event) {
      if (event.chatId != _chatId) return;
      state = state.copyWith(
        messages: [
          for (final m in state.messages)
            if (m.id == event.messageId)
              m.copyWith(body: event.body, editedAt: event.editedAt ?? DateTime.now())
            else
              m,
        ],
      );
    }));

    _subs.add(_socket.deletes.listen((event) {
      if (event.chatId != _chatId) return;
      state = state.copyWith(
        messages: [
          for (final m in state.messages)
            if (m.id == event.messageId)
              m.copyWith(body: '', deletedAt: DateTime.now(), reactions: const [])
            else
              m,
        ],
      );
    }));

    _subs.add(_socket.reactions.listen((event) {
      if (event.chatId != _chatId) return;
      state = state.copyWith(
        messages: [
          for (final m in state.messages)
            if (m.id == event.messageId) m.copyWith(reactions: event.groups) else m,
        ],
      );
    }));

    _subs.add(_socket.pins.listen((event) {
      if (event.chatId != _chatId) return;
      // Unpin all, then pin the target (one pinned message per chat).
      state = state.copyWith(
        messages: [
          for (final m in state.messages)
            if (m.id == event.messageId)
              m.copyWith(isPinned: event.pinned)
            else if (event.pinned)
              m.copyWith(isPinned: false)
            else
              m,
        ],
      );
    }));

    _subs.add(_socket.typing.listen((event) {
      if (event.chatId != _chatId || event.userId == _currentUserId) return;
      final set = Set<String>.from(state.typingUserIds);
      if (event.isTyping) {
        set.add(event.userId);
      } else {
        set.remove(event.userId);
      }
      state = state.copyWith(typingUserIds: set);
      if (event.isTyping) {
        _typingStopTimer?.cancel();
        _typingStopTimer = Timer(const Duration(seconds: 4), () {
          if (mounted) {
            state = state.copyWith(
              typingUserIds: state.typingUserIds.toSet()..remove(event.userId),
            );
          }
        });
      }
    }));

    _subs.add(_socket.voiceRoster.listen((event) {
      if (event.chatId != _chatId) return;
      state = state.copyWith(voiceParticipants: event.participants);
    }));

    _subs.add(_socket.voiceState.listen((event) {
      if (event.chatId != _chatId) return;
      state = state.copyWith(
        voiceParticipants: [
          for (final p in state.voiceParticipants)
            if (p.userId == event.userId)
              VoiceParticipant(
                userId: p.userId,
                displayName: p.displayName,
                avatarUrl: p.avatarUrl,
                isMuted: event.isMuted ?? p.isMuted,
                isSpeaking: event.isSpeaking ?? p.isSpeaking,
                isBroadcasting: event.isBroadcasting ?? p.isBroadcasting,
                joinedAt: p.joinedAt,
              )
            else
              p,
        ],
      );
    }));
  }

  void _upsertMessage(ChatMessage message) {
    final exists = state.messages.any((m) => m.id == message.id);
    if (exists) {
      state = state.copyWith(
        messages: [for (final m in state.messages) if (m.id == message.id) message else m],
      );
    } else {
      state = state.copyWith(messages: [...state.messages, message]);
    }
  }

  Future<void> _loadHistory() async {
    state = state.copyWith(loading: true, clearError: true);
    final result = await _repo.getMessages(chatId: _chatId, limit: 30);
    if (!mounted) return;
    result.fold(
      (failure) => state = state.copyWith(loading: false, error: failure.message),
      (messages) => state = state.copyWith(
        loading: false,
        messages: _mergeHistory(messages),
        hasMore: messages.length >= 30,
      ),
    );
  }

  /// Loads an older page (pagination before the current oldest message).
  Future<void> loadMore() async {
    if (state.loadingMore || !state.hasMore || state.messages.isEmpty) return;
    state = state.copyWith(loadingMore: true);
    final oldestId = state.messages.first.id;
    final result = await _repo.getMessages(chatId: _chatId, before: oldestId, limit: 30);
    if (!mounted) return;
    result.fold(
      (failure) => state = state.copyWith(loadingMore: false, error: failure.message),
      (older) {
        final existingIds = state.messages.map((m) => m.id).toSet();
        final fresh = older.where((m) => !existingIds.contains(m.id)).toList();
        state = state.copyWith(
          loadingMore: false,
          hasMore: older.length >= 30,
          messages: [...fresh, ...state.messages],
        );
      },
    );
  }

  List<ChatMessage> _mergeHistory(List<ChatMessage> incoming) {
    final byId = <String, ChatMessage>{};
    for (final m in [...state.messages, ...incoming]) {
      byId[m.id] = m;
    }
    final merged = byId.values.toList()
      ..sort((a, b) {
        final byDate = a.createdAt.compareTo(b.createdAt);
        return byDate != 0 ? byDate : a.id.compareTo(b.id);
      });
    return merged;
  }

  // ── Sending / composer actions ───────────────────────────────────────────

  Future<void> sendText(String body, {String? replyToId}) async {
    final trimmed = body.trim();
    if (trimmed.isEmpty || state.sending) return;

    final clientId = 'local-${DateTime.now().microsecondsSinceEpoch}';
    final placeholder = ChatMessage(
      id: clientId,
      chatId: _chatId,
      senderId: _currentUserId,
      type: 'text',
      body: trimmed,
      createdAt: DateTime.now(),
      clientId: clientId,
      replyToId: replyToId,
    );
    state = state.copyWith(
      sending: true,
      messages: [...state.messages, placeholder],
      clearError: true,
    );
    unawaited(_socket.setTyping(chatId: _chatId, isTyping: false));

    if (_socket.connected) {
      try {
        await _socket.sendMessage(
          chatId: _chatId,
          body: trimmed,
          replyToId: replyToId,
          clientId: clientId,
        );
        if (mounted) state = state.copyWith(sending: false);
        return;
      } on Object catch (error) {
        if (mounted) {
          state = state.copyWith(
            sending: false,
            messages: state.messages.where((m) => m.clientId != clientId).toList(),
            error: _describe(error),
          );
        }
        return;
      }
    }

    // Fallback to REST when the socket is not connected.
    final result = await _repo.sendMessage(
      chatId: _chatId,
      body: trimmed,
      replyToId: replyToId,
      clientId: clientId,
    );
    if (!mounted) return;
    result.fold(
      (failure) => state = state.copyWith(
        sending: false,
        messages: state.messages.where((m) => m.clientId != clientId).toList(),
        error: failure.message,
      ),
      (message) {
        state = state.copyWith(
          sending: false,
          messages: [
            ...state.messages.where((m) => m.clientId != clientId),
            message,
          ],
        );
      },
    );
  }

  void setTyping({required bool isTyping}) {
    unawaited(_socket.setTyping(chatId: _chatId, isTyping: isTyping));
  }

  Future<void> toggleReaction(ChatMessage message, String emoji) async {
    await _repo.toggleReaction(messageId: message.id, emoji: emoji);
  }

  Future<String?> editMessage(ChatMessage message, String body) async {
    final result = await _repo.editMessage(messageId: message.id, body: body);
    return result.fold((f) => f.message, (_) => null);
  }

  Future<String?> deleteMessage(ChatMessage message) async {
    final result = await _repo.deleteMessage(messageId: message.id);
    return result.fold((f) => f.message, (_) => null);
  }

  Future<String?> setPinned(ChatMessage message, bool pinned) async {
    final result = await _repo.setPinned(messageId: message.id, pinned: pinned);
    return result.fold((f) => f.message, (_) => null);
  }

  Future<String?> joinVoice() async {
    try {
      final tokenResult = await _repo.getVoiceToken(chatId: _chatId);
      return tokenResult.fold(
        (f) => f.message,
        (token) {
          unawaited(_socket.joinVoice(_chatId));
          return null;
        },
      );
    } on Object catch (error) {
      return _describe(error);
    }
  }

  Future<void> leaveVoice() => _socket.leaveVoice(_chatId);

  Future<void> setVoiceMuted({required bool muted}) =>
      _socket.setVoiceState(chatId: _chatId, isMuted: muted);

  void clearError() => state = state.copyWith(clearError: true);

  String _describe(Object error) {
    if (error is Failure) return error.message;
    return error.toString().replaceFirst('Bad state: ', '');
  }

  @override
  void dispose() {
    _typingStopTimer?.cancel();
    for (final sub in _subs) {
      unawaited(sub.cancel());
    }
    // Leave the room when the thread is closed.
    if (_socket.connected) unawaited(_socket.leaveChat(_chatId));
    super.dispose();
  }
}

final chatThreadProvider =
    StateNotifierProvider.family<ChatThreadNotifier, ChatThreadState, String>(
  (ref, chatId) => ChatThreadNotifier(ref, chatId),
);
