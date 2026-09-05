import '../constants/app_constants.dart';
import 'kv_storage.dart';
import 'platform_kv_storage.dart';

/// Persists JWT access + refresh tokens.
///
/// On native platforms this uses encrypted secure storage (Keychain /
/// EncryptedSharedPreferences); on web it falls back to browser `localStorage`.
/// The platform difference is handled by the injected [KvStorage].
class SecureTokenStorage {
  SecureTokenStorage({KvStorage? storage}) : _storage = storage ?? createKvStorage();

  final KvStorage _storage;

  Future<void> saveTokens({required String accessToken, required String refreshToken}) async {
    await _storage.write(AppConstants.kAccessToken, accessToken);
    await _storage.write(AppConstants.kRefreshToken, refreshToken);
  }

  Future<String?> get accessToken => _storage.read(AppConstants.kAccessToken);

  Future<String?> get refreshToken => _storage.read(AppConstants.kRefreshToken);

  Future<void> clearTokens() async {
    await _storage.delete(AppConstants.kAccessToken);
    await _storage.delete(AppConstants.kRefreshToken);
  }
}
