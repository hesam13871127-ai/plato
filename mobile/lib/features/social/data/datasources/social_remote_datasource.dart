import 'package:dio/dio.dart';

import '../../../../core/network/api_endpoints.dart';
import '../models/social_models.dart';

/// REST client for `/api/social`: friendships, groups/clubs and game invites.
class SocialRemoteDataSource {
  SocialRemoteDataSource(this._dio);

  final Dio _dio;

  /// Unwraps the global `{ success, data }` envelope; `data` may be a Map or a
  /// List depending on the endpoint, so it is returned untyped.
  dynamic _data(Response<Map<String, dynamic>> res) => res.data?['data'];

  Map<String, dynamic> _payload(Response<Map<String, dynamic>> res) {
    final d = _data(res);
    return d is Map<String, dynamic> ? d : <String, dynamic>{};
  }

  // ── Friends ────────────────────────────────────────────────────────────

  Future<List<SocialUserModel>> friends() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.socialFriends);
    final items = (_data(res) as List?);
    return _users(items);
  }

  Future<List<SocialUserModel>> onlineFriends() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.socialFriendsOnline);
    final items = (_data(res) as List?);
    return _users(items);
  }

  Future<({List<FriendRequestModel> incoming, List<FriendRequestModel> outgoing})>
      friendRequests() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.socialFriendRequests);
    final data = res.data?['data'] as Map<String, dynamic>? ?? const {};
    return (
      incoming: _requests(data['incoming']),
      outgoing: _requests(data['outgoing']),
    );
  }

  Future<List<SocialUserModel>> blocked() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.socialFriendsBlocked);
    final items = (_data(res) as List?);
    return _users(items);
  }

  Future<Map<String, String>> relationships(List<String> userIds) async {
    if (userIds.isEmpty) return const {};
    final res = await _dio.get<Map<String, dynamic>>(
      ApiEndpoints.socialFriendRelationships,
      queryParameters: {'ids': userIds.join(',')},
    );
    final data = res.data?['data'] as Map<String, dynamic>? ?? const {};
    return data.map((key, value) => MapEntry(key, value?.toString() ?? 'none'));
  }

  Future<String> sendFriendRequest({String? username, String? userId}) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.socialFriendRequests,
      data: {
        if (username != null && username.isNotEmpty) 'username': username,
        if (userId != null && userId.isNotEmpty) 'userId': userId,
      },
    );
    return _payload(res)['requestId']?.toString() ?? '';
  }

  Future<void> acceptFriendRequest(String id) =>
      _dio.post(ApiEndpoints.socialFriendAccept(id));

  Future<void> rejectFriendRequest(String id) =>
      _dio.post(ApiEndpoints.socialFriendReject(id));

  Future<void> cancelFriendRequest(String id) =>
      _dio.delete(ApiEndpoints.socialFriendCancel(id));

  Future<void> removeFriend(String friendId) =>
      _dio.post(ApiEndpoints.socialFriendRemove, data: {'friendId': friendId});

  Future<void> blockUser({String? username, String? userId}) =>
      _dio.post(ApiEndpoints.socialFriendBlock, data: {
        if (username != null && username.isNotEmpty) 'username': username,
        if (userId != null && userId.isNotEmpty) 'userId': userId,
      });

  Future<void> unblockUser(String userId) =>
      _dio.post(ApiEndpoints.socialFriendUnblock(userId));

  // ── Groups ─────────────────────────────────────────────────────────────

  Future<List<SocialGroupModel>> groups() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.socialGroups);
    final items = (_data(res) as List?);
    return items
        ?.whereType<Map>()
        .map((e) => SocialGroupModel.fromJson(Map<String, dynamic>.from(e)))
        .toList() ??
        const [];
  }

  Future<SocialGroupModel> group(String id) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.socialGroup(id));
    return SocialGroupModel.fromJson(_payload(res));
  }

  Future<SocialGroupModel> createGroup({
    required String name,
    String? description,
    String? avatarUrl,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(ApiEndpoints.socialGroups, data: {
      'name': name,
      if (description != null) 'description': description,
      if (avatarUrl != null) 'avatarUrl': avatarUrl,
    });
    final data = _payload(res);
    // Controller returns the group directly (possibly wrapped under `group`).
    final groupJson = data['group'] is Map ? Map<String, dynamic>.from(data['group'] as Map) : data;
    return SocialGroupModel.fromJson(groupJson);
  }

  Future<SocialGroupModel> updateGroup({
    required String groupId,
    String? name,
    String? description,
    String? avatarUrl,
  }) async {
    await _dio.patch(ApiEndpoints.socialGroup(groupId), data: {
      if (name != null) 'name': name,
      if (description != null) 'description': description,
      if (avatarUrl != null) 'avatarUrl': avatarUrl,
    });
    return group(groupId);
  }

  Future<SocialGroupModel> addMembers(String groupId, List<String> userIds) async {
    await _dio.post(ApiEndpoints.socialGroupMembers(groupId), data: {'userIds': userIds});
    return group(groupId);
  }

  Future<SocialGroupModel> setRole(String groupId, String userId, String role) async {
    await _dio.post(ApiEndpoints.socialGroupRoles(groupId),
        data: {'userId': userId, 'role': role});
    return group(groupId);
  }

  Future<SocialGroupModel> transferOwnership(String groupId, String userId) async {
    await _dio.post(ApiEndpoints.socialGroupTransfer(groupId, userId));
    return group(groupId);
  }

  Future<void> leaveGroup(String groupId) =>
      _dio.post(ApiEndpoints.socialGroupLeave(groupId));

  Future<void> kickMember(String groupId, String userId) =>
      _dio.delete(ApiEndpoints.socialGroupMember(groupId, userId));

  Future<void> disbandGroup(String groupId) =>
      _dio.delete(ApiEndpoints.socialGroup(groupId));

  // ── Invites ────────────────────────────────────────────────────────────

  Future<int> inviteToRoom({required String roomId, required List<String> userIds}) async {
    final res = await _dio.post<Map<String, dynamic>>(ApiEndpoints.socialInviteRoom, data: {
      'roomId': roomId,
      'userIds': userIds,
    });
    final invited = (_payload(res)['invited'] as List?) ?? const [];
    return invited.length;
  }

  Future<String> createPrivateRoomAndInvite({
    required String gameSlug,
    String? name,
    bool isRanked = false,
    List<String> inviteUserIds = const [],
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(ApiEndpoints.socialInviteRoomCreate, data: {
      'gameSlug': gameSlug,
      if (name != null) 'name': name,
      'isRanked': isRanked,
      if (inviteUserIds.isNotEmpty) 'inviteUserIds': inviteUserIds,
    });
    final room = _payload(res)['room'];
    final roomMap = room is Map ? Map<String, dynamic>.from(room) : <String, dynamic>{};
    return roomMap['id']?.toString() ?? '';
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  List<SocialUserModel> _users(List? items) =>
      items
          ?.whereType<Map>()
          .map((e) => SocialUserModel.fromJson(Map<String, dynamic>.from(e)))
          .toList() ??
      const <SocialUserModel>[];

  List<FriendRequestModel> _requests(dynamic items) =>
      (items as List?)
          ?.whereType<Map>()
          .map((e) => FriendRequestModel.fromJson(Map<String, dynamic>.from(e)))
          .toList() ??
      const <FriendRequestModel>[];
}
