import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/dio_client.dart';
import '../../data/datasources/competitive_remote_datasource.dart';
import '../../data/repositories/competitive_repository_impl.dart';
import '../../domain/entities/season_ranking.dart';
import '../../domain/repositories/competitive_repository.dart';

final competitiveRemoteDataSourceProvider = Provider<CompetitiveRemoteDataSource>((ref) {
  return CompetitiveRemoteDataSource(ref.watch(dioClientProvider).dio);
});

final competitiveRepositoryProvider = Provider<CompetitiveRepository>((ref) {
  return CompetitiveRepositoryImpl(
    remoteDataSource: ref.watch(competitiveRemoteDataSourceProvider),
  );
});

/// Active season + Bronze/Silver/Gold reward sets.
final seasonProvider = FutureProvider.autoDispose<SeasonInfo>((ref) async {
  final result = await ref.watch(competitiveRepositoryProvider).getActiveSeason();
  return result.fold(
    (failure) => throw StateError(failure.message),
    (season) => season,
  );
});

/// The player's overall and per-game ratings.
final myRankingsProvider = FutureProvider.autoDispose<MyRanking>((ref) async {
  final result = await ref.watch(competitiveRepositoryProvider).getMyRankings();
  return result.fold(
    (failure) => throw StateError(failure.message),
    (rankings) => rankings,
  );
});

/// Query parameters for a leaderboard (game + scope).
class LeaderboardQuery {
  const LeaderboardQuery({this.gameSlug, this.friends = false});

  final String? gameSlug;
  final bool friends;

  String get key => '${gameSlug ?? 'global'}:${friends ? 'friends' : 'global'}';

  @override
  bool operator ==(Object other) =>
      other is LeaderboardQuery && other.gameSlug == gameSlug && other.friends == friends;

  @override
  int get hashCode => Object.hash(gameSlug, friends);
}

/// Global / per-game / friends leaderboards, keyed by the query.
final leaderboardProvider =
    FutureProvider.autoDispose.family<Leaderboard, LeaderboardQuery>((ref, query) async {
  final result = await ref.watch(competitiveRepositoryProvider).getLeaderboard(
        gameSlug: query.gameSlug,
        friends: query.friends,
      );
  return result.fold(
    (failure) => throw StateError(failure.message),
    (board) => board,
  );
});
