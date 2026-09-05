import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/dio_client.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../../auth/presentation/providers/auth_state.dart';
import '../../data/datasources/chat_remote_datasource.dart';
import '../../data/datasources/chat_socket_service.dart';
import '../../data/repositories/chat_repository_impl.dart';
import '../../domain/entities/chat_entities.dart';
import '../../domain/repositories/chat_repository.dart';

// ── Wiring ──────────────────────────────────────────────────────────────────

final chatRemoteDataSourceProvider = Provider<ChatRemoteDataSource>((ref) {
  return ChatRemoteDataSource(ref.watch(dioClientProvider).dio);
});

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  return ChatRepositoryImpl(
    remote: ref.watch(chatRemoteDataSourceProvider),
    socket: ref.watch(chatSocketServiceProvider),
  );
});

/// Establishes the real-time connection once the user is authenticated and
/// tears it down on logout. Kept alive for the whole authenticated session.
final chatConnectionProvider = Provider<void>((ref) {
  final authState = ref.watch(authNotifierProvider);
  final socket = ref.watch(chatSocketServiceProvider);

  if (authState.status == AuthStatus.authenticated) {
    // Fire-and-forget; the client auto-reconnects on failure.
    unawaited(socket.connect());
    ref.onDispose(socket.disconnect);
  }
});

/// The current socket connection status (true = connected).
final socketConnectedProvider = StreamProvider<bool>((ref) {
  ref.watch(chatConnectionProvider);
  final socket = ref.watch(chatSocketServiceProvider);
  final controller = StreamController<bool>();
  controller.add(socket.connected);
  final sub = socket.connection.listen(controller.add);
  ref.onDispose(() {
    unawaited(sub.cancel());
    unawaited(controller.close());
  });
  return controller.stream;
});

// ── Inbox ───────────────────────────────────────────────────────────────────

final conversationsProvider = FutureProvider<List<ChatConversation>>((ref) async {
  ref.watch(chatConnectionProvider);
  final socket = ref.watch(chatSocketServiceProvider);
  final repo = ref.watch(chatRepositoryProvider);

  // Refresh the inbox whenever a background message arrives for a chat that
  // isn't currently open (unread badge + last-message preview stay live).
  final notifSub = socket.notifications.listen((_) {
    ref.invalidateSelf();
  });
  ref.onDispose(notifSub.cancel);

  final result = await repo.getConversations();
  return result.fold(
    (failure) => throw StateError(failure.message),
    (conversations) => conversations,
  );
});

/// Ensures the public Lounge exists and returns its conversation summary.
final loungeChatProvider = FutureProvider<ChatConversation>((ref) async {
  ref.watch(chatConnectionProvider);
  final repo = ref.watch(chatRepositoryProvider);
  final result = await repo.getLounge();
  return result.fold(
    (failure) => throw StateError(failure.message),
    (chat) => chat,
  );
});

/// Members of a specific chat.
final chatMembersProvider =
    FutureProvider.family<List<ChatMember>, String>((ref, chatId) async {
  final repo = ref.watch(chatRepositoryProvider);
  final result = await repo.getMembers(chatId: chatId);
  return result.fold(
    (failure) => throw StateError(failure.message),
    (members) => members,
  );
});

/// Pinned message for a chat.
final pinnedMessageProvider =
    FutureProvider.family<ChatMessage?, String>((ref, chatId) async {
  final repo = ref.watch(chatRepositoryProvider);
  final result = await repo.getPinned(chatId: chatId);
  return result.fold(
    (failure) => throw StateError(failure.message),
    (message) => message,
  );
});
