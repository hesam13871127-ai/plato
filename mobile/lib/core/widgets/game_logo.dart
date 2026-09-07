import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Renders a game's 3D logo. Uses the bundled [assets/game_logos/<slug>.png]
/// art when it exists; otherwise falls back to a polished 3D-style gradient
/// tile with the game's emoji/initial, so every game still looks intentional.
class GameLogo extends StatelessWidget {
  const GameLogo({
    super.key,
    required this.slug,
    this.size = 72,
    this.radius = 20,
    this.emoji = '🎲',
  });

  final String slug;
  final double size;
  final double radius;
  final String emoji;

  static const _missing = {
    // Logos not bundled yet — fallback tile is shown for these.
    'memory_race',
    'ocho',
    'pool_8ball',
  };

  @override
  Widget build(BuildContext context) {
    final hasArt = !_missing.contains(slug);
    final assetPath = 'assets/game_logos/$slug.png';

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [
          BoxShadow(
            color: AppColors.electricPurple.withValues(alpha: 0.35),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: hasArt
            ? Image.asset(
                assetPath,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _fallback(),
              )
            : _fallback(),
      ),
    );
  }

  Widget _fallback() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF2A2270), Color(0xFF0B3A52)],
        ),
      ),
      alignment: Alignment.center,
      child: Text(emoji, style: TextStyle(fontSize: size * 0.45)),
    );
  }
}

/// The app's own 3D brand logo used on the login screen and home header.
class AppBrandLogo extends StatelessWidget {
  const AppBrandLogo({super.key, this.size = 84});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.28),
        boxShadow: [
          BoxShadow(
            color: AppColors.electricPurple.withValues(alpha: 0.5),
            blurRadius: 30,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.28),
        child: Image.asset(
          'assets/branding/app_logo.png',
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(
            decoration: const BoxDecoration(gradient: AppColors.brandGradient),
            alignment: Alignment.center,
            child: Text('🎲', style: TextStyle(fontSize: size * 0.5)),
          ),
        ),
      ),
    );
  }
}
