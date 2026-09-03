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

  Future<AuthResponseModel> socialLogin({
    required String path,
    required String idToken,
    String? displayName,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      path,
      data: {
        'idToken': idToken,
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

  Future<Map<String, dynamic>> fetchCurrentUser() async {
    final response = await _dio.get<Map<String, dynamic>>(ApiEndpoints.me);
    return response.data?['data'] as Map<String, dynamic>? ?? const {};
  }

  Future<void> logout({required String refreshToken}) async {
    await _dio.post<dynamic>(ApiEndpoints.logout, data: {'refreshToken': refreshToken});
  }
}
