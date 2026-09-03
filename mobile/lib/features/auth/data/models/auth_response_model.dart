import '../../domain/entities/auth_user.dart';
import 'user_model.dart';

/// Response of all sign-in/registration endpoints:
/// `{ data: { user, tokens: { accessToken, refreshToken }, isNewUser } }`.
class AuthResponseModel {
  AuthResponseModel({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
    required this.isNewUser,
  });

  final AuthUser user;
  final String accessToken;
  final String refreshToken;
  final bool isNewUser;

  TokenPair get tokens => TokenPair(accessToken: accessToken, refreshToken: refreshToken);

  factory AuthResponseModel.fromEnvelope(Map<String, dynamic> envelope) {
    final data = envelope['data'] as Map<String, dynamic>? ?? envelope;
    final tokens = data['tokens'] as Map<String, dynamic>? ?? const {};
    return AuthResponseModel(
      user: UserModel.fromJson(data['user'] as Map<String, dynamic>? ?? const {}),
      accessToken: tokens['accessToken'] as String? ?? '',
      refreshToken: tokens['refreshToken'] as String? ?? '',
      isNewUser: data['isNewUser'] as bool? ?? false,
    );
  }
}
