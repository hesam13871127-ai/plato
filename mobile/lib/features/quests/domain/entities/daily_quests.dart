import 'package:equatable/equatable.dart';

import '../../../shop/domain/entities/shop_item.dart';

/// Lifecycle status of a user's quest for the current day.
enum QuestStatus {
  inProgress,
  claimable,
  claimed;

  String get wire => switch (this) {
        QuestStatus.inProgress => 'in_progress',
        QuestStatus.claimable => 'claimable',
        QuestStatus.claimed => 'claimed',
      };

  static QuestStatus fromWire(String value) => switch (value) {
        'claimable' => QuestStatus.claimable,
        'claimed' => QuestStatus.claimed,
        _ => QuestStatus.inProgress,
      };
}

/// A daily quest with the user's progress for today.
class UserQuest extends Equatable {
  const UserQuest({
    required this.id,
    required this.questId,
    required this.goalType,
    required this.name,
    required this.description,
    required this.progress,
    required this.goalTarget,
    required this.status,
    required this.rewardCoins,
    required this.rewardPips,
    required this.rewardXp,
  });

  /// User-quest instance id (used in the claim endpoint).
  final String id;
  final String questId;
  final String goalType;
  final String name;
  final String? description;
  final int progress;
  final int goalTarget;
  final QuestStatus status;
  final int rewardCoins;
  final int rewardPips;
  final int rewardXp;

  double get progressFraction =>
      goalTarget <= 0 ? 0 : (progress / goalTarget).clamp(0, 1);

  @override
  List<Object?> get props => [id, progress, status];
}

/// Today's free daily-login reward state.
class DailyReward extends Equatable {
  const DailyReward({
    required this.today,
    required this.nextStreakDay,
    required this.claimedToday,
    required this.rewardCoins,
    required this.rewardPips,
  });

  final String today;
  final int nextStreakDay;
  final bool claimedToday;
  final int rewardCoins;
  final int rewardPips;

  @override
  List<Object?> get props => [today, nextStreakDay, claimedToday];
}

/// Result returned by a claim (daily reward or quest).
class ClaimResult extends Equatable {
  const ClaimResult({
    required this.coinsAwarded,
    required this.pipsAwarded,
    required this.xpAwarded,
    required this.newStreakDay,
    required this.balance,
  });

  final int coinsAwarded;
  final int pipsAwarded;
  final int xpAwarded;
  final int newStreakDay;
  final WalletBalance balance;

  @override
  List<Object?> get props => [coinsAwarded, pipsAwarded, xpAwarded, newStreakDay];
}

/// Currency balance returned by mutating endpoints.
class WalletBalance extends Equatable {
  const WalletBalance({required this.coins, required this.pips});

  final int coins;
  final int pips;

  factory WalletBalance.fromJson(Map<String, dynamic> json) => WalletBalance(
        coins: _asInt(json['coins']),
        pips: _asInt(json['pips']),
      );

  int amount(Currency currency) => currency == Currency.coins ? coins : pips;

  static int _asInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value) ?? 0;
    return 0;
  }

  @override
  List<Object?> get props => [coins, pips];
}
