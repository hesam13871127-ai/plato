import 'package:equatable/equatable.dart';

import '../../domain/entities/auth_user.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState extends Equatable {
  const AuthState({
    this.status = AuthStatus.unknown,
    this.user = AuthUser.anonymous,
    this.isLoading = false,
    this.errorMessage,
    this.otpSent = false,
    this.verificationId,
  });

  final AuthStatus status;
  final AuthUser user;
  final bool isLoading;
  final String? errorMessage;

  /// True once an OTP has been requested and the UI should show the code step.
  final bool otpSent;

  /// Phone number awaiting OTP verification.
  final String? verificationId;

  bool get isAuthenticated => status == AuthStatus.authenticated;

  AuthState copyWith({
    AuthStatus? status,
    AuthUser? user,
    bool? isLoading,
    String? errorMessage,
    bool? otpSent,
    String? verificationId,
    bool clearError = false,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      otpSent: otpSent ?? this.otpSent,
      verificationId: verificationId ?? this.verificationId,
    );
  }

  @override
  List<Object?> get props => [status, user, isLoading, errorMessage, otpSent, verificationId];
}
