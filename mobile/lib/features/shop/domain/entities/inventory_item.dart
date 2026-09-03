import 'package:equatable/equatable.dart';

import 'shop_item.dart';

/// How an inventory item was acquired.
enum InventorySource {
  purchase,
  gift;

  static InventorySource fromWire(String value) =>
      value == 'gift' ? InventorySource.gift : InventorySource.purchase;
}

/// A cosmetic owned by the user (one row per unique item; consumables stack by
/// [quantity]).
class InventoryItem extends Equatable {
  const InventoryItem({
    required this.id,
    required this.itemId,
    required this.name,
    required this.type,
    required this.rarity,
    required this.quantity,
    required this.isEquipped,
    required this.source,
    this.imageUrl,
    this.metadata = const {},
    this.acquiredAt,
  });

  /// Inventory row id (used for equip/unequip calls).
  final String id;
  final String itemId;
  final String name;
  final ShopItemType type;
  final String rarity;
  final String? imageUrl;
  final int quantity;
  final bool isEquipped;
  final InventorySource source;
  final Map<String, dynamic> metadata;
  final DateTime? acquiredAt;

  @override
  List<Object?> get props => [id, itemId, name, type, quantity, isEquipped, source];
}
