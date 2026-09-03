import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/dio_client.dart';
import '../../data/datasources/shop_remote_datasource.dart';
import '../../data/repositories/shop_repository_impl.dart';
import '../../domain/entities/inventory_item.dart';
import '../../domain/entities/shop_item.dart';
import '../../domain/entities/wallet_transaction.dart';
import '../../domain/repositories/shop_repository.dart';

final shopRemoteDataSourceProvider = Provider<ShopRemoteDataSource>((ref) {
  return ShopRemoteDataSource(ref.watch(dioClientProvider).dio);
});

final shopRepositoryProvider = Provider<ShopRepository>((ref) {
  return ShopRepositoryImpl(
    remoteDataSource: ref.watch(shopRemoteDataSourceProvider),
  );
});

/// Lists catalogue items for a given category filter (null = all).
final shopItemsProvider =
    FutureProvider.autoDispose.family<List<ShopItem>, ShopItemType?>((ref, type) async {
  final result = await ref.watch(shopRepositoryProvider).listItems(type: type);
  return result.fold(
    (failure) => throw StateError(failure.message),
    (items) => items,
  );
});

/// The current user's owned inventory.
final inventoryProvider = FutureProvider.autoDispose<List<InventoryItem>>((ref) async {
  final result = await ref.watch(shopRepositoryProvider).listInventory();
  return result.fold(
    (failure) => throw StateError(failure.message),
    (items) => items,
  );
});

/// Wallet ledger for a given page.
final transactionsProvider =
    FutureProvider.autoDispose.family<List<WalletTransaction>, int>((ref, page) async {
  final result =
      await ref.watch(shopRepositoryProvider).listTransactions(page: page, limit: 50);
  return result.fold(
    (failure) => throw StateError(failure.message),
    (items) => items,
  );
});
