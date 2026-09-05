import 'kv_storage.dart';

/// Fallback used if neither platform library is available (should not happen in
/// practice). It keeps credentials in memory only.
KvStorage makeKvStorage() => const _InMemoryKvStorage();

class _InMemoryKvStorage implements KvStorage {
  const _InMemoryKvStorage();
  static final Map<String, String> _store = <String, String>{};

  @override
  Future<String?> read(String key) async => _store[key];

  @override
  Future<void> write(String key, String value) async => _store[key] = value;

  @override
  Future<void> delete(String key) async => _store.remove(key);
}
