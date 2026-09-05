import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/social/presentation/providers/social_providers.dart';
import 'features/social/presentation/widgets/game_invite_listener.dart';

class VibeTableApp extends ConsumerWidget {
  const VibeTableApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(goRouterProvider);

    // Start the social real-time service (game invites, friend events) and keep
    // the shared socket alive for the authenticated session.
    ref.watch(socialSocketServiceProvider);
    ref.watch(socialRealtimeProvider);

    return GameInviteListener(
      child: MaterialApp.router(
        title: 'VibeTable',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.dark,
        darkTheme: AppTheme.dark,
        themeMode: ThemeMode.dark,
        routerConfig: router,
      ),
    );
  }
}
