import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/dio_client.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../../auth/presentation/providers/auth_state.dart';
import '../../../chat/data/datasources/chat_socket_service.dart';
import '../../data/datasources/social_remote_datasource.dart';
import '../../data/datasources/social_socket_service.dart';
import '../../data/repositories/social_repository_impl.dart';
import '../../domain/entities/social_entities.dart';
import '../../domain/repositories/social_repository.dart';

// ── Wiring ─────────────────────────────────────────────────────────────────

final socialRemoteDataSourceProvider = Provider<SocialRemoteDataSource>((ref) {
  return SocialRemoteDataSource(ref.watch(dioClientProvider).dio);
});

final socialRepositoryProvider = Provider<SocialRepository>((ref) {
  return SocialRepositoryImpl(
    remoteDataSource: ref.watch(socialRemoteDataSourceProvider),
  );
});

/// The typed social socket service, multiplexed over the shared Socket.IO
/// client. Wires friend/group/invite events to typed streams.
final socialSocketServiceProvider = Provider<SocialSocketService>((ref) {
  final socket = ref.watch(socketIoClientProvider);
  final service = SocialSocketService(socket);
  service.start();
  ref.onDispose(service.dispose);
  return service;
});

/// Keeps the shared socket connected for the authenticated session and starts
/// the social event stream so invites/friend events arrive app-wide.
final socialRealtimeProvider = Provider<void>((ref) {
  final authState = ref.watch(authNotifierProvider);
  if (authState.status == AuthStatus.authenticated) {
    ref.watch(socialSocketServiceProvider);
    final socket = ref.watch(socketIoClientProvider);
    unawaited(socket.connect());
  }
});

// ── Friends data ────────────────────────────────────────────────────────────

/// Full friends overview (friends + requests + blocked), auto-refreshed when a
/// realtime social event arrives.
final friendsOverviewProvider =
    FutureProvider.autoDispose<FriendsOverview>((ref) async {
  final socket = ref.watch(socialSocketServiceProvider);
  final subs = <StreamSubscription<dynamic>>[
    socket.friendRequest.listen((_) => ref.invalidateSelf()),
    socket.friendAccepted.listen((_) => ref.invalidateSelf()),
    socket.friendRemoved.listen((_) => ref.invalidateSelf()),
  ];
  ref.onDispose(() {
    for (final s in subs) {
      s.cancel();
    }
  });

  final result = await ref.watch(socialRepositoryProvider).getFriendsOverview();
  return result.fold(
    (failure) => throw StateError(failure.message),
    (overview) => overview,
  );
});

/// Convenience online-friends list derived from the overview.
final onlineFriendsProvider = Provider.autoDispose<AsyncValue<List<SocialUser>>>((ref) {
  return ref.watch(friendsOverviewProvider).whenData((o) => o.onlineFriends);
});

// ── Groups data ─────────────────────────────────────────────────────────────

/// Groups the current user belongs to, refreshed on realtime group changes.
final groupsListProvider = FutureProvider.autoDispose<List<SocialGroup>>((ref) async {
  final socket = ref.watch(socialSocketServiceProvider);
  final subs = <StreamSubscription<dynamic>>[
    socket.groupChanged.listen((_) => ref.invalidateSelf()),
    socket.groupInvited.listen((_) => ref.invalidateSelf()),
  ];
  ref.onDispose(() {
    for (final s in subs) {
      s.cancel();
    }
  });

  final result = await ref.watch(socialRepositoryProvider).getGroups();
  return result.fold(
    (failure) => throw StateError(failure.message),
    (groups) => groups,
  );
});

/// A single group's full detail; invalidated when that group changes live.
final groupDetailProvider =
    FutureProvider.autoDispose.family<SocialGroup, String>((ref, groupId) async {
  final socket = ref.watch(socialSocketServiceProvider);
  final sub = socket.groupChanged.listen((id) {
    if (id == groupId) ref.invalidateSelf();
  });
  ref.onDispose(sub.cancel);

  final result = await ref.watch(socialRepositoryProvider).getGroup(groupId);
  return result.fold(
    (failure) => throw StateError(failure.message),
    (group) => group,
  );
});

// ── Game invites ────────────────────────────────────────────────────────────

/// Stream of incoming real-time game invites (drives the app-wide dialog).
final gameInvitesProvider = StreamProvider.autoDispose<GameInvite>((ref) {
  final socket = ref.watch(socialSocketServiceProvider);
  return socket.gameInvite;
});

// ── Actions ─────────────────────────────────────────────────────────────────

/// Friend-related mutations. Each returns an error message on failure or null
/// on success, and refreshes the affected data providers.
class SocialActions {
  SocialActions(this._ref);
  final Ref _ref;

  SocialRepository get _repo => _ref.read(socialRepositoryProvider);

  void _refreshFriends() => _ref.invalidate(friendsOverviewProvider);
  void _refreshGroups() => _ref.invalidate(groupsListProvider);

  Future<String?> sendRequest({String? username, String? userId}) =>
      _run(() => _repo.sendFriendRequest(username: username, userId: userId));

  Future<String?> accept(String requestId) =>
      _run(() => _repo.acceptFriendRequest(requestId));

  Future<String?> reject(String requestId) =>
      _run(() => _repo.rejectFriendRequest(requestId));

  Future<String?> cancel(String requestId) =>
      _run(() => _repo.cancelFriendRequest(requestId));

  Future<String?> remove(String friendId) =>
      _run(() => _repo.removeFriend(friendId));

  Future<String?> block({String? username, String? userId}) =>
      _run(() => _repo.blockUser(username: username, userId: userId));

  Future<String?> unblock(String userId) => _run(() => _repo.unblockUser(userId));

  Future<String?> _run(Future<dynamic> Function() call) async {
    final result = await call();
    return (result as dynamic).fold(
      (failure) => failure.message as String?,
      (_) {
        _refreshFriends();
        return null;
      },
    );
  }
}

final socialActionsProvider = Provider<SocialActions>((ref) => SocialActions(ref));
