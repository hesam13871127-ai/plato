import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/i18n/app_localizations.dart';
import 'core/i18n/locale_controller.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'features/social/presentation/providers/social_providers.dart';
import 'features/social/presentation/widgets/game_invite_listener.dart';

class VibeTableApp extends ConsumerWidget {
  const VibeTableApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(goRouterProvider);
    final language = ref.watch(localeControllerProvider);
    final themeMode = ref.watch(themeControllerProvider);

    // Start the social real-time service (game invites, friend events) and keep
    // the shared socket alive for the authenticated session.
    ref.watch(socialSocketServiceProvider);
    ref.watch(socialRealtimeProvider);

    return L10nProvider(
      language: language,
      child: MaterialApp.router(
        title: 'VibeTable',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: themeMode.material,
        locale: Locale(language == AppLanguage.persian ? 'fa' : 'en'),
        supportedLocales: const [Locale('en'), Locale('fa')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        builder: (context, child) {
          // Flip the whole app for Persian (right-to-left).
          final direction = language == AppLanguage.persian ? TextDirection.rtl : TextDirection.ltr;
          return Directionality(
            textDirection: direction,
            child: child ?? const SizedBox.shrink(),
          );
        },
        routerConfig: router,
      ),
    );
  }
}
