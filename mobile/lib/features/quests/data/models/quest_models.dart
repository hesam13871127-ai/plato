import '../../domain/entities/daily_quests.dart';

/// JSON (de)serialisation for [UserQuest].
class UserQuestModel extends UserQuest {
  const UserQuestModel({
    required super.id,
    required super.questId,
    required super.goalType,
    required super.name,
    required super.description,
    required super.progress,
    required super.goalTarget,
    required super.status,
    required super.rewardCoins,
    required super.rewardPips,
    required super.rewardXp,
  });

  factory UserQuestModel.fromJson(Map<String, dynamic> json) {
    return UserQuestModel(
      id: json['id'] as String? ?? '',
      questId: json['questId'] as String? ?? '',
      goalType: json['goalType'] as String? ?? '',
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      progress: _asInt(json['progress']),
      goalTarget: _asInt(json['goalTarget'], fallback: 1),
      status: QuestStatus.fromWire(json['status'] as String? ?? 'in_progress'),
      rewardCoins: _asInt(json['rewardCoins']),
      rewardPips: _asInt(json['rewardPips']),
      rewardXp: _asInt(json['rewardXp']),
    );
  }

  static int _asInt(dynamic value, {int fallback = 0}) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value) ?? fallback;
    return fallback;
  }
}

/// JSON (de)serialisation for [DailyReward].
class DailyRewardModel extends DailyReward {
  const DailyRewardModel({
    required super.today,
    required super.nextStreakDay,
    required super.claimedToday,
    required super.rewardCoins,
    required super.rewardPips,
  });

  factory DailyRewardModel.fromJson(Map<String, dynamic> json) {
    return DailyRewardModel(
      today: json['today'] as String? ?? '',
      nextStreakDay: _asInt(json['nextStreakDay'], fallback: 1),
      claimedToday: json['claimedToday'] as bool? ?? false,
      rewardCoins: _asInt(json['rewardCoins']),
      rewardPips: _asInt(json['rewardPips']),
    );
  }

  static int _asInt(dynamic value, {int fallback = 0}) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value) ?? fallback;
    return fallback;
  }
}

/// JSON (de)serialisation for [ClaimResult].
class ClaimResultModel extends ClaimResult {
  const ClaimResultModel({
    required super.coinsAwarded,
    required super.pipsAwarded,
    required super.xpAwarded,
    required super.newStreakDay,
    required super.balance,
  });

  factory ClaimResultModel.fromJson(Map<String, dynamic> json) {
    final balance = json['balance'] is Map<String, dynamic>
        ? WalletBalance.fromJson(json['balance'] as Map<String, dynamic>)
        : const WalletBalance(coins: 0, pips: 0);
    return ClaimResultModel(
      coinsAwarded: _asInt(json['coinsAwarded']),
      pipsAwarded: _asInt(json['pipsAwarded']),
      xpAwarded: _asInt(json['xpAwarded']),
      newStreakDay: _asInt(json['newStreakDay']),
      balance: balance,
    );
  }

  static int _asInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value) ?? 0;
    return 0;
  }
}
