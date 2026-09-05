import 'package:fpdart/fpdart.dart';

import '../../../../core/error/failures.dart';
import '../entities/season_ranking.dart';

/// Access to the ranked ladder: the active season + reward sets, the player's
/// own rankings, and global / friends / per-game leaderboards.
abstract class CompetitiveRepository {
  /// Active season (with countdown) and the Bronze/Silver/Gold reward sets.
  Future<Either<Failure, SeasonInfo>> getActiveSeason();

  /// The caller's overall rating plus per-game ratings for the season.
  Future<Either<Failure, MyRanking>> getMyRankings();

  /// Leaderboard. Pass [gameSlug] for a per-game board, null for global;
  /// [friends] switches to the friends-only board.
  Future<Either<Failure, Leaderboard>> getLeaderboard({
    String? gameSlug,
    required bool friends,
    int limit = 50,
  });
}
