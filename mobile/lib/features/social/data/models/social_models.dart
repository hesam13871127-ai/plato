import '../../domain/entities/social_entities.dart';

/// Data-layer social models. They extend the domain entities and add JSON
/// (de)serialization, mirroring the other features' model layer.

class SocialUserModel extends SocialUser {
  const SocialUserModel({
    required super.id,
    required super.username,
    required super.displayName,
    required super.avatarUrl,
    required super.level,
    required super.online,
    required super.presence,
  });

  factory SocialUserModel.fromJson(Map<String, dynamic> json) {
    final base = SocialUser.fromJson(json);
    return SocialUserModel(
      id: base.id,
      username: base.username,
      displayName: base.displayName,
      avatarUrl: base.avatarUrl,
      level: base.level,
      online: base.online,
      presence: base.presence,
    );
  }
}

class FriendRequestModel extends FriendRequest {
  FriendRequestModel({required super.id, required super.user, required super.createdAt});

  factory FriendRequestModel.fromJson(Map<String, dynamic> json) {
    final base = FriendRequest.fromJson(json);
    return FriendRequestModel(id: base.id, user: base.user, createdAt: base.createdAt);
  }
}

class SocialGroupModel extends SocialGroup {
  const SocialGroupModel({
    required super.id,
    required super.name,
    required super.description,
    required super.avatarUrl,
    required super.ownerId,
    required super.memberCount,
    required super.chatId,
    required super.myRole,
    required super.members,
    required super.createdAt,
  });

  factory SocialGroupModel.fromJson(Map<String, dynamic> json) {
    final base = SocialGroup.fromJson(json);
    return SocialGroupModel(
      id: base.id,
      name: base.name,
      description: base.description,
      avatarUrl: base.avatarUrl,
      ownerId: base.ownerId,
      memberCount: base.memberCount,
      chatId: base.chatId,
      myRole: base.myRole,
      members: base.members,
      createdAt: base.createdAt,
    );
  }
}
