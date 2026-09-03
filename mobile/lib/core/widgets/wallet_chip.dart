import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Compact coin + pips balance indicator used in app bars and cards.
class WalletChip extends StatelessWidget {
  const WalletChip({super.key, required this.coins, required this.pips, this.compact = false});

  final int coins;
  final int pips;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 10 : 14, vertical: compact ? 6 : 10),
      decoration: BoxDecoration(
        color: AppColors.glassFill,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.glassStroke),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.monetization_on_rounded, color: AppColors.softCyan, size: 18),
          const SizedBox(width: 6),
          Text(_format(coins),
              style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
          const SizedBox(width: 12),
          const Icon(Icons.diamond_rounded, color: AppColors.electricPurple, size: 18),
          const SizedBox(width: 6),
          Text(_format(pips),
              style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
        ],
      ),
    );
  }

  static String _format(int value) {
    if (value >= 1000000) return '${(value / 1000000).toStringAsFixed(1)}M';
    if (value >= 1000) return '${(value / 1000).toStringAsFixed(1)}k';
    return '$value';
  }
}
