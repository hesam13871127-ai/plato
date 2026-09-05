import 'dart:html' as html;

import 'kv_storage.dart';

/// Web key/value storage backed by the browser's `localStorage`.
///
/// Browsers have no equivalent of the native secure keychain, so tokens live in
/// localStorage for local/same-origin web development. Wrapped defensively so a
/// storage-disabled environment (private mode) degrades to an in-memory store
/// rather than crashing the app.
KvStorage makeKvStorage() => _WebKvStorage();

class _WebKvStorage implements KvStorage {
  final Map<String, String> _memory = <String, String>{};

  html.Storage? get _ls {
    try {
      return html.window.localStorage;
    } on Object {
      return null;
    }
  }

  @override
  Future<String?> read(String key) async {
    try {
      return _ls?[key] ?? _memory[key];
    } on Object {
      return _memory[key];
    }
  }

  @override
  Future<void> write(String key, String value) async {
    _memory[key] = value;
    try {
      _ls?[key] = value;
    } on Object {
      // Storage unavailable (e.g. private browsing) — keep in memory.
    }
  }

  @override
  Future<void> delete(String key) async {
    _memory.remove(key);
    try {
      _ls?.remove(key);
    } on Object {
      // Ignore.
    }
  }
}
