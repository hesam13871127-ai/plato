import 'package:dio/dio.dart';

import '../../../../core/network/api_endpoints.dart';
import '../models/inventory_item_model.dart';
import '../models/shop_item_model.dart';
import '../models/wallet_transaction_model.dart';

/// Thin HTTP client for the shop/inventory/wallet endpoints.
class ShopRemoteDataSource {
  ShopRemoteDataSource(this._dio);

  final Dio _dio;

  Future<List<ShopItemModel>> listItems({String? type}) async {
    final response = await _dio.get<Map<String, dynamic>>(
      ApiEndpoints.shopItems,
      queryParameters: {if (type != null) 'type': type},
    );
    final items = (response.data?['data']?['items'] as List?) ?? const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(ShopItemModel.fromJson)
        .toList();
  }

  Future<List<InventoryItemModel>> listInventory() async {
    final response = await _dio.get<Map<String, dynamic>>(ApiEndpoints.shopInventory);
    final items = (response.data?['data']?['items'] as List?) ?? const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(InventoryItemModel.fromJson)
        .toList();
  }

  Future<InventoryItemModel?> purchase({required String itemId}) async {
    final response = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.shopPurchase,
      data: {'itemId': itemId},
    );
    final inv = response.data?['data']?['inventory'];
    return inv is Map<String, dynamic> ? InventoryItemModel.fromJson(inv) : null;
  }

  Future<void> gift({
    required String itemId,
    required String recipientUsername,
    String? message,
  }) async {
    await _dio.post<dynamic>(
      ApiEndpoints.shopGift,
      data: {
        'itemId': itemId,
        'recipientUsername': recipientUsername,
        if (message != null && message.isNotEmpty) 'message': message,
      },
    );
  }

  Future<void> equip({required String inventoryId}) async {
    await _dio.post<dynamic>(
      ApiEndpoints.shopEquip,
      data: {'inventoryId': inventoryId},
    );
  }

  Future<void> unequip({required String inventoryId}) async {
    await _dio.post<dynamic>(ApiEndpoints.shopUnequip(inventoryId));
  }

  Future<void> changeUsername({required String username}) async {
    await _dio.post<dynamic>(
      ApiEndpoints.shopUsernameChange,
      data: {'username': username},
    );
  }

  Future<List<WalletTransactionModel>> listTransactions({
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      ApiEndpoints.shopTransactions,
      queryParameters: {'page': page, 'limit': limit},
    );
    final items = (response.data?['data']?['items'] as List?) ?? const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(WalletTransactionModel.fromJson)
        .toList();
  }
}
