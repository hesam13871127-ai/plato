import 'package:equatable/equatable.dart';

/// Live presence status shared by social user cards.
enum SocialPresence { offline, online, inGame, away }

/// A compact, presence-aware user card used across friends, groups and invites.
class SocialUser extends Equatable {
  const SocialUser({
    required this.id,
    required this.username,
    required this.displayName,
    required this.avatarUrl,
    required this.level,
    required this.online,
    this.presence = SocialPresence.offline,
  });

  final String id;
  final String username;
  final String displayName;
  final String? avatarUrl;
  final int level;
  final bool online;
  final SocialPresence presence;

  factory SocialUser.fromJson(Map<String, dynamic> json) {
    return SocialUser(
      id: json['id']?.toString() ?? '',
      username: json['username']?.toString() ?? '',
      displayName: json['displayName']?.toString() ?? 'Player',
      avatarUrl: json['avatarUrl']?.toString(),
      level: (json['level'] as num?)?.toInt() ?? 1,
      online: json['online'] == true,
      presence: _presence(json['presence']?.toString()),
    );
  }

  static SocialPresence _presence(String? value) {
    switch (value) {
      case 'online':
        return SocialPresence.online;
      case 'in_game':
        return SocialPresence.inGame;
      case 'away':
        return SocialPresence.away;
      default:
        return SocialPresence.offline;
    }
  }

  @override
  List<Object?> get props => [id, username, displayName, avatarUrl, level, online, presence];
}

/// Direction-agnostic friendship status surfaced to the UI.
enum FriendRelation { none, friends, incomingRequest, outgoingRequest, blocked }

/// A pending friend request with the counterparty user.
class FriendRequest extends Equatable {
  const FriendRequest({required this.id, required this.user, required this.createdAt});

  final String id;
  final SocialUser user;
  final DateTime createdAt;

  factory FriendRequest.fromJson(Map<String, dynamic> json) {
    return FriendRequest(
      id: json['id']?.toString() ?? '',
      user: SocialUser.fromJson(Map<String, dynamic>.from(json['user'] as Map? ?? const {})),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '')?.toLocal() ??
          DateTime.fromMillisecondsSinceEpoch(0),
    );
  }

  @override
  List<Object?> get props => [id, user, createdAt];
}

/// All friend-related data needed by the friends screen.
class FriendsOverview extends Equatable {
  const FriendsOverview({
    required this.friends,
    required this.incoming,
    required this.outgoing,
    required this.blocked,
  });

  final List<SocialUser> friends;
  final List<FriendRequest> incoming;
  final List<FriendRequest> outgoing;
  final List<SocialUser> blocked;

  List<SocialUser> get onlineFriends => friends.where((f) => f.online).toList();

  @override
  List<Object?> get props => [friends, incoming, outgoing, blocked];
}

/// Role within a group/club.
enum GroupRole { owner, admin, member }

GroupRole groupRoleFromString(String? value) {
  switch (value) {
    case 'owner':
      return GroupRole.owner;
    case 'admin':
      return GroupRole.admin;
    default:
      return GroupRole.member;
  }
}

/// A group member (user card + role).
class GroupMember extends Equatable {
  const GroupMember({required this.user, required this.role, required this.joinedAt});

  final SocialUser user;
  final GroupRole role;
  final DateTime joinedAt;

  factory GroupMember.fromJson(Map<String, dynamic> json) {
    return GroupMember(
      user: SocialUser.fromJson(json),
      role: groupRoleFromString(json['role']?.toString()),
      joinedAt: DateTime.tryParse(json['joinedAt']?.toString() ?? '')?.toLocal() ??
          DateTime.fromMillisecondsSinceEpoch(0),
    );
  }

  @override
  List<Object?> get props => [user, role, joinedAt];
}

/// A social group/club with its linked group chat.
class SocialGroup extends Equatable {
  const SocialGroup({
    required this.id,
    required this.name,
    required this.description,
    required this.avatarUrl,
    required this.ownerId,
    required this.memberCount,
    required this.chatId,
    required this.myRole,
    required this.members,
    required this.createdAt,
  });

  final String id;
  final String name;
  final String? description;
  final String? avatarUrl;
  final String ownerId;
  final int memberCount;
  final String? chatId;
  final GroupRole myRole;
  final List<GroupMember> members;
  final DateTime createdAt;

  bool get isOwner => myRole == GroupRole.owner;
  bool get isManager => myRole == GroupRole.owner || myRole == GroupRole.admin;

  factory SocialGroup.fromJson(Map<String, dynamic> json) {
    final rawMembers = (json['members'] as List?) ?? const [];
    return SocialGroup(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      description: json['description']?.toString(),
      avatarUrl: json['avatarUrl']?.toString(),
      ownerId: json['ownerId']?.toString() ?? '',
      memberCount: (json['memberCount'] as num?)?.toInt() ?? 0,
      chatId: json['chatId']?.toString(),
      myRole: groupRoleFromString(json['role']?.toString()),
      members: rawMembers
          .whereType<Map>()
          .map((e) => GroupMember.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '')?.toLocal() ??
          DateTime.fromMillisecondsSinceEpoch(0),
    );
  }

  @override
  List<Object?> get props =>
      [id, name, description, avatarUrl, ownerId, memberCount, chatId, myRole, members, createdAt];
}

/// A real-time game/room invitation.
class GameInvite extends Equatable {
  const GameInvite({
    required this.roomId,
    required this.accessCode,
    required this.gameSlug,
    required this.gameName,
    required this.roomName,
    required this.inviterName,
    required this.inviterId,
    required this.inviterAvatar,
    required this.inviteUrl,
  });

  final String roomId;
  final String? accessCode;
  final String gameSlug;
  final String gameName;
  final String? roomName;
  final String inviterName;
  final String inviterId;
  final String? inviterAvatar;
  final String inviteUrl;

  factory GameInvite.fromJson(Map<String, dynamic> json) {
    final inviter = Map<String, dynamic>.from(json['inviter'] as Map? ?? const {});
    return GameInvite(
      roomId: json['roomId']?.toString() ?? '',
      accessCode: json['accessCode']?.toString(),
      gameSlug: json['gameSlug']?.toString() ?? '',
      gameName: json['gameName']?.toString() ?? 'Game',
      roomName: json['roomName']?.toString(),
      inviterName: inviter['displayName']?.toString() ?? 'A friend',
      inviterId: inviter['id']?.toString() ?? '',
      inviterAvatar: inviter['avatarUrl']?.toString(),
      inviteUrl: json['inviteUrl']?.toString() ?? '',
    );
  }

  @override
  List<Object?> get props =>
      [roomId, accessCode, gameSlug, gameName, roomName, inviterName, inviterId, inviterAvatar, inviteUrl];
}
