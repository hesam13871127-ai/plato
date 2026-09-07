import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

/// Centralised dark theme for VibeTable (glassmorphism + neon accents).
class AppTheme {
  AppTheme._();

  static ThemeData get dark {
    final base = ThemeData.dark(useMaterial3: true);

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.deepNavy,
      canvasColor: AppColors.deepNavy,
      primaryColor: AppColors.electricPurple,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.electricPurple,
        secondary: AppColors.softCyan,
        tertiary: AppColors.coral,
        surface: AppColors.surfaceDark,
        error: AppColors.danger,
        onPrimary: Colors.white,
        onSecondary: AppColors.deepNavy,
        onTertiary: Colors.white,
        onSurface: AppColors.textPrimary,
        outline: AppColors.glassStroke,
      ),
      splashColor: AppColors.electricPurple.withValues(alpha: 0.12),
      highlightColor: AppColors.electricPurple.withValues(alpha: 0.06),
      dividerColor: AppColors.glassStroke,
      textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
        bodyColor: AppColors.textPrimary,
        displayColor: AppColors.textPrimary,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.inter(
          color: AppColors.textPrimary,
          fontSize: 20,
          fontWeight: FontWeight.w700,
        ),
        iconTheme: const IconThemeData(color: AppColors.textPrimary),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size.fromHeight(54),
          backgroundColor: AppColors.electricPurple,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          textStyle: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: AppColors.softCyan),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.glassFill,
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
        hintStyle: const TextStyle(color: AppColors.textMuted),
        labelStyle: const TextStyle(color: AppColors.textSecondary),
        prefixIconColor: AppColors.softCyan,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.glassStroke),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.glassStroke),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.softCyan, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.danger),
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.glassFill,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: AppColors.glassStroke),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.surfaceElevated,
        contentTextStyle: const TextStyle(color: AppColors.textPrimary),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.glassFill,
        selectedColor: AppColors.electricPurple.withValues(alpha: 0.35),
        side: const BorderSide(color: AppColors.glassStroke),
        labelStyle: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surfaceDark,
        modalBackgroundColor: AppColors.surfaceDark,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surfaceDark,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.softCyan),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected) ? Colors.white : AppColors.textSecondary,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected) ? AppColors.electricPurple : AppColors.surfaceElevated,
        ),
      ),
    );
  }
}
