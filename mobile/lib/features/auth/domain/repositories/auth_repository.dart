import 'package:fpdart/fpdart.dart';

import '../../../../core/error/failures.dart';
import '../entities/auth_user.dart';

/// Authentication boundary — the domain layer depends on this abstraction,
/// never on Dio or Firebase/social plugins directly.
abstract interface class AuthRepository {
  /// Request an SMS one-time code for [phone] (E.164).
  Future<Either<Failure, void>> requestPhoneOtp({required String phone});

  /// Verify the SMS [code] and sign in / register.
  Future<Either<Failure, AuthResponse>> verifyPhoneOtp({
    required String phone,
    required String code,
    String? displayName,
  });

  /// Register with email + password.
  Future<Either<Failure, AuthResponse>> registerWithEmail({
    required String email,
    required String password,
    required String username,
    required String displayName,
  });

  /// Sign in with email + password.
  Future<Either<Failure, AuthResponse>> loginWithEmail({
    required String email,
    required String password,
  });

  /// Sign in with email, username or phone + password.
  Future<Either<Failure, AuthResponse>> loginWithIdentifier({
    required String identifier,
    required String password,
  });

  /// Request an SMS password-reset code. The returned [String] (non-null only
  /// in dev mode) is the code itself, shown to the player directly.
  Future<Either<Failure, String?>> requestPasswordReset({required String phone});

  /// Verify the SMS code, set the new password and sign in.
  Future<Either<Failure, AuthResponse>> resetPassword({
    required String phone,
    required String code,
    required String newPassword,
  });

  /// Attach a password to the current (freshly phone-verified) account.
  Future<Either<Failure, void>> setPassword({required String newPassword});

  /// Load the currently persisted user (by validating the stored token).
  Future<Either<Failure, AuthUser>> getCurrentUser();

  /// Revoke the refresh token and clear local credentials.
  Future<Either<Failure, void>> logout();
}

/// Result of a successful authentication.
class AuthResponse {
  const AuthResponse({required this.user, required this.tokens, required this.isNewUser});

  final AuthUser user;
  final TokenPair tokens;
  final bool isNewUser;
}
