/// Web (browser) default backend origin.
///
/// The browser runs on the same machine as the backend in local development,
/// so plain `localhost` is correct. (`10.0.2.2` is an Android-emulator-only
/// alias that does not exist in a browser context.)
String get defaultApiHost => 'http://localhost:3000';
