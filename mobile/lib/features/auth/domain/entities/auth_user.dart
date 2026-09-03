import 'package:equatable/equatable.dart';

/// A cosmetic item the user has equipped (frame / banner / chat bubble /
/// theme / id color). Mirrors the nested object the backend resolves from the
/// user's inventory. All fields are nullable; [name] identifies the cosmetic.
class EquippedCosmetic extends Equatable {
  const EquippedCosmetic({
    required this.id,
    required this.name,
    this.type,
    this.rarity,
    this.metadata = const {},
  });

  final String? id;
  final String? name;
  final String? type;
  final String? rarity;
  final Map<String, dynamic> metadata;

  factory EquippedCosmetic.fromJson(Map<String, dynamic> json) {
    return EquippedCosmetic(
      id: json['id'] as String?,
      name: json['name'] as String?,
      type: json['type'] as String?,
      rarity: json['rarity'] as String?,
      metadata: (json['metadata'] as Map<String, dynamic>?) ?? const {},
    );
  }

  static EquippedCosmetic? fromJsonOrNull(dynamic value) {
    if (value is Map<String, dynamic>) return EquippedCosmetic.fromJson(value);
    return null;
  }

  @override
  List<Object?> get props => [id, name, type, rarity];
}

/// An achievement badge shown on the profile.
class UserBadge extends Equatable {
  const UserBadge({required this.code, required this.name, this.description});

  final String code;
  final String name;
  final String? description;

  factory UserBadge.fromJson(Map<String, dynamic> json) {
    return UserBadge(
      code: (json['code'] ?? json['id'] ?? '') as String,
      name: (json['name'] ?? json['label'] ?? '') as String,
      description: json['description'] as String?,
    );
  }

  @override
  List<Object?> get props => [code, name];
}

/// The authenticated user as exposed to the domain/presentation layers.
/// Never contains internal fields (isBot, tokens, passwordHash…).
class AuthUser extends Equatable {
  const AuthUser({
    required this.id,
    required this.username,
    required this.displayName,
    required this.phone,
    required this.email,
    required this.isVerified,
    required this.level,
    required this.xp,
    required this.coins,
    required this.pips,
    required this.avatarUrl,
    required this.presence,
    this.bio,
    this.country,
    this.title,
    this.unlockedTitles = const [],
    this.badges = const [],
    this.gamesPlayed = 0,
    this.gamesWon = 0,
    this.gamesLost = 0,
    this.gamesDrawn = 0,
    this.streakDays = 0,
    this.giftsSent = 0,
    this.giftsReceived = 0,
    this.frame,
    this.banner,
    this.chatBubble,
    this.theme,
    this.idColor,
  });

  final String id;
  final String username;
  final String displayName;
  final String? phone;
  final String? email;
  final bool isVerified;
  final int level;
  final int xp;
  final int coins;

  /// Premium currency (renamed from "gems").
  final int pips;

  final String? avatarUrl;
  final String presence;
  final String? bio;
  final String? country;

  /// Currently equipped title (e.g. "Champion").
  final String? title;
  final List<String> unlockedTitles;
  final List<UserBadge> badges;

  final int gamesPlayed;
  final int gamesWon;
  final int gamesLost;
  final int gamesDrawn;
  final int streakDays;
  final int giftsSent;
  final int giftsReceived;

  final EquippedCosmetic? frame;
  final EquippedCosmetic? banner;
  final EquippedCosmetic? chatBubble;
  final EquippedCosmetic? theme;
  final EquippedCosmetic? idColor;

  /// Guest / unauthenticated sentinel.
  static const AuthUser anonymous = AuthUser(
    id: '',
    username: '',
    displayName: '',
    phone: null,
    email: null,
    isVerified: false,
    level: 0,
    xp: 0,
    coins: 0,
    pips: 0,
    avatarUrl: null,
    presence: 'offline',
  );

  bool get isAuthenticated => id.isNotEmpty;

  /// Win/loss ratio as a percentage (0–100), 0 when no games recorded.
  double get winRate =>
      gamesPlayed > 0 ? (gamesWon / gamesPlayed) * 100 : 0;

  @override
  List<Object?> get props => [
        id,
        username,
        displayName,
        phone,
        email,
        isVerified,
        level,
        xp,
        coins,
        pips,
        avatarUrl,
        presence,
        bio,
        country,
        title,
        unlockedTitles,
        badges,
        gamesPlayed,
        gamesWon,
        gamesLost,
        gamesDrawn,
        streakDays,
        giftsSent,
        giftsReceived,
        frame,
        banner,
        chatBubble,
        theme,
        idColor,
      ];
}

/// Access + refresh token pair returned by the API.
class TokenPair extends Equatable {
  const TokenPair({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;

  @override
  List<Object?> get props => [accessToken, refreshToken];
}
