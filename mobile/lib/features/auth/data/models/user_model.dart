import '../../domain/entities/auth_user.dart';

/// JSON (de)serialisation for [AuthUser]. Matches the backend `UserDto`.
class UserModel extends AuthUser {
  const UserModel({
    required super.id,
    required super.username,
    required super.displayName,
    required super.phone,
    required super.email,
    required super.isVerified,
    required super.level,
    required super.xp,
    required super.coins,
    required super.pips,
    required super.avatarUrl,
    required super.presence,
    super.bio,
    super.country,
    super.title,
    super.unlockedTitles = const [],
    super.badges = const [],
    super.gamesPlayed,
    super.gamesWon,
    super.gamesLost,
    super.gamesDrawn,
    super.streakDays,
    super.giftsSent,
    super.giftsReceived,
    super.frame,
    super.banner,
    super.chatBubble,
    super.theme,
    super.idColor,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as String? ?? '',
      username: json['username'] as String? ?? '',
      displayName: json['displayName'] as String? ?? '',
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      isVerified: json['isVerified'] as bool? ?? false,
      level: _asInt(json['level'], fallback: 1),
      xp: _asInt(json['xp']),
      coins: _asInt(json['coins']),
      // Premium currency: backend renamed "gems" → "pips" (fallback for old).
      pips: _asInt(json['pips'] ?? json['gems']),
      avatarUrl: json['avatarUrl'] as String?,
      presence: json['presence'] as String? ?? 'offline',
      bio: json['bio'] as String?,
      country: json['country'] as String?,
      title: json['title'] as String?,
      unlockedTitles: _asStringList(json['unlockedTitles']),
      badges: _asBadgeList(json['badges']),
      gamesPlayed: _asInt(json['gamesPlayed']),
      gamesWon: _asInt(json['gamesWon']),
      gamesLost: _asInt(json['gamesLost']),
      gamesDrawn: _asInt(json['gamesDrawn']),
      streakDays: _asInt(json['streakDays']),
      giftsSent: _asInt(json['giftsSent']),
      giftsReceived: _asInt(json['giftsReceived']),
      frame: EquippedCosmetic.fromJsonOrNull(json['frame']),
      banner: EquippedCosmetic.fromJsonOrNull(json['banner']),
      chatBubble: EquippedCosmetic.fromJsonOrNull(json['chatBubble']),
      theme: EquippedCosmetic.fromJsonOrNull(json['theme']),
      idColor: EquippedCosmetic.fromJsonOrNull(json['idColor']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'displayName': displayName,
        'phone': phone,
        'email': email,
        'isVerified': isVerified,
        'level': level,
        'xp': xp,
        'coins': coins,
        'pips': pips,
        'avatarUrl': avatarUrl,
        'presence': presence,
        'bio': bio,
        'country': country,
        'title': title,
        'unlockedTitles': unlockedTitles,
        'badges': badges
            .map((b) => {'code': b.code, 'name': b.name, 'description': b.description})
            .toList(),
        'gamesPlayed': gamesPlayed,
        'gamesWon': gamesWon,
        'gamesLost': gamesLost,
        'gamesDrawn': gamesDrawn,
        'streakDays': streakDays,
        'giftsSent': giftsSent,
        'giftsReceived': giftsReceived,
      };

  static int _asInt(dynamic value, {int fallback = 0}) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value) ?? fallback;
    return fallback;
  }

  static List<String> _asStringList(dynamic value) {
    if (value is List) {
      return value.whereType<String>().toList();
    }
    return const [];
  }

  static List<UserBadge> _asBadgeList(dynamic value) {
    if (value is List) {
      return value
          .whereType<Map<String, dynamic>>()
          .map(UserBadge.fromJson)
          .toList();
    }
    return const [];
  }
}
