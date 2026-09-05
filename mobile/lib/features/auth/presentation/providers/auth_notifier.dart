import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fpdart/fpdart.dart';

import '../../../../core/error/failures.dart';
import '../../domain/entities/auth_user.dart';
import '../../domain/repositories/auth_repository.dart';
import 'auth_providers.dart';
import 'auth_state.dart';

/// Application-level authentication state machine. UI widgets watch this;
/// every action funnels repository results into [AuthState].
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repository) : super(const AuthState());

  final AuthRepository _repository;

  /// Called on app start: restore a session from stored credentials.
  Future<void> checkAuthStatus() async {
    state = state.copyWith(isLoading: true, clearError: true);
    final result = await _repository.getCurrentUser();
    result.fold(
      (failure) => state = state.copyWith(
        status: AuthStatus.unauthenticated,
        isLoading: false,
        errorMessage: failure.message,
      ),
      (user) => state = state.copyWith(
        status: user.isAuthenticated ? AuthStatus.authenticated : AuthStatus.unauthenticated,
        user: user.isAuthenticated ? user : AuthUser.anonymous,
        isLoading: false,
      ),
    );
  }

  Future<bool> requestPhoneOtp(String phone) async {
    state = state.copyWith(isLoading: true, clearError: true);
    final result = await _repository.requestPhoneOtp(phone: phone);
    return result.fold(
      (failure) {
        state = state.copyWith(isLoading: false, errorMessage: failure.message);
        return false;
      },
      (_) {
        state = state.copyWith(isLoading: false, otpSent: true, verificationId: phone);
        return true;
      },
    );
  }

  Future<bool> verifyPhoneOtp({required String code, String? displayName}) async {
    final phone = state.verificationId;
    if (phone == null) {
      state = state.copyWith(errorMessage: 'No phone number found. Please restart.');
      return false;
    }
    state = state.copyWith(isLoading: true, clearError: true);
    return _completeAuth(
      _repository.verifyPhoneOtp(phone: phone, code: code, displayName: displayName),
    );
  }

  Future<bool> registerWithEmail({
    required String email,
    required String password,
    required String username,
    required String displayName,
  }) {
    state = state.copyWith(isLoading: true, clearError: true);
    return _completeAuth(
      _repository.registerWithEmail(
        email: email,
        password: password,
        username: username,
        displayName: displayName,
      ),
    );
  }

  Future<bool> loginWithEmail({required String email, required String password}) {
    state = state.copyWith(isLoading: true, clearError: true);
    return _completeAuth(_repository.loginWithEmail(email: email, password: password));
  }

  /// Re-fetches the current user (wallet, cosmetics, stats) after a mutation.
  Future<void> refreshUser() async {
    final result = await _repository.getCurrentUser();
    result.fold(
      (_) {/* keep existing state on transient refresh errors */},
      (user) {
        if (user.isAuthenticated) {
          state = state.copyWith(user: user, isLoading: false);
        }
      },
    );
  }

  Future<void> logout() async {
    await _repository.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  void resetOtpFlow() {
    state = state.copyWith(otpSent: false, verificationId: null, clearError: true);
  }

  void clearError() => state = state.copyWith(clearError: true);

  Future<bool> _completeAuth(Future<Either<Failure, AuthResponse>> future) async {
    final result = await future;
    return result.fold(
      (failure) {
        state = state.copyWith(isLoading: false, status: AuthStatus.unauthenticated, errorMessage: failure.message);
        return false;
      },
      (response) {
        state = state.copyWith(
          status: AuthStatus.authenticated,
          user: response.user,
          isLoading: false,
          otpSent: false,
        );
        return true;
      },
    );
  }
}

final authNotifierProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authRepositoryProvider));
});
