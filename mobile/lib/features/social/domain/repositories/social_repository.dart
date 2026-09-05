import 'package:fpdart/fpdart.dart';

import '../../../../core/error/failures.dart';
import '../entities/social_entities.dart';

abstract class SocialRepository {
  // Friends
  Future<Either<Failure, FriendsOverview>> getFriendsOverview();
  Future<Either<Failure, List<SocialUser>>> getOnlineFriends();
  Future<Either<Failure, String>> sendFriendRequest({String? username, String? userId});
  Future<Either<Failure, void>> acceptFriendRequest(String requestId);
  Future<Either<Failure, void>> rejectFriendRequest(String requestId);
  Future<Either<Failure, void>> cancelFriendRequest(String requestId);
  Future<Either<Failure, void>> removeFriend(String friendId);
  Future<Either<Failure, void>> blockUser({String? username, String? userId});
  Future<Either<Failure, void>> unblockUser(String userId);
  Future<Either<Failure, Map<String, FriendRelation>>> relationships(List<String> userIds);

  // Groups
  Future<Either<Failure, List<SocialGroup>>> getGroups();
  Future<Either<Failure, SocialGroup>> getGroup(String groupId);
  Future<Either<Failure, SocialGroup>> createGroup({
    required String name,
    String? description,
    String? avatarUrl,
  });
  Future<Either<Failure, SocialGroup>> updateGroup({
    required String groupId,
    String? name,
    String? description,
    String? avatarUrl,
  });
  Future<Either<Failure, SocialGroup>> addGroupMembers(String groupId, List<String> userIds);
  Future<Either<Failure, SocialGroup>> setGroupRole(String groupId, String userId, GroupRole role);
  Future<Either<Failure, SocialGroup>> transferOwnership(String groupId, String userId);
  Future<Either<Failure, void>> leaveGroup(String groupId);
  Future<Either<Failure, void>> kickGroupMember(String groupId, String userId);
  Future<Either<Failure, void>> disbandGroup(String groupId);

  // Invites
  Future<Either<Failure, int>> inviteToRoom({required String roomId, required List<String> userIds});
  Future<Either<Failure, String>> createPrivateRoomAndInvite({
    required String gameSlug,
    String? name,
    bool isRanked = false,
    List<String> inviteUserIds = const [],
  });
}
