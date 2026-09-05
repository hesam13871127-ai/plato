import 'package:equatable/equatable.dart';

/// The three competitive rank tiers, ordered Bronze → Gold.
enum RankTier {
  bronze,
  silver,
  gold;

  String get wire => switch (this) {
        RankTier.bronze => 'bronze',
        RankTier.silver => 'silver',
        RankTier.gold => 'gold',
      };

  static RankTier fromWire(String? value) => switch (value) {
        'silver' => RankTier.silver,
        'gold' => RankTier.gold,
        _ => RankTier.bronze,
      };

  String get label => switch (this) {
        RankTier.bronze => 'Bronze',
        RankTier.silver => 'Silver',
        RankTier.gold => 'Gold',
      };

  /// Brand/medal accent colour (matches the backend tier palette).
  int get colorValue => switch (this) {
        RankTier.bronze => 0xFFB07B4F,
        RankTier.silver => 0xFF9FB2C9,
        RankTier.gold => 0xFFF2C14E,
      };
}

/// Current season descriptor with a live countdown and reward sets.
class SeasonInfo extends Equatable {
  const SeasonInfo({
    required this.id,
    required this.name,
    required this.seasonNumber,
    required this.status,
    required this.startsAt,
    required this.endsAt,
    required this.timeRemainingMs,
    required this.ranks,
  });

  final String id;
  final String name;
  final int seasonNumber;
  final String status;
  final DateTime startsAt;
  final DateTime endsAt;
  final int timeRemainingMs;
  final List<RankRewardInfo> ranks;

  @override
  List<Object?> get props => [id, seasonNumber, status, timeRemainingMs];
}

/// A rank tier's threshold and the full season reward set for reaching it.
class RankRewardInfo extends Equatable {
  const RankRewardInfo({
    required this.tier,
    required this.label,
    required this.minRating,
    required this.colorValue,
    required this.coins,
    required this.pips,
    required this.xp,
    required this.title,
  });

  final RankTier tier;
  final String label;
  final int minRating;
  final int colorValue;
  final int coins;
  final int pips;
  final int xp;
  final String title;

  @override
  List<Object?> get props => [tier, minRating];
}

/// A single row on a leaderboard.
class LeaderboardEntry extends Equatable {
  const LeaderboardEntry({
    required this.rank,
    required this.userId,
    required this.displayName,
    required this.username,
    required this.avatarUrl,
    required this.rating,
    required this.peakRating,
    required this.tier,
    required this.wins,
    required this.losses,
    required this.draws,
    required this.matchesPlayed,
    required this.isSelf,
  });

  final int rank;
  final String userId;
  final String displayName;
  final String username;
  final String? avatarUrl;
  final int rating;
  final int peakRating;
  final RankTier tier;
  final int wins;
  final int losses;
  final int draws;
  final int matchesPlayed;
  final bool isSelf;

  @override
  List<Object?> get props => [userId, rank, rating, isSelf];
}

/// A leaderboard response: the ordered rows plus the caller's own row.
class Leaderboard extends Equatable {
  const Leaderboard({
    required this.scope,
    required this.gameSlug,
    required this.entries,
    required this.self,
    required this.totalPlayers,
  });

  final String scope;
  final String? gameSlug;
  final List<LeaderboardEntry> entries;
  final LeaderboardEntry? self;
  final int totalPlayers;

  @override
  List<Object?> get props => [scope, gameSlug, entries, self, totalPlayers];
}

/// The player's own standing: overall rating plus per-game ratings.
class MyRanking extends Equatable {
  const MyRanking({required this.overall, required this.games});

  final MyRankingEntry? overall;
  final List<MyRankingEntry> games;

  @override
  List<Object?> get props => [overall, games];
}

class MyRankingEntry extends Equatable {
  const MyRankingEntry({
    required this.gameSlug,
    required this.gameName,
    required this.rating,
    required this.peakRating,
    required this.tier,
    required this.wins,
    required this.losses,
    required this.draws,
    required this.matchesPlayed,
  });

  final String? gameSlug;
  final String? gameName;
  final int rating;
  final int peakRating;
  final RankTier tier;
  final int wins;
  final int losses;
  final int draws;
  final int matchesPlayed;

  @override
  List<Object?> get props => [gameSlug, rating, peakRating, wins, losses];
}
