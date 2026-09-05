import 'package:fpdart/fpdart.dart';

import '../../../../core/error/error_mapper.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/social_entities.dart';
import '../../domain/repositories/social_repository.dart';
import '../datasources/social_remote_datasource.dart';
import '../models/social_models.dart';

class SocialRepositoryImpl implements SocialRepository {
  SocialRepositoryImpl({required SocialRemoteDataSource remoteDataSource})
      : _remote = remoteDataSource;

  final SocialRemoteDataSource _remote;

  Future<Either<Failure, T>> _guard<T>(Future<T> Function() call) async {
    try {
      return Right(await call());
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  // ── Friends ─────────────────────────────────────────────────────────────

  @override
  Future<Either<Failure, FriendsOverview>> getFriendsOverview() {
    return _guard(() async {
      final friends = await _remote.friends();
      final requests = await _remote.friendRequests();
      final blocked = await _remote.blocked();
      return FriendsOverview(
        friends: friends.cast<SocialUser>(),
        incoming: requests.incoming
            .map((m) => FriendRequest(id: m.id, user: m.user, createdAt: m.createdAt))
            .toList(),
        outgoing: requests.outgoing
            .map((m) => FriendRequest(id: m.id, user: m.user, createdAt: m.createdAt))
            .toList(),
        blocked: blocked.cast<SocialUser>(),
      );
    });
  }

  @override
  Future<Either<Failure, List<SocialUser>>> getOnlineFriends() {
    return _guard(() async => (await _remote.onlineFriends()).cast<SocialUser>());
  }

  @override
  Future<Either<Failure, String>> sendFriendRequest({String? username, String? userId}) {
    return _guard(() => _remote.sendFriendRequest(username: username, userId: userId));
  }

  @override
  Future<Either<Failure, void>> acceptFriendRequest(String requestId) =>
      _guard(() => _remote.acceptFriendRequest(requestId));

  @override
  Future<Either<Failure, void>> rejectFriendRequest(String requestId) =>
      _guard(() => _remote.rejectFriendRequest(requestId));

  @override
  Future<Either<Failure, void>> cancelFriendRequest(String requestId) =>
      _guard(() => _remote.cancelFriendRequest(requestId));

  @override
  Future<Either<Failure, void>> removeFriend(String friendId) =>
      _guard(() => _remote.removeFriend(friendId));

  @override
  Future<Either<Failure, void>> blockUser({String? username, String? userId}) =>
      _guard(() => _remote.blockUser(username: username, userId: userId));

  @override
  Future<Either<Failure, void>> unblockUser(String userId) =>
      _guard(() => _remote.unblockUser(userId));

  @override
  Future<Either<Failure, Map<String, FriendRelation>>> relationships(List<String> userIds) {
    return _guard(() async {
      final raw = await _remote.relationships(userIds);
      return raw.map((key, value) => MapEntry(key, _relation(value)));
    });
  }

  // ── Groups ────────────────────────────────────────────────────────────────

  @override
  Future<Either<Failure, List<SocialGroup>>> getGroups() {
    return _guard(() async => (await _remote.groups()).cast<SocialGroup>());
  }

  @override
  Future<Either<Failure, SocialGroup>> getGroup(String groupId) {
    return _guard(() async => (await _remote.group(groupId)) as SocialGroup);
  }

  @override
  Future<Either<Failure, SocialGroup>> createGroup({
    required String name,
    String? description,
    String? avatarUrl,
  }) {
    return _guard(() async => (await _remote.createGroup(
          name: name,
          description: description,
          avatarUrl: avatarUrl,
        )) as SocialGroup);
  }

  @override
  Future<Either<Failure, SocialGroup>> updateGroup({
    required String groupId,
    String? name,
    String? description,
    String? avatarUrl,
  }) {
    return _guard(() async => (await _remote.updateGroup(
          groupId: groupId,
          name: name,
          description: description,
          avatarUrl: avatarUrl,
        )) as SocialGroup);
  }

  @override
  Future<Either<Failure, SocialGroup>> addGroupMembers(String groupId, List<String> userIds) {
    return _guard(() async => (await _remote.addMembers(groupId, userIds)) as SocialGroup);
  }

  @override
  Future<Either<Failure, SocialGroup>> setGroupRole(
      String groupId, String userId, GroupRole role) {
    final wire = role == GroupRole.admin ? 'admin' : 'member';
    return _guard(() async => (await _remote.setRole(groupId, userId, wire)) as SocialGroup);
  }

  @override
  Future<Either<Failure, SocialGroup>> transferOwnership(String groupId, String userId) {
    return _guard(() async => (await _remote.transferOwnership(groupId, userId)) as SocialGroup);
  }

  @override
  Future<Either<Failure, void>> leaveGroup(String groupId) =>
      _guard(() => _remote.leaveGroup(groupId));

  @override
  Future<Either<Failure, void>> kickGroupMember(String groupId, String userId) =>
      _guard(() => _remote.kickMember(groupId, userId));

  @override
  Future<Either<Failure, void>> disbandGroup(String groupId) =>
      _guard(() => _remote.disbandGroup(groupId));

  // ── Invites ─────────────────────────────────────────────────────────────

  @override
  Future<Either<Failure, int>> inviteToRoom({required String roomId, required List<String> userIds}) {
    return _guard(() => _remote.inviteToRoom(roomId: roomId, userIds: userIds));
  }

  @override
  Future<Either<Failure, String>> createPrivateRoomAndInvite({
    required String gameSlug,
    String? name,
    bool isRanked = false,
    List<String> inviteUserIds = const [],
  }) {
    return _guard(() => _remote.createPrivateRoomAndInvite(
          gameSlug: gameSlug,
          name: name,
          isRanked: isRanked,
          inviteUserIds: inviteUserIds,
        ));
  }

  FriendRelation _relation(String wire) {
    switch (wire) {
      case 'friends':
        return FriendRelation.friends;
      case 'incoming':
        return FriendRelation.incomingRequest;
      case 'outgoing':
        return FriendRelation.outgoingRequest;
      case 'blocked':
        return FriendRelation.blocked;
      default:
        return FriendRelation.none;
    }
  }
}
