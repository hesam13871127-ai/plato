import 'package:fpdart/fpdart.dart';

import '../../../../core/error/error_mapper.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/daily_quests.dart';
import '../../domain/repositories/quests_repository.dart';
import '../datasources/quests_remote_datasource.dart';

class QuestsRepositoryImpl implements QuestsRepository {
  QuestsRepositoryImpl({required QuestsRemoteDataSource remoteDataSource})
      : _remote = remoteDataSource;

  final QuestsRemoteDataSource _remote;

  @override
  Future<Either<Failure, DailyPanel>> getDailyPanel() {
    return _guard(() => _remote.getDailyPanel());
  }

  @override
  Future<Either<Failure, ClaimResult>> claimDailyReward() {
    return _guard(() async {
      final model = await _remote.claimDaily();
      return ClaimResult(
        coinsAwarded: model.coinsAwarded,
        pipsAwarded: model.pipsAwarded,
        xpAwarded: model.xpAwarded,
        newStreakDay: model.newStreakDay,
        balance: model.balance,
      );
    });
  }

  @override
  Future<Either<Failure, ClaimResult>> claimQuest({required String userQuestId}) {
    return _guard(() async {
      final model = await _remote.claimQuest(userQuestId: userQuestId);
      return ClaimResult(
        coinsAwarded: model.coinsAwarded,
        pipsAwarded: model.pipsAwarded,
        xpAwarded: model.xpAwarded,
        newStreakDay: model.newStreakDay,
        balance: model.balance,
      );
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
