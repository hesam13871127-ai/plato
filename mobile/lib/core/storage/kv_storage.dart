/// A minimal key/value string store used to persist credentials.
///
/// The concrete implementation is chosen at compile time through a conditional
/// import (see [platform_kv_storage]):
///  - Native platforms: encrypted platform storage via `flutter_secure_storage`
///    (Keychain on iOS/macOS, EncryptedSharedPreferences on Android, secure
///    backends on desktop).
///  - Web: browser `localStorage` (no platform secure-storage equivalent).
abstract interface class KvStorage {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}
