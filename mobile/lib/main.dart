import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'features/auth/presentation/providers/auth_notifier.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final container = ProviderContainer();

  // Restore any persisted session. This runs in the background instead of
  // blocking the first frame: the app renders the splash immediately and the
  // router redirects (splash → home/auth) as soon as auth state resolves, so a
  // slow/unreachable backend never leaves a black or frozen loading screen.
  unawaited(
    container.read(authNotifierProvider.notifier).checkAuthStatus(),
  );

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const VibeTableApp(),
    ),
  );
}
