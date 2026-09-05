import 'package:dio/dio.dart';

import '../../../../core/network/api_endpoints.dart';
import '../../domain/entities/chat_entities.dart';
import '../models/chat_models.dart';

/// REST client for the `/api/chat` endpoints. Real-time delivery is handled
/// separately over sockets; this covers history, management and moderation.
///
/// Every successful backend response is wrapped by the global transform
/// interceptor as `{ success, data, timestamp }`; [_payload] unwraps it.
class ChatRemoteDataSource {
  ChatRemoteDataSource(this._dio);

  final Dio _dio;

  Map<String, dynamic> _payload(Response<Map<String, dynamic>> res) =>
      (res.data?['data'] as Map<String, dynamic>?) ?? const <String, dynamic>{};

  // ── Inbox / discovery ────────────────────────────────────────────────────

  Future<List<ChatConversation>> getConversations() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.chatConversations);
    final items = (_payload(res)['items'] as List?) ?? const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(ChatConversationModel.fromJson)
        .toList();
  }

  Future<ChatConversation> getLounge() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.chatLounge);
    final data = _payload(res);
    return ChatConversationModel(
      id: data['chatId'] as String? ?? '',
      type: ChatType.lounge,
      title: data['title'] as String? ?? 'Lounge',
      isPublic: true,
      role: ChatRole.member,
    );
  }

  // ── Creation / membership ────────────────────────────────────────────────

  Future<ChatConversation> openDirectChat({required String userId}) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.chatDirect,
      data: {'userId': userId},
    );
    final data = _payload(res);
    return ChatConversationModel(
      id: data['chatId'] as String? ?? '',
      type: ChatType.direct,
      title: 'Direct chat',
    );
  }

  Future<ChatConversation> createGroup({
    required String title,
    String? accessPass,
    String? themeKey,
    List<String>? memberIds,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.chatGroup,
      data: {
        'title': title,
        if (accessPass != null && accessPass.isNotEmpty) 'accessPass': accessPass,
        if (themeKey != null && themeKey.isNotEmpty) 'themeKey': themeKey,
        if (memberIds != null && memberIds.isNotEmpty) 'memberIds': memberIds,
      },
    );
    final data = _payload(res);
    return ChatConversationModel(
      id: data['chatId'] as String? ?? '',
      type: ChatType.group,
      title: title,
      role: ChatRole.owner,
    );
  }

  Future<void> joinChat({required String chatId, String? pass}) async {
    await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.chatJoin(chatId),
      data: {if (pass != null && pass.isNotEmpty) 'accessPass': pass},
    );
  }

  Future<void> leaveChat({required String chatId}) async {
    await _dio.post<Map<String, dynamic>>(ApiEndpoints.chatLeave(chatId));
  }

  Future<List<ChatMember>> getMembers({required String chatId}) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.chatMembers(chatId));
    final members = (_payload(res)['members'] as List?) ?? const [];
    return members
        .whereType<Map<String, dynamic>>()
        .map(ChatMemberModel.fromJson)
        .toList();
  }

  Future<void> setChatSettings({
    required String chatId,
    required String themeKey,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.chatSettings(chatId),
      data: {'themeKey': themeKey},
    );
  }

  Future<void> setMemberRole({
    required String chatId,
    required String userId,
    required String role,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.chatMemberRole(chatId),
      data: {'userId': userId, 'role': role},
    );
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  Future<List<ChatMessage>> getMessages({
    required String chatId,
    String? before,
    int limit = 30,
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiEndpoints.chatMessages(chatId),
      queryParameters: {
        'limit': limit,
        if (before != null) 'before': before,
      },
    );
    final items = (_payload(res)['items'] as List?) ?? const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(ChatMessageModel.fromJson)
        .toList();
  }

  Future<ChatMessage> sendMessage({
    required String chatId,
    required String body,
    String? replyToId,
    String? type,
    String? clientId,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.chatMessages(chatId),
      data: {
        'body': body,
        if (replyToId != null) 'replyToId': replyToId,
        if (type != null) 'type': type,
        if (clientId != null) 'clientId': clientId,
      },
    );
    final message = _payload(res)['message'] as Map<String, dynamic>;
    return ChatMessageModel.fromJson(message);
  }

  Future<void> toggleReaction({
    required String messageId,
    required String emoji,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.chatReact(messageId),
      data: {'emoji': emoji},
    );
  }

  Future<ChatMessage?> getPinned({required String chatId}) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.chatPinned(chatId));
    final message = _payload(res)['message'];
    if (message is Map<String, dynamic>) return ChatMessageModel.fromJson(message);
    return null;
  }

  Future<void> markRead({required String chatId}) async {
    await _dio.post<Map<String, dynamic>>(ApiEndpoints.chatRead(chatId));
  }

  // ── Voice ────────────────────────────────────────────────────────────────

  Future<VoiceToken> getVoiceToken({required String chatId}) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.chatVoiceToken,
      data: {'chatId': chatId},
    );
    return VoiceTokenModel.fromJson(_payload(res));
  }

  Future<List<VoiceParticipant>> getVoiceParticipants({required String chatId}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiEndpoints.chatVoiceParticipants(chatId),
    );
    final participants = (_payload(res)['participants'] as List?) ?? const [];
    return participants
        .whereType<Map<String, dynamic>>()
        .map(VoiceParticipantModel.fromJson)
        .toList();
  }

  // ── Moderation ───────────────────────────────────────────────────────────

  Future<void> reportMessage({
    required String messageId,
    required String reason,
    String? details,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.chatReportMessage(messageId),
      data: {'reason': reason, if (details != null) 'details': details},
    );
  }

  Future<void> reportUser({
    required String userId,
    required String reason,
    String? details,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.chatReportUser,
      data: {'userId': userId, 'reason': reason, if (details != null) 'details': details},
    );
  }

  Future<void> moderate(String path, Map<String, dynamic> body) async {
    await _dio.post<Map<String, dynamic>>(path, data: body);
  }
}
