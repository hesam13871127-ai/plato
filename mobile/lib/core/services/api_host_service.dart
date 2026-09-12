import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/app_constants.dart';
import '../storage/kv_storage.dart';
import '../storage/platform_kv_storage.dart';

/// Runtime, persisted override for the backend origin.
///
/// [AppConstants.apiBaseUrl] is only configurable at build time
/// (`flutter run --dart-define=API_BASE_URL=...`), which makes a release APK
/// unable to point at a different server (e.g. a home PC on the same Wi-Fi)
/// without rebuilding. This service layers an in-app, persisted override on
/// top of the build-time default and exposes the effective origin to the
/// REST + socket layers. The value is exposed on the auth screen.
class ApiHostService extends ChangeNotifier {
  ApiHostService({KvStorage? storage})
      : _storage = storage ?? createKvStorage() {
    _loadPersisted();
  }

  static const String _kKey = 'api_base_url_override';

  final KvStorage _storage;
  String? _override;
  bool _initialized = false;

  /// True once the persisted override has been loaded from storage.
  bool get initialized => _initialized;

  /// The raw override value, or null when the default host is in use.
  String? get overrideValue => _initialized ? _override : null;

  /// The effective backend origin (scheme + host + port, no `/api` prefix).
  String get baseUrl =>
      _initialized && _override != null && _override!.isNotEmpty
          ? _override!
          : AppConstants.apiBaseUrl;

  Future<void> _loadPersisted() async {
    try {
      final stored = await _storage.read(_kKey);
      if (stored != null && stored.trim().isNotEmpty) {
        _override = _normalise(stored);
      }
    } catch (_) {
      // Storage failure: fall back to the default host.
    } finally {
      _initialized = true;
      notifyListeners();
    }
  }

  /// Persists a new override. An empty value clears it and falls back to the
  /// build-time default. Returns the effective origin after applying it.
  Future<String> setOverride(String? value) async {
    final trimmed = value?.trim() ?? '';
    try {
      if (trimmed.isEmpty) {
        await _storage.delete(_kKey);
        _override = null;
      } else {
        final normalised = _normalise(trimmed);
        await _storage.write(_kKey, normalised);
        _override = normalised;
      }
    } catch (_) {
      // Even if persistence fails, keep it in memory for this session.
      _override = trimmed.isEmpty ? null : _normalise(trimmed);
    }
    notifyListeners();
    return baseUrl;
  }

  /// `192.168.1.20:3000` → `http://192.168.1.20:3000`; strips trailing slashes
  /// and an accidental `/api` suffix.
  static String _normalise(String raw) {
    var s = raw.trim().replaceFirst(RegExp(r'/+$'), '');
    if (!s.toLowerCase().startsWith('http://') &&
        !s.toLowerCase().startsWith('https://')) {
      s = 'http://$s';
    }
    if (s.toLowerCase().endsWith('/api')) {
      s = s.substring(0, s.length - 4);
    }
    return s;
  }
}

/// The live override service (one per app run).
final apiHostServiceProvider =
    ChangeNotifierProvider<ApiHostService>((ref) => ApiHostService());

/// The effective backend origin. Recomputes whenever the override changes,
/// which recreates the Dio + socket clients so all traffic follows the new
/// server.
final apiBaseUrlProvider =
    Provider<String>((ref) => ref.watch(apiHostServiceProvider).baseUrl);
