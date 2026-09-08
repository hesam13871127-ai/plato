import 'package:flutter/material.dart';

/// VibeTable brand palette — Midnight Aurora (dark-first, 3D, jewel tones).
/// Refreshed for the Plato-grade rebuild: deeper navy + vivid violet/cyan/pink
/// so every board and glass card pops against the background.
class AppColors {
  AppColors._();

  /// Midnight Navy — primary scaffold (almost black, blue undertone).
  static const Color deepNavy = Color(0xFF060A1E);

  /// Electric Violet — primary brand accent.
  static const Color electricPurple = Color(0xFF8B5CF6);

  /// Aurora Cyan — secondary accent / highlights.
  static const Color softCyan = Color(0xFF22D3EE);

  /// Neon Pink — tertiary pop (medals, wins, hearts).
  static const Color neonPink = Color(0xFFEC4899);

  /// Cosmic Gold — rewards, coins, stars.
  static const Color cosmicGold = Color(0xFFFBBF24);

  // Surfaces — elevated midnight layers for glassmorphism.
  static const Color surfaceDark = Color(0xFF0F1832);
  static const Color surfaceElevated = Color(0xFF1C2B4E);
  static const Color glassFill = Color(0x1FFFFFFF); // white @ 12%
  static const Color glassStroke = Color(0x33FFFFFF); // white @ 20%

  // Status / semantic.
  static const Color success = Color(0xFF22C55E);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFEF4444);

  // Text.
  static const Color textPrimary = Color(0xFFF1F5FF);
  static const Color textSecondary = Color(0xFF9AA7C7);
  static const Color textMuted = Color(0xFF5E6B8F);

  // ── Light theme companions (same brand accents, light canvas) ──────────
  static const Color lightBackground = Color(0xFFF1F5FF);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightSurfaceElevated = Color(0xFFF8FAFF);
  static const Color lightGlassFill = Color(0x0F0F172A); // near-black @ 6%
  static const Color lightGlassStroke = Color(0x1A0F172A); // near-black @ 10%
  static const Color lightTextPrimary = Color(0xFF0F172A);
  static const Color lightTextSecondary = Color(0xFF475569);
  static const Color lightTextMuted = Color(0xFF94A3B8);

  static const LinearGradient lightNavyGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFFF8FAFF), Color(0xFFE8ECFF)],
  );

  // Gradients.
  static const LinearGradient brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [electricPurple, softCyan],
  );

  static const LinearGradient auroraGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [electricPurple, softCyan, neonPink],
  );

  static const LinearGradient sunsetGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFF59E0B), neonPink, electricPurple],
  );

  static const LinearGradient navyGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF0B1430), deepNavy],
  );

  static const LinearGradient goldGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFFFE27A), cosmicGold, Color(0xFFEA580C)],
  );

  /// Board felt presets — default + purchasable skins displayed in the Shop.
  static const List<BoardThemePreset> boardThemes = [
    BoardThemePreset(id: 'midnight', name: 'Midnight Velvet', feltTop: Color(0xFF1E3A5A), feltBottom: Color(0xFF0B1A2E), edge: Color(0xFF0D213A)),
    BoardThemePreset(id: 'emerald', name: 'Emerald Felt', feltTop: Color(0xFF0E5A3A), feltBottom: Color(0xFF06301F), edge: Color(0xFF0A3D28)),
    BoardThemePreset(id: 'crimson', name: 'Crimson Royale', feltTop: Color(0xFF7A1C2E), feltBottom: Color(0xFF3D0E18), edge: Color(0xFF4A1420)),
    BoardThemePreset(id: 'cosmic', name: 'Cosmic Nebula', feltTop: Color(0xFF3B1A6B), feltBottom: Color(0xFF1A0F2E), edge: Color(0xFF24104A)),
    BoardThemePreset(id: 'wood', name: 'Amber Wood', feltTop: Color(0xFF8B5A2B), feltBottom: Color(0xFF4A2E12), edge: Color(0xFF5A3520)),
    BoardThemePreset(id: 'arctic', name: 'Arctic Ice', feltTop: Color(0xFF1B4A5A), feltBottom: Color(0xFF0B2430), edge: Color(0xFF123040)),
  ];
}

class BoardThemePreset {
  const BoardThemePreset({required this.id, required this.name, required this.feltTop, required this.feltBottom, required this.edge});
  final String id;
  final String name;
  final Color feltTop;
  final Color feltBottom;
  final Color edge;
}
