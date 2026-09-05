import 'package:fpdart/fpdart.dart';

import '../../../../core/error/error_mapper.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/season_ranking.dart';
import '../../domain/repositories/competitive_repository.dart';
import '../datasources/competitive_remote_datasource.dart';

class CompetitiveRepositoryImpl implements CompetitiveRepository {
  CompetitiveRepositoryImpl({required CompetitiveRemoteDataSource remoteDataSource})
      : _remote = remoteDataSource;

  final CompetitiveRemoteDataSource _remote;

  @override
  Future<Either<Failure, SeasonInfo>> getActiveSeason() =>
      _guard(() => _remote.getActiveSeason());

  @override
  Future<Either<Failure, MyRanking>> getMyRankings() =>
      _guard(() => _remote.getMyRankings());

  @override
  Future<Either<Failure, Leaderboard>> getLeaderboard({
    String? gameSlug,
    required bool friends,
    int limit = 50,
  }) =>
      _guard(
        () => _remote.getLeaderboard(gameSlug: gameSlug, friends: friends, limit: limit),
      );

  Future<Either<Failure, T>> _guard<T>(Future<T> Function() call) async {
    try {
      return Right(await call());
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }
}
