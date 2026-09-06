import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'features/auth/presentation/providers/auth_notifier.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // ── Image cache tuning (60fps, bounded memory) ──────────────────────────
  // The in-memory image cache holds decoded bitmaps. The defaults (1000 images
  // / 100 MB) are generous for long gaming sessions; cap them so avatar-heavy
  // screens (lounge, leaderboards, chat) never push the heap into GC churn
  // that would drop frames. Disk caching is handled by cached_network_image.
  PaintingBinding.instance.imageCache.maximumSize = 400;
  PaintingBinding.instance.imageCache.maximumSizeBytes = 80 * 1024 * 1024; // 80 MB

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
