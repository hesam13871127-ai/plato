import 'package:equatable/equatable.dart';

import 'shop_item.dart';

/// A single ledger entry in the user's wallet history.
class WalletTransaction extends Equatable {
  const WalletTransaction({
    required this.id,
    required this.type,
    required this.currency,
    required this.amount,
    required this.balanceAfter,
    required this.description,
    required this.createdAt,
    this.referenceType,
    this.referenceId,
  });

  final String id;

  /// Ledger type: purchase, gift_purchase, gift, daily_reward, quest_reward…
  final String type;
  final Currency currency;

  /// Signed amount — positive credit, negative debit.
  final int amount;
  final int balanceAfter;
  final String? referenceType;
  final String? referenceId;
  final String? description;
  final DateTime? createdAt;

  bool get isCredit => amount >= 0;

  @override
  List<Object?> get props => [id, type, currency, amount, balanceAfter, createdAt];
}
