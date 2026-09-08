import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Persists the user's light/dark choice. System means follow OS.
enum AppThemeMode { system, light, dark }

extension AppThemeModeX on AppThemeMode {
  ThemeMode get material {
    switch (this) {
      case AppThemeMode.light:
        return ThemeMode.light;
      case AppThemeMode.dark:
        return ThemeMode.dark;
      case AppThemeMode.system:
        return ThemeMode.system;
    }
  }

  String get label {
    switch (this) {
      case AppThemeMode.light:
        return 'Light';
      case AppThemeMode.dark:
        return 'Dark';
      case AppThemeMode.system:
        return 'System';
    }
  }

  String get labelFa {
    switch (this) {
      case AppThemeMode.light:
        return 'روشن';
      case AppThemeMode.dark:
        return 'تیره';
      case AppThemeMode.system:
        return 'خودکار';
    }
  }
}

class ThemeController extends StateNotifier<AppThemeMode> {
  ThemeController() : super(AppThemeMode.dark) {
    _load();
  }

  static const _key = 'app_theme_mode';

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == 'light') state = AppThemeMode.light;
      else if (raw == 'dark') state = AppThemeMode.dark;
      else if (raw == 'system') state = AppThemeMode.system;
    } catch (_) {}
  }

  Future<void> setMode(AppThemeMode mode) async {
    state = mode;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, mode.name);
    } catch (_) {}
  }
}

final themeControllerProvider =
    StateNotifierProvider<ThemeController, AppThemeMode>((ref) => ThemeController());
