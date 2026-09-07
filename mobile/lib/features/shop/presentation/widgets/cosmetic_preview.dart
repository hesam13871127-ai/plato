import 'package:flutter/material.dart';

import '../../../game/presentation/skins/skinned_pieces.dart';
import '../../../game/presentation/skins/table_skins.dart';
import '../../domain/entities/shop_item.dart';

/// Renders a live preview of a table cosmetic from its catalogue metadata:
/// piece sets show the four seat pieces in their material, playgrounds show
/// a felt swatch, dice sets show a die. Returns null for other item types so
/// callers can fall back to an icon.
class CosmeticPreview extends StatelessWidget {
  const CosmeticPreview({super.key, required this.type, required this.metadata, this.compact = false});

  final ShopItemType type;
  final Map<String, dynamic> metadata;
  final bool compact;

  static bool supports(ShopItemType type) =>
      type == ShopItemType.gamePiece || type == ShopItemType.boardTheme || type == ShopItemType.diceSet;

  @override
  Widget build(BuildContext context) {
    if (type == ShopItemType.gamePiece) {
      final skin = TableSkins.pieceSkin(metadata['piece'] as String?);
      return PieceSetPreview(skin: skin, size: compact ? 16 : 28);
    }
    if (type == ShopItemType.boardTheme) {
      final skin = TableSkins.playground(metadata['theme'] as String?);
      return PlaygroundPreview(skin: skin, width: compact ? 48 : 96, height: compact ? 32 : 58);
    }
    if (type == ShopItemType.diceSet) {
      final skin = TableSkins.diceSkin(metadata['dice'] as String?);
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SkinnedDie(skin: skin, value: 5, size: compact ? 22 : 38),
          SizedBox(width: compact ? 4 : 8),
          SkinnedDie(skin: skin, value: 3, size: compact ? 22 : 38),
        ],
      );
    }
    return const SizedBox.shrink();
  }
}

/// Small "applies to" caption for game-specific piece sets.
String cosmeticScopeLabel(Map<String, dynamic> metadata) {
  final game = metadata['game'] as String?;
  if (game == null || game.isEmpty) return 'All board games';
  const names = {
    'chess': 'Chess',
    'pool_8ball': 'Pool',
    'dominoes': 'Dominoes',
    'ludo': 'Ludo',
    'connect4': '4 in a Row',
    'checkers': 'Checkers',
    'reversi': 'Reversi',
    'backgammon': 'Backgammon',
  };
  return names[game] ?? game;
}
