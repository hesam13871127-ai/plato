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
    required super.gems,
    required super.avatarUrl,
    required super.presence,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as String? ?? '',
      username: json['username'] as String? ?? '',
      displayName: json['displayName'] as String? ?? '',
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      isVerified: json['isVerified'] as bool? ?? false,
      level: _asInt(json['level']),
      xp: _asInt(json['xp']),
      coins: _asInt(json['coins']),
      gems: _asInt(json['gems']),
      avatarUrl: json['avatarUrl'] as String?,
      presence: json['presence'] as String? ?? 'offline',
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
        'gems': gems,
        'avatarUrl': avatarUrl,
        'presence': presence,
      };

  static int _asInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value) ?? 0;
    return 0;
  }
}
