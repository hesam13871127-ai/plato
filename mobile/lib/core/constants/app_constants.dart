/// Compile-time environment constants. Override with
/// `flutter run --dart-define=API_BASE_URL=https://api.example.com`.
class AppConstants {
  AppConstants._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000', // Android emulator → host machine
  );

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
