import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_localizations.dart';

/// Holds the active [AppLanguage], persisted across launches. Defaults to the
/// device language (Persian when the system locale is `fa*`, else English).
class LocaleController extends StateNotifier<AppLanguage> {
  LocaleController() : super(_detect()) {
    _load();
  }

  static const _prefsKey = 'app_language';

  static AppLanguage _detect() {
    final locale = PlatformDispatcher.instance.locale;
    return locale.languageCode.toLowerCase().startsWith('fa')
        ? AppLanguage.persian
        : AppLanguage.english;
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_prefsKey);
      if (saved == 'fa') state = AppLanguage.persian;
      if (saved == 'en') state = AppLanguage.english;
    } catch (_) {
      // Storage may be unavailable before the engine is ready; default stands.
    }
  }

  Future<void> setLanguage(AppLanguage language) async {
    state = language;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, language == AppLanguage.persian ? 'fa' : 'en');
    } catch (_) {
      // Persistence is best-effort.
    }
  }

  void toggle() => setLanguage(
        state == AppLanguage.persian ? AppLanguage.english : AppLanguage.persian,
      );
}

final localeControllerProvider =
    StateNotifierProvider<LocaleController, AppLanguage>((ref) => LocaleController());
