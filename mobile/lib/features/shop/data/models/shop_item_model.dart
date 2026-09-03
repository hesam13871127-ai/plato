import '../../domain/entities/shop_item.dart';

/// JSON (de)serialisation for [ShopItem].
class ShopItemModel extends ShopItem {
  const ShopItemModel({
    required super.id,
    required super.name,
    required super.description,
    required super.type,
    required super.rarity,
    required super.price,
    required super.currency,
    required super.discountPercent,
    required super.effectivePrice,
    required super.isUniqueOwned,
    required super.giftable,
    required super.owned,
    required super.equipped,
    super.imageUrl,
    super.metadata = const {},
  });

  factory ShopItemModel.fromJson(Map<String, dynamic> json) {
    return ShopItemModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      type: ShopItemType.fromWire(json['type'] as String? ?? 'consumable'),
      rarity: json['rarity'] as String? ?? 'common',
      imageUrl: json['imageUrl'] as String?,
      price: _asInt(json['price']),
      currency: Currency.fromWire(json['currency'] as String? ?? 'coins'),
      discountPercent: _asInt(json['discountPercent']),
      effectivePrice: _asInt(json['effectivePrice']),
      isUniqueOwned: json['isUniqueOwned'] as bool? ?? true,
      giftable: json['giftable'] as bool? ?? false,
      owned: json['owned'] as bool? ?? false,
      equipped: json['equipped'] as bool? ?? false,
      metadata: (json['metadata'] as Map<String, dynamic>?) ?? const {},
    );
  }

  static int _asInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value) ?? 0;
    return 0;
  }
}
