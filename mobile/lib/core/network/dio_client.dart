import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/app_constants.dart';
import '../services/api_host_service.dart';
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
  DioClient({required TokenStore tokenStore, required String baseUrl})
      : _tokenStore = tokenStore {
    _dio = Dio(
      BaseOptions(
        baseUrl: '$baseUrl${AppConstants.apiPrefix}',
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

  /// Single-flight guard: concurrent 401s must share ONE rotation. The
  /// refresh token is single-use — if two requests rotated at the same
  /// time, the second would present an already-invalidated token, be
  /// rejected, and log the user out despite a perfectly healthy session.
  Future<String>? _refreshInFlight;

  Dio get dio => _dio;

  /// Closes the underlying HttpClient (called when the server override
  /// changes and a fresh [DioClient] is built).
  void dispose() {
    _dio.close();
  }

  Future<String> _rotateTokens() {
    return _refreshInFlight ??=
        _doRotateTokens().whenComplete(() => _refreshInFlight = null);
  }

  Future<String> _doRotateTokens() async {
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

/// Recreated when the (runtime) server override changes, so every request
/// follows the new origin.
final dioClientProvider = Provider<DioClient>((ref) {
  final baseUrl = ref.watch(apiBaseUrlProvider);
  final storage = ref.watch(secureTokenStorageProvider);
  final client = DioClient(tokenStore: SecureTokenStore(storage), baseUrl: baseUrl);
  ref.onDispose(client.dispose);
  return client;
});
