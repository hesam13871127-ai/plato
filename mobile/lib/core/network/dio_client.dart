import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/app_constants.dart';
import '../storage/secure_token_storage.dart';
import 'api_endpoints.dart';

/// Thrown by the refresh flow to signal that re-authentication is required.
class RefreshException implements Exception {
  const RefreshException(this.message);
  final String message;
}

/// Provides a configured [Dio] instance with:
///  - base URL + JSON headers
///  - bearer-token injection
///  - automatic 401 handling: transparent refresh-token rotation, one retry,
///    and logout on refresh failure.
class DioClient {
  DioClient({required TokenStore tokenStore}) : _tokenStore = tokenStore {
    _dio = Dio(
      BaseOptions(
        baseUrl: '${AppConstants.apiBaseUrl}${AppConstants.apiPrefix}',
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
      ),
    );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _tokenStore.accessToken;
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode != 401 || error.requestOptions.path.contains(ApiEndpoints.refresh)) {
            return handler.next(error);
          }
          try {
            final newAccessToken = await _rotateTokens();
            final requestOptions = error.requestOptions;
            requestOptions.headers['Authorization'] = 'Bearer $newAccessToken';
            final response = await _dio.fetch<dynamic>(requestOptions);
            return handler.resolve(response);
          } on RefreshException {
            return handler.next(error);
          }
        },
      ),
    );
  }

  late final Dio _dio;
  final TokenStore _tokenStore;

  Dio get dio => _dio;

  Future<String> _rotateTokens() async {
    final refreshToken = await _tokenStore.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) {
      throw const RefreshException('No refresh token available.');
    }

    try {
      final response = await _dio.post<Map<String, dynamic>>(
        ApiEndpoints.refresh,
        data: {'refreshToken': refreshToken},
        options: Options(headers: {'Authorization': ''}),
      );

      final data = response.data?['data'] as Map<String, dynamic>?;
      final accessToken = data?['accessToken'] as String?;
      final newRefreshToken = data?['refreshToken'] as String?;
      if (accessToken == null || newRefreshToken == null) {
        throw const RefreshException('Malformed refresh response.');
      }
      await _tokenStore.saveTokens(accessToken: accessToken, refreshToken: newRefreshToken);
      return accessToken;
    } on DioException {
      await _tokenStore.clearTokens();
      throw const RefreshException('Refresh token rejected.');
    }
  }
}

/// Minimal token-store contract so [DioClient] does not depend on storage impl.
abstract interface class TokenStore {
  Future<String?> get accessToken;
  Future<String?> get refreshToken;
  Future<void> saveTokens({required String accessToken, required String refreshToken});
  Future<void> clearTokens();
}

/// Ties the concrete secure storage to the [TokenStore] contract.
class SecureTokenStore implements TokenStore {
  SecureTokenStore(this._storage);
  final SecureTokenStorage _storage;

  @override
  Future<String?> get accessToken => _storage.accessToken;

  @override
  Future<String?> get refreshToken => _storage.refreshToken;

  @override
  Future<void> saveTokens({required String accessToken, required String refreshToken}) =>
      _storage.saveTokens(accessToken: accessToken, refreshToken: refreshToken);

  @override
  Future<void> clearTokens() => _storage.clearTokens();
}

final secureTokenStorageProvider = Provider<SecureTokenStorage>((ref) => SecureTokenStorage());

final dioClientProvider = Provider<DioClient>((ref) {
  final storage = ref.watch(secureTokenStorageProvider);
  return DioClient(tokenStore: SecureTokenStore(storage));
});
