import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'kv_storage.dart';

/// Native encrypted key/value storage backed by `flutter_secure_storage`
/// (Keychain / EncryptedSharedPreferences / secure desktop backends).
KvStorage makeKvStorage() => _SecureKvStorage();

class _SecureKvStorage implements KvStorage {
  _SecureKvStorage([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}
