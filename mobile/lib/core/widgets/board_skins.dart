import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Board & piece skin definitions. Every game ships with one beautiful default
/// skin; additional skins are sold in the Shop (board_theme / game_piece /
/// dice_set). The selected skin is read from the equipped inventory (or falls
/// back to the default) and threaded into each board via [BoardSkinScope].
class BoardSkin {
  const BoardSkin({
    required this.id,
    required this.name,
    required this.feltTop,
    required this.feltBottom,
    required this.edge,
    required this.accent,
  });
  final String id;
  final String name;
  final Color feltTop;
  final Color feltBottom;
  final Color edge;
  final Color accent;

  static const midnight = BoardSkin(
    id: 'midnight', name: 'Midnight Velvet',
    feltTop: Color(0xFF1E3A5A), feltBottom: Color(0xFF0B1A2E), edge: Color(0xFF0D213A), accent: AppColors.electricPurple,
  );
  static const emerald = BoardSkin(
    id: 'emerald', name: 'Emerald Felt',
    feltTop: Color(0xFF0E6B3A), feltBottom: Color(0xFF06301F), edge: Color(0xFF0A3D28), accent: Color(0xFF22C55E),
  );
  static const crimson = BoardSkin(
    id: 'crimson', name: 'Crimson Royale',
    feltTop: Color(0xFF7A1C2E), feltBottom: Color(0xFF3D0E18), edge: Color(0xFF4A1420), accent: Color(0xFFEF4444),
  );
  static const cosmic = BoardSkin(
    id: 'cosmic', name: 'Cosmic Nebula',
    feltTop: Color(0xFF3B1A6B), feltBottom: Color(0xFF1A0F2E), edge: Color(0xFF24104A), accent: AppColors.neonPink,
  );
  static const wood = BoardSkin(
    id: 'wood', name: 'Amber Wood',
    feltTop: Color(0xFF8B5A2B), feltBottom: Color(0xFF4A2E12), edge: Color(0xFF5A3520), accent: Color(0xFFF59E0B),
  );
  static const arctic = BoardSkin(
    id: 'arctic', name: 'Arctic Ice',
    feltTop: Color(0xFF1B4A5A), feltBottom: Color(0xFF0B2430), edge: Color(0xFF123040), accent: AppColors.softCyan,
  );

  static const all = [midnight, emerald, crimson, cosmic, wood, arctic];
  static BoardSkin byId(String? id) => all.firstWhere((s) => s.id == id, orElse: () => midnight);
}

/// Piece-set preset (shape + palette override). The default set is free; the
/// rest are purchasable game_piece SKUs.
class PieceSet {
  const PieceSet(this.id, this.name, this.emoji);
  final String id;
  final String name;
  final String emoji;
  static const classic = PieceSet('classic', 'Classic', '♟');
  static const neon = PieceSet('neon', 'Neon Pulse', '✦');
  static const crystal = PieceSet('crystal', 'Crystal', '💎');
  static const gold = PieceSet('gold', 'Golden Crown', '👑');
  static const all = [classic, neon, crystal, gold];
}
