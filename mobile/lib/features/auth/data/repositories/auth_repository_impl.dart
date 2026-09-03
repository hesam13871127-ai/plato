import 'package:dio/dio.dart';
import 'package:fpdart/fpdart.dart';

import '../../../../core/error/error_mapper.dart';
import '../../../../core/error/failures.dart';
import '../../../../core/network/api_endpoints.dart';
import '../../../../core/storage/secure_token_storage.dart';
import '../../domain/entities/auth_user.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/auth_remote_datasource.dart';
import '../datasources/auth_social_datasource.dart';
import '../models/auth_response_model.dart';
import '../models/user_model.dart';

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({
    required AuthRemoteDataSource remoteDataSource,
    required AuthSocialDataSource socialDataSource,
    required SecureTokenStorage tokenStorage,
  })  : _remote = remoteDataSource,
        _social = socialDataSource,
        _tokenStorage = tokenStorage;

  final AuthRemoteDataSource _remote;
  final AuthSocialDataSource _social;
  final SecureTokenStorage _tokenStorage;

  @override
  Future<Either<Failure, void>> requestPhoneOtp({required String phone}) async {
    try {
      await _remote.requestPhoneOtp(phone: phone);
      return const Right(null);
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Future<Either<Failure, AuthResponse>> verifyPhoneOtp({
    required String phone,
    required String code,
    String? displayName,
  }) {
    return _guard(() => _remote.verifyPhoneOtp(
          phone: phone,
          code: code,
          displayName: displayName,
        ));
  }

  @override
  Future<Either<Failure, AuthResponse>> signInWithGoogle() async {
    try {
      final idToken = await _social.googleIdToken();
      return _guard(() => _remote.socialLogin(path: ApiEndpoints.googleLogin, idToken: idToken));
    } on SocialSignInCancelledException {
      return Left(const AuthFailure('Google sign-in was cancelled.'));
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Future<Either<Failure, AuthResponse>> signInWithApple() async {
    try {
      final credential = await _social.appleIdToken();
      return _guard(() => _remote.socialLogin(
            path: ApiEndpoints.appleLogin,
            idToken: credential.idToken,
            displayName: credential.displayName,
          ));
    } on SocialSignInCancelledException {
      return Left(const AuthFailure('Apple sign-in was cancelled.'));
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Future<Either<Failure, AuthResponse>> registerWithEmail({
    required String email,
    required String password,
    required String username,
    required String displayName,
  }) {
    return _guard(() => _remote.registerWithEmail(
          email: email,
          password: password,
          username: username,
          displayName: displayName,
        ));
  }

  @override
  Future<Either<Failure, AuthResponse>> loginWithEmail({
    required String email,
    required String password,
  }) {
    return _guard(() => _remote.loginWithEmail(email: email, password: password));
  }

  @override
  Future<Either<Failure, AuthUser>> getCurrentUser() async {
    try {
      final accessToken = await _tokenStorage.accessToken;
      if (accessToken == null || accessToken.isEmpty) {
        return const Right(AuthUser.anonymous);
      }
      final json = await _remote.fetchCurrentUser();
      return Right(UserModel.fromJson(json));
    } on DioException catch (error) {
      if (error.response?.statusCode == 401) {
        await _tokenStorage.clearTokens();
        return const Right(AuthUser.anonymous);
      }
      return Left(mapErrorToFailure(error));
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Future<Either<Failure, void>> logout() async {
    try {
      final refreshToken = await _tokenStorage.refreshToken;
      if (refreshToken != null && refreshToken.isNotEmpty) {
        await _remote.logout(refreshToken: refreshToken);
      }
      await _tokenStorage.clearTokens();
      return const Right(null);
    } on Object catch (error) {
      // Always clear local credentials even if the network call fails.
      await _tokenStorage.clearTokens();
      return Left(mapErrorToFailure(error));
    }
  }

  /// Runs a remote auth call, persists the returned tokens and converts the
  /// result to a domain [AuthResponse].
  Future<Either<Failure, AuthResponse>> _guard(
    Future<AuthResponseModel> Function() call,
  ) async {
    try {
      final model = await call();
      await _tokenStorage.saveTokens(
        accessToken: model.accessToken,
        refreshToken: model.refreshToken,
      );
      return Right(
        AuthResponse(user: model.user, tokens: model.tokens, isNewUser: model.isNewUser),
      );
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }
}
