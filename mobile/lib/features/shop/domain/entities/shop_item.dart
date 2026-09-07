import 'package:equatable/equatable.dart';

/// Shop category. Must stay in sync with the backend `ItemType` enum.
enum ShopItemType {
  avatarFrame,
  banner,
  chatBubble,
  theme,
  gameSkin,
  gamePiece,
  boardTheme,
  idColor,
  usernameChange,
  diceSet,
  emote,
  bundle,
  consumable;

  /// Wire value used by the API (snake_case).
  String get wire => switch (this) {
        ShopItemType.avatarFrame => 'avatar_frame',
        ShopItemType.banner => 'banner',
        ShopItemType.chatBubble => 'chat_bubble',
        ShopItemType.theme => 'theme',
        ShopItemType.gameSkin => 'game_skin',
        ShopItemType.gamePiece => 'game_piece',
        ShopItemType.boardTheme => 'board_theme',
        ShopItemType.idColor => 'id_color',
        ShopItemType.usernameChange => 'username_change',
        ShopItemType.diceSet => 'dice_set',
        ShopItemType.emote => 'emote',
        ShopItemType.bundle => 'bundle',
        ShopItemType.consumable => 'consumable',
      };

  static ShopItemType fromWire(String value) {
    return ShopItemType.values.firstWhere(
      (t) => t.wire == value,
      orElse: () => ShopItemType.consumable,
    );
  }

  /// Human label for the category filter chips.
  String get label => switch (this) {
        ShopItemType.avatarFrame => 'Frames',
        ShopItemType.banner => 'Banners',
        ShopItemType.chatBubble => 'Chat Bubbles',
        ShopItemType.theme => 'Themes',
        ShopItemType.gameSkin => 'Game Skins',
        ShopItemType.gamePiece => 'Game Pieces',
        ShopItemType.boardTheme => 'Board Themes',
        ShopItemType.idColor => 'ID Color',
        ShopItemType.usernameChange => 'Username',
        ShopItemType.diceSet => 'Dice',
        ShopItemType.emote => 'Emotes',
        ShopItemType.bundle => 'Bundles',
        ShopItemType.consumable => 'Consumables',
      };
}

/// Premium/soft currency a price is denominated in.
enum Currency {
  coins,
  pips;

  String get wire => name;

  static Currency fromWire(String value) =>
      value == 'pips' ? Currency.pips : Currency.coins;
}

/// A purchasable catalogue item.
class ShopItem extends Equatable {
  const ShopItem({
    required this.id,
    required this.name,
    required this.description,
    required this.type,
    required this.rarity,
    required this.price,
    required this.currency,
    required this.discountPercent,
    required this.effectivePrice,
    required this.isUniqueOwned,
    required this.giftable,
    required this.owned,
    required this.equipped,
    this.imageUrl,
    this.metadata = const {},
  });

  final String id;
  final String name;
  final String? description;
  final ShopItemType type;
  final String rarity;
  final String? imageUrl;
  final int price;
  final Currency currency;
  final int discountPercent;
  final int effectivePrice;
  final bool isUniqueOwned;
  final bool giftable;
  final bool owned;
  final bool equipped;
  final Map<String, dynamic> metadata;

  bool get isDiscounted => discountPercent > 0;

  @override
  List<Object?> get props => [
        id,
        name,
        type,
        rarity,
        price,
        currency,
        discountPercent,
        effectivePrice,
        isUniqueOwned,
        giftable,
        owned,
        equipped,
      ];
}
