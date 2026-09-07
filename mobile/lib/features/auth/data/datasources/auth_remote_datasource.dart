import 'package:dio/dio.dart';

import '../../../../core/network/api_endpoints.dart';
import '../models/auth_response_model.dart';

/// Thin HTTP client for the auth endpoints. Throws [DioException] on failure;
/// mapping to domain failures happens in the repository.
class AuthRemoteDataSource {
  AuthRemoteDataSource(this._dio);

  final Dio _dio;

  Future<void> requestPhoneOtp({required String phone}) async {
    await _dio.post<dynamic>(
      ApiEndpoints.phoneRequestOtp,
      data: {'phone': phone},
    );
  }

  Future<AuthResponseModel> verifyPhoneOtp({
    required String phone,
    required String code,
    String? displayName,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.phoneVerify,
      data: {
        'phone': phone,
        'code': code,
        if (displayName != null) 'displayName': displayName,
      },
    );
    return AuthResponseModel.fromEnvelope(response.data ?? const {});
  }

  Future<AuthResponseModel> registerWithEmail({
    required String email,
    required String password,
    required String username,
    required String displayName,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.emailRegister,
      data: {
        'email': email,
        'password': password,
        'username': username,
        'displayName': displayName,
      },
    );
    return AuthResponseModel.fromEnvelope(response.data ?? const {});
  }

  Future<AuthResponseModel> loginWithEmail({
    required String email,
    required String password,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.emailLogin,
      data: {'email': email, 'password': password},
    );
    return AuthResponseModel.fromEnvelope(response.data ?? const {});
  }

  /// Sign in with any identifier (email, @username or phone) + password.
  Future<AuthResponseModel> loginWithIdentifier({
    required String identifier,
    required String password,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.login,
      data: {'identifier': identifier, 'password': password},
    );
    return AuthResponseModel.fromEnvelope(response.data ?? const {});
  }

  /// Step 1 of password recovery: send an SMS reset code to the account's phone.
  /// Returns the dev code when the backend runs with the development SMS provider.
  Future<String?> requestPasswordReset({required String phone}) async {
    final response = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.passwordForgot,
      data: {'phone': phone},
    );
    return response.data?['data']?['devCode'] as String?;
  }

  /// Step 2: verify the SMS code and set the new password (signs the user in).
  Future<AuthResponseModel> resetPassword({
    required String phone,
    required String code,
    required String newPassword,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.passwordReset,
      data: {'phone': phone, 'code': code, 'newPassword': newPassword},
    );
    return AuthResponseModel.fromEnvelope(response.data ?? const {});
  }

  /// Attach a password to the current account (used right after phone sign-up).
  Future<void> setPassword({required String newPassword}) async {
    await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.passwordSet,
      data: {'newPassword': newPassword},
    );
  }

  Future<Map<String, dynamic>> fetchCurrentUser() async {
    final response = await _dio.get<Map<String, dynamic>>(ApiEndpoints.me);
    return response.data?['data'] as Map<String, dynamic>? ?? const {};
  }

  Future<void> logout({required String refreshToken}) async {
    await _dio.post<dynamic>(ApiEndpoints.logout, data: {'refreshToken': refreshToken});
  }
}
