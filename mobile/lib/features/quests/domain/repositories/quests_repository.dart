import 'package:fpdart/fpdart.dart';

import '../../../../core/error/failures.dart';
import '../entities/daily_quests.dart';

/// Access to daily login rewards and the daily quest board.
abstract class QuestsRepository {
  /// Returns today's daily-reward state plus the quest board.
  Future<Either<Failure, DailyPanel>> getDailyPanel();

  /// Claims the free daily reward (once per day).
  Future<Either<Failure, ClaimResult>> claimDailyReward();

  /// Claims the reward for a completed quest.
  Future<Either<Failure, ClaimResult>> claimQuest({required String userQuestId});
}

/// Combined daily-reward state + quest list.
class DailyPanel {
  const DailyPanel({required this.daily, required this.quests});

  final DailyReward daily;
  final List<UserQuest> quests;
}
