/// Selects the native [KvStorage] implementation by default, or the web one
/// when compiling for the browser.
import 'kv_storage.dart';
import 'kv_storage_stub.dart'
    if (dart.library.io) 'kv_storage_native.dart'
    if (dart.library.js_interop) 'kv_storage_web.dart' as impl;

/// Returns a platform-correct [KvStorage].
KvStorage createKvStorage() => impl.makeKvStorage();
