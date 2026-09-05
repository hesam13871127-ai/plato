import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';

/// Per-chat visual themes (bubbles + accents). Keys are stored per chat
/// (`chats.themeKey`) and chosen in group settings. Dark glassmorphism base.
class ChatThemeData {
  const ChatThemeData({
    required this.key,
    required this.label,
    required this.selfBubble,
    required this.otherBubble,
    required this.accent,
  });

  final String key;
  final String label;
  final Color selfBubble;
  final Color otherBubble;
  final Color accent;

  static const List<ChatThemeData> all = [
    ChatThemeData(
      key: 'neon',
      label: 'Neon Night',
      selfBubble: Color(0xFF7B5CFF),
      otherBubble: Color(0xFF1A2547),
      accent: Color(0xFF00E5FF),
    ),
    ChatThemeData(
      key: 'sunset',
      label: 'Sunset',
      selfBubble: Color(0xFFB15CFF),
      otherBubble: Color(0xFF2A2140),
      accent: Color(0xFFFF8FA3),
    ),
    ChatThemeData(
      key: 'emerald',
      label: 'Emerald',
      selfBubble: Color(0xFF12B886),
      otherBubble: Color(0xFF16283A),
      accent: Color(0xFF2EE6A8),
    ),
    ChatThemeData(
      key: 'gold',
      label: 'Royal Gold',
      selfBubble: Color(0xFFD9A441),
      otherBubble: Color(0xFF2A2415),
      accent: Color(0xFFFFC857),
    ),
    ChatThemeData(
      key: 'crimson',
      label: 'Crimson',
      selfBubble: Color(0xFFFF5C7A),
      otherBubble: Color(0xFF331B26),
      accent: Color(0xFFFF8FA3),
    ),
  ];

  static ChatThemeData forKey(String? key) => all.firstWhere(
        (t) => t.key == key,
        orElse: () => all.first,
      );
}

/// Background gradient for a given chat theme.
LinearGradient chatBackground(String? themeKey) {
  switch (themeKey) {
    case 'sunset':
      return const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF1A1330), AppColors.deepNavy],
      );
    case 'emerald':
      return const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF0B2026), AppColors.deepNavy],
      );
    case 'gold':
      return const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF201B0E), AppColors.deepNavy],
      );
    case 'crimson':
      return const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF26101B), AppColors.deepNavy],
      );
    default:
      return AppColors.navyGradient;
  }
}
