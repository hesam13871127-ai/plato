import 'package:dio/dio.dart';
import 'package:fpdart/fpdart.dart';

import '../../../../core/error/error_mapper.dart';
import '../../../../core/error/failures.dart';
import '../../../../core/network/api_endpoints.dart';
import '../../domain/entities/chat_entities.dart';
import '../../domain/repositories/chat_repository.dart';
import '../datasources/chat_remote_datasource.dart';
import '../datasources/chat_socket_service.dart';

class ChatRepositoryImpl implements ChatRepository {
  ChatRepositoryImpl({
    required ChatRemoteDataSource remote,
    required ChatSocketService socket,
  })  : _remote = remote,
        _socket = socket;

  final ChatRemoteDataSource _remote;
  final ChatSocketService _socket;

  // ── Inbox / discovery ────────────────────────────────────────────────────

  @override
  Future<Either<Failure, List<ChatConversation>>> getConversations() =>
      _guard(() => _remote.getConversations());

  @override
  Future<Either<Failure, ChatConversation>> getLounge() =>
      _guard(() => _remote.getLounge());

  // ── Creation / membership ────────────────────────────────────────────────

  @override
  Future<Either<Failure, ChatConversation>> openDirectChat({required String userId}) =>
      _guard(() => _remote.openDirectChat(userId: userId));

  @override
  Future<Either<Failure, ChatConversation>> createGroup({
    required String title,
    String? accessPass,
    List<String>? memberIds,
  }) =>
      _guard(() => _remote.createGroup(
            title: title,
            accessPass: accessPass,
            memberIds: memberIds,
          ));

  @override
  Future<Either<Failure, void>> joinChat({required String chatId, String? pass}) =>
      _guard(() => _remote.joinChat(chatId: chatId, pass: pass));

  @override
  Future<Either<Failure, void>> leaveChat({required String chatId}) =>
      _guard(() => _remote.leaveChat(chatId: chatId));

  @override
  Future<Either<Failure, List<ChatMember>>> getMembers({required String chatId}) =>
      _guard(() => _remote.getMembers(chatId: chatId));

  @override
  Future<Either<Failure, void>> setChatSettings({
    required String chatId,
    required String themeKey,
  }) =>
      _guard(() => _remote.setChatSettings(chatId: chatId, themeKey: themeKey));

  @override
  Future<Either<Failure, void>> setMemberRole({
    required String chatId,
    required String userId,
    required String role,
  }) =>
      _guard(() => _remote.setMemberRole(chatId: chatId, userId: userId, role: role));

  // ── Messages ─────────────────────────────────────────────────────────────

  @override
  Future<Either<Failure, List<ChatMessage>>> getMessages({
    required String chatId,
    String? before,
    int limit = 30,
  }) =>
      _guard(() => _remote.getMessages(chatId: chatId, before: before, limit: limit));

  @override
  Future<Either<Failure, ChatMessage>> sendMessage({
    required String chatId,
    required String body,
    String? replyToId,
    String? type,
    String? clientId,
  }) =>
      _guard(() => _remote.sendMessage(
            chatId: chatId,
            body: body,
            replyToId: replyToId,
            type: type,
            clientId: clientId,
          ));

  @override
  Future<Either<Failure, ChatMessage>> editMessage({
    required String messageId,
    required String body,
  }) async {
    try {
      await _socket.editMessage(messageId: messageId, body: body);
      // The edited message is delivered to all clients (including this one)
      // via the `message:edited` socket event; nothing further to return.
      return Right(ChatMessage(
        id: messageId,
        chatId: '',
        senderId: '',
        type: 'text',
        body: body,
        createdAt: DateTime.now(),
      ));
    } on Object catch (error) {
      return Left(_mapLiveError(error));
    }
  }

  @override
  Future<Either<Failure, void>> deleteMessage({required String messageId}) async {
    try {
      await _socket.deleteMessage(messageId: messageId);
      return const Right(null);
    } on Object catch (error) {
      return Left(_mapLiveError(error));
    }
  }

  @override
  Future<Either<Failure, void>> toggleReaction({
    required String messageId,
    required String emoji,
  }) async {
    try {
      await _socket.toggleReaction(messageId: messageId, emoji: emoji);
      return const Right(null);
    } on Object catch (error) {
      return Left(_mapLiveError(error));
    }
  }

  @override
  Future<Either<Failure, void>> setPinned({
    required String messageId,
    required bool pinned,
  }) async {
    try {
      await _socket.setPinned(messageId: messageId, pinned: pinned);
      return const Right(null);
    } on Object catch (error) {
      return Left(_mapLiveError(error));
    }
  }

  @override
  Future<Either<Failure, ChatMessage?>> getPinned({required String chatId}) =>
      _guard(() => _remote.getPinned(chatId: chatId));

  @override
  Future<Either<Failure, void>> markRead({required String chatId}) =>
      _guard(() => _remote.markRead(chatId: chatId));

  // ── Voice ────────────────────────────────────────────────────────────────

  @override
  Future<Either<Failure, VoiceToken>> getVoiceToken({required String chatId}) =>
      _guard(() => _remote.getVoiceToken(chatId: chatId));

  @override
  Future<Either<Failure, List<VoiceParticipant>>> getVoiceParticipants({
    required String chatId,
  }) =>
      _guard(() => _remote.getVoiceParticipants(chatId: chatId));

  // ── Moderation ───────────────────────────────────────────────────────────

  @override
  Future<Either<Failure, void>> reportMessage({
    required String messageId,
    required String reason,
  }) =>
      _guard(() => _remote.reportMessage(messageId: messageId, reason: reason));

  @override
  Future<Either<Failure, void>> reportUser({
    required String userId,
    required String reason,
  }) =>
      _guard(() => _remote.reportUser(userId: userId, reason: reason));

  @override
  Future<Either<Failure, void>> muteMember({
    required String chatId,
    required String userId,
    int? durationMinutes,
  }) =>
      _guard(() => _remote.moderate(ApiEndpoints.chatMute, {
            'chatId': chatId,
            'userId': userId,
            if (durationMinutes != null) 'durationMinutes': durationMinutes,
          }));

  @override
  Future<Either<Failure, void>> unmuteMember({
    required String chatId,
    required String userId,
  }) =>
      _guard(() => _remote.moderate(
            ApiEndpoints.chatUnmute,
            {'chatId': chatId, 'userId': userId},
          ));

  @override
  Future<Either<Failure, void>> banUser({
    required String chatId,
    required String userId,
    String? reason,
    int? durationDays,
  }) =>
      _guard(() => _remote.moderate(ApiEndpoints.chatBan, {
            'chatId': chatId,
            'userId': userId,
            if (reason != null) 'reason': reason,
            if (durationDays != null) 'durationMinutes': durationDays * 24 * 60,
          }));

  @override
  Future<Either<Failure, void>> kickUser({
    required String chatId,
    required String userId,
  }) =>
      _guard(() => _remote.moderate(
            ApiEndpoints.chatKick,
            {'chatId': chatId, 'userId': userId},
          ));

  // ── helpers ──────────────────────────────────────────────────────────────

  Future<Either<Failure, T>> _guard<T>(Future<T> Function() call) async {
    try {
      return Right(await call());
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  Failure _mapLiveError(Object error) {
    if (error is DioException) return mapErrorToFailure(error);
    final text = error.toString().replaceFirst('Bad state: ', '');
    if (text.contains('muted')) {
      return const ServerFailure('You are muted in this chat.');
    }
    return ServerFailure(text.isEmpty ? 'Action failed.' : text);
  }
}
