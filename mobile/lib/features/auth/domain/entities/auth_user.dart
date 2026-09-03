import 'package:equatable/equatable.dart';

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
    required this.gems,
    required this.avatarUrl,
    required this.presence,
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
  final int gems;
  final String? avatarUrl;
  final String presence;

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
    gems: 0,
    avatarUrl: null,
    presence: 'offline',
  );

  bool get isAuthenticated => id.isNotEmpty;

  @override
  List<Object?> get props => [id, username, displayName, phone, email, isVerified, level, xp, coins, gems, avatarUrl, presence];
}

/// Access + refresh token pair returned by the API.
class TokenPair extends Equatable {
  const TokenPair({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;

  @override
  List<Object?> get props => [accessToken, refreshToken];
}
