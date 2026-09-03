import 'package:flutter/material.dart';

/// VibeTable brand palette — dark mode first.
class AppColors {
  AppColors._();

  /// Deep Navy — primary background.
  static const Color deepNavy = Color(0xFF0B1426);

  /// Electric Purple — primary accent / brand.
  static const Color electricPurple = Color(0xFF7B5CFF);

  /// Soft Cyan — secondary accent / highlights.
  static const Color softCyan = Color(0xFF00E5FF);

  // Surfaces (elevated navy layers for glassmorphism).
  static const Color surfaceDark = Color(0xFF0F1B33);
  static const Color surfaceElevated = Color(0xFF152241);
  static const Color glassFill = Color(0x1AFFFFFF); // white @ 10%
  static const Color glassStroke = Color(0x33FFFFFF); // white @ 20%

  // Status / semantic.
  static const Color success = Color(0xFF2EE6A8);
  static const Color warning = Color(0xFFFFC857);
  static const Color danger = Color(0xFFFF5C7A);

  // Text.
  static const Color textPrimary = Color(0xFFF4F7FF);
  static const Color textSecondary = Color(0xFF9AA7C7);
  static const Color textMuted = Color(0xFF5C6A8F);

  // Gradients.
  static const LinearGradient brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [electricPurple, softCyan],
  );

  static const LinearGradient navyGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF0E1830), deepNavy],
  );
}
