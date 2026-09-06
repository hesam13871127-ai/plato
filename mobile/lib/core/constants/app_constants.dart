import '../platform/default_api_host.dart';

/// Environment constants. Override the backend origin with
/// `flutter run --dart-define=API_BASE_URL=https://api.example.com`.
///
/// When not overridden, the default origin is resolved per platform at runtime
/// (localhost for web/desktop, the 10.0.2.2 emulator alias on Android), so the
/// app connects to a locally-running backend with zero extra configuration.
class AppConstants {
  AppConstants._();

  static const String _envApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  /// Backend origin (scheme + host + port), without the `/api` prefix.
  static String get apiBaseUrl =>
      _envApiBaseUrl.isNotEmpty ? _envApiBaseUrl : defaultApiHost;

  static const String apiPrefix = '/api';

  /// Socket.io real-time base (same origin as the REST API; the gateway
  /// listens on the root namespace).
  static String get socketBaseUrl => apiBaseUrl;

  static const String appName = 'VibeTable';
  static const String appVersion = '1.0.0';

  /// Secure-storage keys.
  static const String kAccessToken = 'vt_access_token';
  static const String kRefreshToken = 'vt_refresh_token';
}
