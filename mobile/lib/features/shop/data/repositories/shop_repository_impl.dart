import 'package:fpdart/fpdart.dart';

import '../../../../core/error/error_mapper.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/inventory_item.dart';
import '../../domain/entities/shop_item.dart';
import '../../domain/entities/wallet_transaction.dart';
import '../../domain/repositories/shop_repository.dart';
import '../datasources/shop_remote_datasource.dart';

class ShopRepositoryImpl implements ShopRepository {
  ShopRepositoryImpl({required ShopRemoteDataSource remoteDataSource})
      : _remote = remoteDataSource;

  final ShopRemoteDataSource _remote;

  @override
  Future<Either<Failure, List<ShopItem>>> listItems({ShopItemType? type}) {
    return _guard(() async {
      final models = await _remote.listItems(type: type?.wire);
      return models.cast<ShopItem>();
    });
  }

  @override
  Future<Either<Failure, List<InventoryItem>>> listInventory() {
    return _guard(() async {
      final models = await _remote.listInventory();
      return models.cast<InventoryItem>();
    });
  }

  @override
  Future<Either<Failure, WalletMutation>> purchaseItem({required String itemId}) {
    return _guard(() async {
      final inventory = await _remote.purchase(itemId: itemId);
      // Balances are refreshed by the caller via the profile/daily panel; the
      // inventory row is returned so the UI can optimistically update.
      return WalletMutation(balanceCoins: 0, balancePips: 0, inventory: inventory);
    });
  }

  @override
  Future<Either<Failure, void>> giftItem({
    required String itemId,
    required String recipientUsername,
    String? message,
  }) {
    return _guard(() async {
      await _remote.gift(
        itemId: itemId,
        recipientUsername: recipientUsername,
        message: message,
      );
    });
  }

  @override
  Future<Either<Failure, void>> equipItem({required String inventoryId}) {
    return _guard(() => _remote.equip(inventoryId: inventoryId));
  }

  @override
  Future<Either<Failure, void>> unequipItem({required String inventoryId}) {
    return _guard(() => _remote.unequip(inventoryId: inventoryId));
  }

  @override
  Future<Either<Failure, void>> changeUsername({required String username}) {
    return _guard(() => _remote.changeUsername(username: username));
  }

  @override
  Future<Either<Failure, List<WalletTransaction>>> listTransactions({
    int page = 1,
    int limit = 20,
  }) {
    return _guard(() async {
      final models = await _remote.listTransactions(page: page, limit: limit);
      return models.cast<WalletTransaction>();
    });
  }

  Future<Either<Failure, T>> _guard<T>(Future<T> Function() call) async {
    try {
      return Right(await call());
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }
}
