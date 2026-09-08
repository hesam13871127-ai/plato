import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/app_localizations.dart';
import '../services/feedback_service.dart';
import '../theme/app_colors.dart';

/// A single tab definition for the floating 3D glass dock.
class DockItem {
  const DockItem({required this.icon, required this.labelKey, required this.onTap});

  final IconData icon;
  final String labelKey;
  final VoidCallback onTap;
}

/// Floating, frosted-glass bottom navigation with a 3D raised active pill.
/// Used across the main screens (Home / Games / Shop / Chat / Profile) to give
/// the app the modern, layered "Plato-style" feel with categories at the bottom.
class BottomDock extends ConsumerWidget {
  const BottomDock({super.key, required this.current, required this.items});

  /// Index of the active tab.
  final int current;
  final List<DockItem> items;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;

    return ClipRRect(
      borderRadius: BorderRadius.circular(30),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: Theme.of(context).brightness == Brightness.dark
                  ? const [Color(0xD91C2B54), Color(0xB30E1830)]
                  : const [Color(0xE6FFFFFF), Color(0xCCEFF2FF)],
            ),
            borderRadius: BorderRadius.circular(30),
            border: Border.all(
                color: Theme.of(context).brightness == Brightness.dark
                    ? AppColors.glassStroke
                    : AppColors.lightGlassStroke),
            boxShadow: [
              BoxShadow(
                color: AppColors.electricPurple.withValues(alpha: 0.25),
                blurRadius: 28,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(items.length, (i) {
              final item = items[i];
              final active = i == current;
              return Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    ref.read(feedbackServiceProvider.notifier).tap();
                    item.onTap();
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOut,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    decoration: BoxDecoration(
                      gradient: active
                          ? const LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [Color(0x557B5CFF), Color(0x3300E5FF)],
                            )
                          : null,
                      borderRadius: BorderRadius.circular(22),
                      border: active
                          ? Border.all(color: AppColors.softCyan.withValues(alpha: 0.5))
                          : null,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AnimatedScale(
                          duration: const Duration(milliseconds: 220),
                          scale: active ? 1.18 : 1.0,
                          child: Icon(
                            item.icon,
                            size: 23,
                            color: active
                                ? AppColors.electricPurple
                                : Theme.of(context).brightness == Brightness.dark
                                    ? AppColors.textSecondary
                                    : AppColors.lightTextSecondary,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          l10n.t(item.labelKey),
                          maxLines: 1,
                          style: TextStyle(
                            color: active
                                ? Theme.of(context).brightness == Brightness.dark
                                    ? AppColors.textPrimary
                                    : AppColors.lightTextPrimary
                                : Theme.of(context).brightness == Brightness.dark
                                    ? AppColors.textMuted
                                    : AppColors.lightTextMuted,
                            fontSize: 10.5,
                            fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}
