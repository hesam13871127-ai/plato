import 'dart:io' show Platform;

/// Native (non-web) default backend origin.
///
/// Android emulators reach the host machine through the special `10.0.2.2`
/// alias; desktop builds and the iOS simulator use plain `localhost`.
String get defaultApiHost {
  if (Platform.isAndroid) return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}
