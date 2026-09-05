import 'package:fpdart/fpdart.dart';

import '../../../../core/error/failures.dart';
import '../entities/chat_entities.dart';

/// Real-time + REST contract for the chat feature.
///
/// REST calls return [Either] failures; live socket events are exposed as
/// streams (see [ChatSocketService]) so the UI stays synchronised in real time.
abstract class ChatRepository {
  // Inbox / discovery
  Future<Either<Failure, List<ChatConversation>>> getConversations();
  Future<Either<Failure, ChatConversation>> getLounge();

  // Creation / membership
  Future<Either<Failure, ChatConversation>> openDirectChat({required String userId});
  Future<Either<Failure, ChatConversation>> createGroup({
    required String title,
    String? accessPass,
    List<String>? memberIds,
  });
  Future<Either<Failure, void>> joinChat({required String chatId, String? pass});
  Future<Either<Failure, void>> leaveChat({required String chatId});
  Future<Either<Failure, List<ChatMember>>> getMembers({required String chatId});
  Future<Either<Failure, void>> setChatSettings({
    required String chatId,
    required String themeKey,
  });
  Future<Either<Failure, void>> setMemberRole({
    required String chatId,
    required String userId,
    required String role,
  });

  // Messages
  Future<Either<Failure, List<ChatMessage>>> getMessages({
    required String chatId,
    String? before,
    int limit = 30,
  });
  Future<Either<Failure, ChatMessage>> sendMessage({
    required String chatId,
    required String body,
    String? replyToId,
    String? type,
    String? clientId,
  });
  Future<Either<Failure, ChatMessage>> editMessage({
    required String messageId,
    required String body,
  });
  Future<Either<Failure, void>> deleteMessage({required String messageId});
  Future<Either<Failure, void>> toggleReaction({
    required String messageId,
    required String emoji,
  });
  Future<Either<Failure, void>> setPinned({
    required String messageId,
    required bool pinned,
  });
  Future<Either<Failure, ChatMessage?>> getPinned({required String chatId});
  Future<Either<Failure, void>> markRead({required String chatId});

  // Voice
  Future<Either<Failure, VoiceToken>> getVoiceToken({required String chatId});
  Future<Either<Failure, List<VoiceParticipant>>> getVoiceParticipants({
    required String chatId,
  });

  // Moderation
  Future<Either<Failure, void>> reportMessage({
    required String messageId,
    required String reason,
  });
  Future<Either<Failure, void>> reportUser({
    required String userId,
    required String reason,
  });
  Future<Either<Failure, void>> muteMember({
    required String chatId,
    required String userId,
    int? durationMinutes,
  });
  Future<Either<Failure, void>> unmuteMember({
    required String chatId,
    required String userId,
  });
  Future<Either<Failure, void>> banUser({
    required String chatId,
    required String userId,
    String? reason,
    int? durationDays,
  });
  Future<Either<Failure, void>> kickUser({
    required String chatId,
    required String userId,
  });
}
