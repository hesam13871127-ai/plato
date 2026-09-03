import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../constants/app_constants.dart';

/// Persists JWT access + refresh tokens in the platform secure/keychain
/// storage (encrypted at rest on both Android and iOS).
class SecureTokenStorage {
  SecureTokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _storage;

  Future<void> saveTokens({required String accessToken, required String refreshToken}) async {
    await _storage.write(key: AppConstants.kAccessToken, value: accessToken);
    await _storage.write(key: AppConstants.kRefreshToken, value: refreshToken);
  }

  Future<String?> get accessToken => _storage.read(key: AppConstants.kAccessToken);

  Future<String?> get refreshToken => _storage.read(key: AppConstants.kRefreshToken);

  Future<void> clearTokens() async {
    await _storage.delete(key: AppConstants.kAccessToken);
    await _storage.delete(key: AppConstants.kRefreshToken);
  }
}
