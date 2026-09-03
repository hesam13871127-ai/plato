import 'package:fpdart/fpdart.dart';

import '../../../../core/error/failures.dart';
import '../entities/inventory_item.dart';
import '../entities/shop_item.dart';
import '../entities/wallet_transaction.dart';

/// Result of a successful purchase/gift.
class WalletMutation {
  const WalletMutation({required this.balanceCoins, required this.balancePips, this.inventory});

  final int balanceCoins;
  final int balancePips;
  final InventoryItem? inventory;
}

/// Access to the shop catalogue, inventory and wallet ledger.
abstract class ShopRepository {
  /// Lists catalogue items, optionally filtered by [type].
  Future<Either<Failure, List<ShopItem>>> listItems({ShopItemType? type});

  /// Lists the current user's owned inventory.
  Future<Either<Failure, List<InventoryItem>>> listInventory();

  /// Purchases an item for the current user.
  Future<Either<Failure, WalletMutation>> purchaseItem({required String itemId});

  /// Gifts a giftable item to another user by username.
  Future<Either<Failure, void>> giftItem({
    required String itemId,
    required String recipientUsername,
    String? message,
  });

  /// Equips an owned inventory item in its cosmetic slot.
  Future<Either<Failure, void>> equipItem({required String inventoryId});

  /// Unequips an owned inventory item.
  Future<Either<Failure, void>> unequipItem({required String inventoryId});

  /// Consumes a username-change token to rename the account.
  Future<Either<Failure, void>> changeUsername({required String username});

  /// Paginated wallet transaction history.
  Future<Either<Failure, List<WalletTransaction>>> listTransactions({int page = 1, int limit = 20});
}
