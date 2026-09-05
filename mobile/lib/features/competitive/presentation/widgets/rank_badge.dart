import 'package:flutter/material.dart';

import '../../domain/entities/season_ranking.dart';

/// A circular medal-style badge for a rank tier (Bronze/Silver/Gold).
class RankBadge extends StatelessWidget {
  const RankBadge({super.key, required this.tier, this.size = 40});

  final RankTier tier;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = Color(tier.colorValue);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: [color.withValues(alpha: 0.9), color.withValues(alpha: 0.35)],
        ),
        border: Border.all(color: color.withValues(alpha: 0.9), width: 2),
        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.45), blurRadius: 12)],
      ),
      child: Icon(_iconFor(tier), color: Colors.white, size: size * 0.5),
    );
  }

  static IconData _iconFor(RankTier tier) => switch (tier) {
        RankTier.gold => Icons.workspace_premium_rounded,
        RankTier.silver => Icons.military_tech_rounded,
        RankTier.bronze => Icons.shield_rounded,
      };
}
