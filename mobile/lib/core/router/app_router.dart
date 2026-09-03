import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/providers/auth_notifier.dart';
import '../../features/auth/presentation/providers/auth_state.dart';
import '../../features/auth/presentation/screens/auth_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/profile/presentation/screens/profile_screen.dart';
import '../../features/splash/presentation/splash_screen.dart';

/// Named routes.
class AppRoutes {
  AppRoutes._();
  static const String splash = '/';
  static const String auth = '/auth';
  static const String home = '/home';
  static const String profile = '/profile';
}

final goRouterProvider = Provider<GoRouter>((ref) {
  final notifier = ValueNotifier<AuthState>(const AuthState());

  ref
    ..listen(authNotifierProvider, (previous, next) {
      notifier.value = next;
    })
    ..onDispose(notifier.dispose);

  return GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: notifier,
    redirect: (context, state) {
      final authState = notifier.value;
      final location = state.matchedLocation;

      if (authState.status == AuthStatus.unknown) {
        return location == AppRoutes.splash ? null : AppRoutes.splash;
      }

      final loggedIn = authState.status == AuthStatus.authenticated;
      final onSplash = location == AppRoutes.splash;
      final onAuth = location == AppRoutes.auth;

      if (onSplash) {
        return loggedIn ? AppRoutes.home : AppRoutes.auth;
      }
      if (!loggedIn && !onAuth) return AppRoutes.auth;
      if (loggedIn && onAuth) return AppRoutes.home;
      return null;
    },
    routes: [
      GoRoute(path: AppRoutes.splash, builder: (_, __) => const SplashScreen()),
      GoRoute(path: AppRoutes.auth, builder: (_, __) => const AuthScreen()),
      GoRoute(path: AppRoutes.home, builder: (_, __) => const HomeScreen()),
      GoRoute(path: AppRoutes.profile, builder: (_, __) => const ProfileScreen()),
    ],
  );
});
