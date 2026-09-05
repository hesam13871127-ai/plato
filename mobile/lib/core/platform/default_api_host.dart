/// Resolves the default API host for the current platform.
///
/// The implementation is selected at compile time via a conditional import:
///  - Web browser (`dart:js_interop`) → `http://localhost:3000` (the browser
///    talks to the backend on the same machine).
///  - Native (`dart:io`) → `http://10.0.2.2:3000` on Android (the emulator's
///    alias for the host machine) and `http://localhost:3000` everywhere else
///    (desktop builds and the iOS simulator).
///
/// Any value is overridable with
/// `--dart-define=API_BASE_URL=https://your-host:port`.
import 'default_api_host_io.dart' if (dart.library.js_interop) 'default_api_host_web.dart'
    as impl;

/// Default backend origin (scheme + host + port), without the `/api` prefix.
String get defaultApiHost => impl.defaultApiHost;
