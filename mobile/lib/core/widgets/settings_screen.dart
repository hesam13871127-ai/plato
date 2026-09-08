import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../i18n/app_localizations.dart';
import '../i18n/locale_controller.dart';
import '../services/feedback_service.dart';
import '../theme/app_colors.dart';
import '../theme/theme_controller.dart';
import 'glass_card.dart';

/// Preference keys for accessibility/display options persisted locally.
const _kReduceMotion = 'settings_reduce_motion';
const _kLargeText = 'settings_large_text';

/// Simple flags shared across the app (read where animations/text scale apply).
final reduceMotionProvider = StateProvider<bool>((_) => false);
final largeTextProvider = StateProvider<bool>((_) => false);

/// Advanced settings: language, sound, haptics, accessibility and (for
/// authenticated staff) nothing else — accounts stay simple. Reachable from
/// the profile screen and the auth screen footer.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    ref.read(reduceMotionProvider.notifier).state = prefs.getBool(_kReduceMotion) ?? false;
    ref.read(largeTextProvider.notifier).state = prefs.getBool(_kLargeText) ?? false;
  }

  Future<void> _setBool(String key, StateProvider<bool> provider, bool value) async {
    ref.read(provider.notifier).state = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(key, value);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final language = ref.watch(localeControllerProvider);
    final themeMode = ref.watch(themeControllerProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final feedback = ref.watch(feedbackServiceProvider);
    final reduceMotion = ref.watch(reduceMotionProvider);
    final largeText = ref.watch(largeTextProvider);

    return Scaffold(
      backgroundColor: isDark ? AppColors.deepNavy : AppColors.lightBackground,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(l10n.t('settings'),
            style: TextStyle(color: isDark ? AppColors.textPrimary : AppColors.lightTextPrimary, fontWeight: FontWeight.w800)),
        iconTheme: IconThemeData(color: isDark ? AppColors.textPrimary : AppColors.lightTextPrimary),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          _Section(
            title: l10n.t('language'),
            icon: Icons.translate_rounded,
            children: [
              RadioListTile<AppLanguage>(
                value: AppLanguage.english,
                groupValue: language,
                activeColor: AppColors.electricPurple,
                title: Text('English', style: TextStyle(color: isDark ? AppColors.textPrimary : AppColors.lightTextPrimary)),
                onChanged: (v) => ref.read(localeControllerProvider.notifier).setLanguage(v!),
              ),
              RadioListTile<AppLanguage>(
                value: AppLanguage.persian,
                groupValue: language,
                activeColor: AppColors.electricPurple,
                title: Text('فارسی', style: TextStyle(color: isDark ? AppColors.textPrimary : AppColors.lightTextPrimary)),
                onChanged: (v) => ref.read(localeControllerProvider.notifier).setLanguage(v!),
              ),
            ],
          ),
          _Section(
            title: language == AppLanguage.persian ? 'ظاهر' : 'Appearance',
            icon: Icons.palette_rounded,
            children: [
              RadioListTile<AppThemeMode>(
                value: AppThemeMode.dark,
                groupValue: themeMode,
                activeColor: AppColors.electricPurple,
                title: Text(language == AppLanguage.persian ? 'تیره — Midnight Aurora' : 'Dark — Midnight Aurora', style: TextStyle(color: isDark ? AppColors.textPrimary : AppColors.lightTextPrimary)),
                secondary: const Icon(Icons.dark_mode_rounded, color: AppColors.electricPurple),
                onChanged: (v) => ref.read(themeControllerProvider.notifier).setMode(v!),
              ),
              RadioListTile<AppThemeMode>(
                value: AppThemeMode.light,
                groupValue: themeMode,
                activeColor: AppColors.electricPurple,
                title: Text(language == AppLanguage.persian ? 'روشن — Dawn Aurora' : 'Light — Dawn Aurora', style: TextStyle(color: isDark ? AppColors.textPrimary : AppColors.lightTextPrimary)),
                secondary: const Icon(Icons.light_mode_rounded, color: AppColors.cosmicGold),
                onChanged: (v) => ref.read(themeControllerProvider.notifier).setMode(v!),
              ),
              RadioListTile<AppThemeMode>(
                value: AppThemeMode.system,
                groupValue: themeMode,
                activeColor: AppColors.electricPurple,
                title: Text(language == AppLanguage.persian ? 'خودکار (سیستم)' : 'System', style: TextStyle(color: isDark ? AppColors.textPrimary : AppColors.lightTextPrimary)),
                secondary: const Icon(Icons.settings_brightness_rounded, color: AppColors.softCyan),
                onChanged: (v) => ref.read(themeControllerProvider.notifier).setMode(v!),
              ),
            ],
          ),
          _Section(
            title: l10n.t('preferences'),
            icon: Icons.tune_rounded,
            children: [
              SwitchListTile(
                value: feedback.sound,
                activeColor: AppColors.softCyan,
                title: Text(l10n.t('sound_on'),
                    style: const TextStyle(color: AppColors.textPrimary)),
                secondary: const Icon(Icons.volume_up_rounded, color: AppColors.softCyan),
                onChanged: (v) {
                  ref.read(feedbackServiceProvider.notifier).setSound(v);
                  if (v) ref.read(feedbackServiceProvider.notifier).success();
                },
              ),
              SwitchListTile(
                value: feedback.haptics,
                activeColor: AppColors.softCyan,
                title: Text(l10n.t('haptics_on'),
                    style: const TextStyle(color: AppColors.textPrimary)),
                secondary: const Icon(Icons.vibration_rounded, color: AppColors.softCyan),
                onChanged: (v) => ref.read(feedbackServiceProvider.notifier).setHaptics(v),
              ),
            ],
          ),
          _Section(
            title: l10n.t('accessibility'),
            icon: Icons.accessibility_new_rounded,
            children: [
              SwitchListTile(
                value: reduceMotion,
                activeColor: AppColors.softCyan,
                title: Text(l10n.t('reduce_motion'),
                    style: const TextStyle(color: AppColors.textPrimary)),
                secondary: const Icon(Icons.animation_rounded, color: AppColors.softCyan),
                onChanged: (v) => _setBool(_kReduceMotion, reduceMotionProvider, v),
              ),
              SwitchListTile(
                value: largeText,
                activeColor: AppColors.softCyan,
                title: Text(l10n.t('large_text'),
                    style: const TextStyle(color: AppColors.textPrimary)),
                secondary: const Icon(Icons.format_size_rounded, color: AppColors.softCyan),
                onChanged: (v) => _setBool(_kLargeText, largeTextProvider, v),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(
              'VibeTable · v1.0',
              style: TextStyle(color: AppColors.textMuted, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.icon, required this.children});

  final String title;
  final IconData icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: GlassCard(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
              child: Row(
                children: [
                  Icon(icon, size: 18, color: AppColors.electricPurple),
                  const SizedBox(width: 8),
                  Text(title.toUpperCase(),
                      style: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                      )),
                ],
              ),
            ),
            ...children,
          ],
        ),
      ),
    );
  }
}
