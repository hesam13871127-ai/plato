import '../../domain/entities/inventory_item.dart';
import '../../domain/entities/shop_item.dart';

/// JSON (de)serialisation for [InventoryItem].
class InventoryItemModel extends InventoryItem {
  const InventoryItemModel({
    required super.id,
    required super.itemId,
    required super.name,
    required super.type,
    required super.rarity,
    required super.quantity,
    required super.isEquipped,
    required super.source,
    super.imageUrl,
    super.metadata = const {},
    super.acquiredAt,
  });

  factory InventoryItemModel.fromJson(Map<String, dynamic> json) {
    return InventoryItemModel(
      id: json['id'] as String? ?? '',
      itemId: json['itemId'] as String? ?? '',
      name: json['name'] as String? ?? '',
      type: ShopItemType.fromWire(json['type'] as String? ?? 'consumable'),
      rarity: json['rarity'] as String? ?? 'common',
      imageUrl: json['imageUrl'] as String?,
      quantity: _asInt(json['quantity'], fallback: 1),
      isEquipped: json['isEquipped'] as bool? ?? false,
      source: InventorySource.fromWire(json['source'] as String? ?? 'purchase'),
      metadata: (json['metadata'] as Map<String, dynamic>?) ?? const {},
      acquiredAt: DateTime.tryParse(json['acquiredAt'] as String? ?? ''),
    );
  }

  static int _asInt(dynamic value, {int fallback = 0}) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value) ?? fallback;
    return fallback;
  }
}
