import '../../domain/entities/shop_item.dart';
import '../../domain/entities/wallet_transaction.dart';

/// JSON (de)serialisation for [WalletTransaction].
class WalletTransactionModel extends WalletTransaction {
  const WalletTransactionModel({
    required super.id,
    required super.type,
    required super.currency,
    required super.amount,
    required super.balanceAfter,
    required super.description,
    required super.createdAt,
    super.referenceType,
    super.referenceId,
  });

  factory WalletTransactionModel.fromJson(Map<String, dynamic> json) {
    return WalletTransactionModel(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? '',
      currency: Currency.fromWire(json['currency'] as String? ?? 'coins'),
      amount: _asInt(json['amount']),
      balanceAfter: _asInt(json['balanceAfter']),
      referenceType: json['referenceType'] as String?,
      referenceId: json['referenceId'] as String?,
      description: json['description'] as String?,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
    );
  }

  static int _asInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value) ?? 0;
    return 0;
  }
}
