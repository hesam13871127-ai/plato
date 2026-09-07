import 'package:flutter/material.dart';

/// VibeTable brand palette — "Aurora" edition, dark mode first.
///
/// Deep indigo-black backgrounds, a warm coral→violet brand accent and a mint
/// highlight. The identifiers keep their historical names (`deepNavy`,
/// `electricPurple`, `softCyan`) so the whole app re-skins from this file.
class AppColors {
  AppColors._();

  /// Deep Ink — primary background (near-black indigo).
  static const Color deepNavy = Color(0xFF0A0B1E);

  /// Aurora Violet — primary accent / brand.
  static const Color electricPurple = Color(0xFF8A6CFF);

  /// Mint Glow — secondary accent / highlights (replaces the old hard cyan).
  static const Color softCyan = Color(0xFF3DF2C4);

  /// Coral Flame — warm tertiary accent for CTAs, wins and hearts.
  static const Color coral = Color(0xFFFF6B8B);

  /// Sun Gold — rewards, coins, legendary rarity.
  static const Color gold = Color(0xFFFFC857);

  /// Sky — cool informational accent (links, ranked badges).
  static const Color sky = Color(0xFF5DB8FF);

  // Surfaces (elevated indigo layers for glassmorphism).
  static const Color surfaceDark = Color(0xFF12142E);
  static const Color surfaceElevated = Color(0xFF1B1E42);
  static const Color glassFill = Color(0x14FFFFFF); // white @ 8%
  static const Color glassStroke = Color(0x2EFFFFFF); // white @ 18%

  // Status / semantic.
  static const Color success = Color(0xFF3DF2C4);
  static const Color warning = Color(0xFFFFC857);
  static const Color danger = Color(0xFFFF5C7A);

  // Text.
  static const Color textPrimary = Color(0xFFF6F5FF);
  static const Color textSecondary = Color(0xFFA9ABD1);
  static const Color textMuted = Color(0xFF62658F);

  // Gradients.
  static const LinearGradient brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [coral, electricPurple, softCyan],
    stops: [0.0, 0.55, 1.0],
  );

  /// Two-stop variant for buttons and small chips.
  static const LinearGradient accentGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFA48BFF), electricPurple],
  );

  static const LinearGradient navyGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF15173A), deepNavy],
  );

  /// Soft radial "aurora" wash used behind hero sections.
  static const RadialGradient auroraGlow = RadialGradient(
    center: Alignment(-0.6, -0.8),
    radius: 1.4,
    colors: [Color(0x668A6CFF), Color(0x333DF2C4), Color(0x00000000)],
    stops: [0.0, 0.45, 1.0],
  );
}
