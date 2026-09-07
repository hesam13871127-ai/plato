/// Lightweight, dependency-free bilingual (English / Persian) localization.
///
/// Usage: `context.l10n.welcome` or `L10n.of(context).t('welcome')`.
/// Strings are looked up by key from [L10n.strings]; missing keys fall back
/// to English and finally to the key itself, so the app never shows blanks.

import 'package:flutter/widgets.dart';

enum AppLanguage { english, persian }

class L10n {
  const L10n(this.language);

  final AppLanguage language;

  bool get isFa => language == AppLanguage.persian;

  String t(String key, {Map<String, String>? args}) {
    final table = isFa ? _fa : _en;
    var value = table[key] ?? _en[key] ?? key;
    if (args != null) {
      args.forEach((k, v) => value = value.replaceAll('{$k}', v));
    }
    return value;
  }

  static L10n of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<_L10nScope>();
    return scope?.l10n ?? const L10n(AppLanguage.english);
  }

  // ── String catalogue ─────────────────────────────────────────────────
  static const Map<String, String> _en = {
    // Common
    'app_name': 'VibeTable',
    'loading': 'Loading…',
    'retry': 'Retry',
    'cancel': 'Cancel',
    'save': 'Save',
    'confirm': 'Confirm',
    'delete': 'Delete',
    'close': 'Close',
    'search': 'Search',
    'settings': 'Settings',
    'language': 'Language',
    'english': 'English',
    'persian': 'فارسی',
    'sound_on': 'Sound effects',
    'haptics_on': 'Vibration / haptics',
    'music_on': 'Background music',
    'advanced': 'Advanced',
    'account': 'Account',
    'preferences': 'Preferences',
    'accessibility': 'Accessibility',
    'reduce_motion': 'Reduce animations',
    'large_text': 'Larger text',
    'logout': 'Log out',

    // Auth
    'welcome_title': 'Welcome to VibeTable',
    'welcome_subtitle': 'Play, chat and vibe — all your favourite table games in one place.',
    'login': 'Log in',
    'register': 'Sign up',
    'continue_phone': 'Continue with phone',
    'or': 'or',
    'email_username_phone': 'Email, username or phone',
    'email': 'Email',
    'phone': 'Phone number',
    'password': 'Password',
    'new_password': 'New password',
    'username': 'Username',
    'display_name': 'Display name',
    'forgot_password': 'Forgot password?',
    'forgot_password_title': 'Reset password',
    'forgot_password_hint': 'Enter the phone number on your account. We will text you a code.',
    'send_code': 'Send SMS code',
    'enter_code': 'Enter the code we sent',
    'verify': 'Verify',
    'set_password_title': 'Choose a password',
    'set_password_hint': 'Add a password so you can log in directly next time.',
    'no_account': "Don't have an account? Sign up",
    'have_account': 'Already have an account? Log in',
    'staff_sign_in': 'Staff sign-in',
    'invalid_credentials': 'Invalid credentials.',
    'code_sent': 'Code sent',
    'dev_code_hint': 'Dev mode: the code is',
    'password_rules': 'At least 8 characters.',
    'username_rules': 'At least 3 characters.',
    'invalid_email': 'Enter a valid email address.',
    'phone_hint': 'Phone with country code, e.g. +49170…',

    // Tabs / home
    'tab_home': 'Home',
    'tab_games': 'Games',
    'tab_shop': 'Shop',
    'tab_chat': 'Chat',
    'tab_profile': 'Profile',
    'play_now': 'Quick play',
    'create_room': 'Create table',
    'open_tables': 'Open tables',
    'choose_game': 'Choose a game',
    'how_to_play': 'How to play',
    'online_now': 'online',
    'players': 'players',
    'minutes': 'min',

    // Shop
    'shop_title': 'Shop',
    'shop_games': 'Game pieces & skins',
    'shop_categories': 'Categories',

    // Games
    'games_title': 'Games',
    'tutorial_title': 'How to play',
    'got_it': 'Got it!',
    'status_active': 'Active',
    'status_maintenance': 'Maintenance',
    'status_coming_soon': 'Coming soon',
  };

  static const Map<String, String> _fa = {
    // Common
    'app_name': 'وایب‌تیبل',
    'loading': 'در حال بارگذاری…',
    'retry': 'تلاش دوباره',
    'cancel': 'انصراف',
    'save': 'ذخیره',
    'confirm': 'تأیید',
    'delete': 'حذف',
    'close': 'بستن',
    'search': 'جستجو',
    'settings': 'تنظیمات',
    'language': 'زبان',
    'english': 'English',
    'persian': 'فارسی',
    'sound_on': 'افکت‌های صوتی',
    'haptics_on': 'لرزش (هپتیک)',
    'music_on': 'موسیقی پس‌زمینه',
    'advanced': 'پیشرفته',
    'account': 'حساب کاربری',
    'preferences': 'ترجیحات',
    'accessibility': 'دسترسی‌پذیری',
    'reduce_motion': 'کاهش انیمیشن‌ها',
    'large_text': 'متن بزرگ‌تر',
    'logout': 'خروج از حساب',

    // Auth
    'welcome_title': 'به وایب‌تیبل خوش آمدی',
    'welcome_subtitle': 'بازی کن، چت کن و حال کن — همه بازی‌های رومیزی محبوبت یک‌جا.',
    'login': 'ورود',
    'register': 'ثبت‌نام',
    'continue_phone': 'ورود با شماره موبایل',
    'or': 'یا',
    'email_username_phone': 'ایمیل، نام کاربری یا شماره موبایل',
    'email': 'ایمیل',
    'phone': 'شماره موبایل',
    'password': 'رمز عبور',
    'new_password': 'رمز عبور جدید',
    'username': 'نام کاربری',
    'display_name': 'نام نمایشی',
    'forgot_password': 'رمز عبور را فراموش کرده‌ای؟',
    'forgot_password_title': 'بازیابی رمز عبور',
    'forgot_password_hint': 'شماره موبایل حساب کاربری‌ات را وارد کن؛ کد تأیید برایت پیامک می‌شود.',
    'send_code': 'ارسال کد پیامکی',
    'enter_code': 'کد ارسال‌شده را وارد کن',
    'verify': 'تأیید',
    'set_password_title': 'یک رمز عبور انتخاب کن',
    'set_password_hint': 'برای ورود مستقیم دفعه بعد، برای حسابت رمز عبور بگذار.',
    'no_account': 'حساب نداری؟ ثبت‌نام کن',
    'have_account': 'حساب داری؟ وارد شو',
    'staff_sign_in': 'ورود کارکنان',
    'invalid_credentials': 'اطلاعات ورود نادرست است.',
    'code_sent': 'کد ارسال شد',
    'dev_code_hint': 'حالت توسعه: کد برابر است با',
    'password_rules': 'حداقل ۸ کاراکتر.',
    'username_rules': 'حداقل ۳ کاراکتر.',
    'invalid_email': 'یک ایمیل معتبر وارد کن.',
    'phone_hint': 'شماره با کد کشور، مثلاً +49170…',

    // Tabs / home
    'tab_home': 'خانه',
    'tab_games': 'بازی‌ها',
    'tab_shop': 'فروشگاه',
    'tab_chat': 'چت',
    'tab_profile': 'پروفایل',
    'play_now': 'بازی سریع',
    'create_room': 'ساخت میز',
    'open_tables': 'میزهای باز',
    'choose_game': 'یک بازی انتخاب کن',
    'how_to_play': 'آموزش بازی',
    'online_now': 'آنلاین',
    'players': 'بازیکن',
    'minutes': 'دقیقه',

    // Shop
    'shop_title': 'فروشگاه',
    'shop_games': 'مهره و اسکین بازی‌ها',
    'shop_categories': 'دسته‌بندی‌ها',

    // Games
    'games_title': 'بازی‌ها',
    'tutorial_title': 'آموزش بازی',
    'got_it': 'متوجه شدم!',
    'status_active': 'فعال',
    'status_maintenance': 'تعمیرات',
    'status_coming_soon': 'به‌زودی',
  };
}

class _L10nScope extends InheritedWidget {
  const _L10nScope({required this.l10n, required super.child});

  final L10n l10n;

  @override
  bool updateShouldNotify(_L10nScope oldWidget) => oldWidget.l10n.language != l10n.language;
}

extension L10nContext on BuildContext {
  L10n get l10n => L10n.of(this);

  /// Convenience: `context.tr('key')`.
  String tr(String key, {Map<String, String>? args}) => L10n.of(this).t(key, args: args);
}

/// Injects the current [L10n] into the tree (wraps MaterialApp).
class L10nProvider extends StatelessWidget {
  const L10nProvider({super.key, required this.language, required this.child});

  final AppLanguage language;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return _L10nScope(l10n: L10n(language), child: child);
  }
}
