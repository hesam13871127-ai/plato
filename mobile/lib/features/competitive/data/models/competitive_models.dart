import '../../domain/entities/season_ranking.dart';

/// JSON parsing for the `/competitive` endpoints. All access is defensive:
/// malformed or missing fields fall back to safe defaults so a partial server
/// frame never crashes the UI.
class SeasonInfoModel {
  static SeasonInfo fromJson(Map<String, dynamic> json, List<RankRewardInfo> ranks) {
    return SeasonInfo(
      id: (json['id'] as String?) ?? '',
      name: (json['name'] as String?) ?? 'Season',
      seasonNumber: _int(json['seasonNumber']),
      status: (json['status'] as String?) ?? 'active',
      startsAt: _date(json['startsAt']),
      endsAt: _date(json['endsAt']),
      timeRemainingMs: _int(json['timeRemainingMs']),
      ranks: ranks,
    );
  }

  static List<RankRewardInfo> parseRanks(List<dynamic>? raw) {
    return (raw ?? const [])
        .whereType<Map>()
        .map((m) {
          final reward = (m['reward'] as Map?) ?? const {};
          return RankRewardInfo(
            tier: RankTier.fromWire(m['tier'] as String?),
            label: (m['label'] as String?) ?? '',
            minRating: _int(m['minRating']),
            colorValue: _int(m['color']),
            coins: _int(reward['coins']),
            pips: _int(reward['pips']),
            xp: _int(reward['xp']),
            title: (reward['title'] as String?) ?? '',
          );
        })
        .toList();
  }

  static int _int(dynamic v) => v is num ? v.toInt() : 0;
  static DateTime _date(dynamic v) => v is String ? DateTime.tryParse(v) ?? DateTime.now() : DateTime.now();
}

class LeaderboardModel {
  static Leaderboard fromJson(Map<String, dynamic> json) {
    final entries = ((json['entries'] as List?) ?? const [])
        .whereType<Map>()
        .map(LeaderboardEntryModel.fromJson)
        .toList();
    final selfJson = json['self'] as Map?;
    return Leaderboard(
      scope: (json['scope'] as String?) ?? 'global',
      gameSlug: json['game'] as String?,
      entries: entries,
      self: selfJson != null ? LeaderboardEntryModel.fromJson(selfJson) : null,
      totalPlayers: _int(json['totalPlayers']),
    );
  }

  static int _int(dynamic v) => v is num ? v.toInt() : 0;
}

class LeaderboardEntryModel {
  static LeaderboardEntry fromJson(Map<dynamic, dynamic> map) {
    return LeaderboardEntry(
      rank: _int(map['rank']),
      userId: (map['userId'] as String?) ?? '',
      displayName: (map['displayName'] as String?) ?? 'Player',
      username: (map['username'] as String?) ?? 'player',
      avatarUrl: map['avatarUrl'] as String?,
      rating: _int(map['rating']),
      peakRating: _int(map['peakRating']),
      tier: RankTier.fromWire(map['tier'] as String?),
      wins: _int(map['wins']),
      losses: _int(map['losses']),
      draws: _int(map['draws']),
      matchesPlayed: _int(map['matchesPlayed']),
      isSelf: map['isSelf'] == true,
    );
  }

  static int _int(dynamic v) => v is num ? v.toInt() : 0;
}

class MyRankingModel {
  static MyRanking fromJson(Map<String, dynamic> json) {
    final globalJson = json['global'] as Map?;
    final games = ((json['games'] as List?) ?? const [])
        .whereType<Map>()
        .map((m) => _entry(m))
        .toList();
    return MyRanking(
      overall: globalJson != null ? _entry(globalJson) : null,
      games: games,
    );
  }

  static MyRankingEntry _entry(Map<dynamic, dynamic> map) {
    return MyRankingEntry(
      gameSlug: map['gameSlug'] as String?,
      gameName: map['gameName'] as String?,
      rating: _int(map['rating']),
      peakRating: _int(map['peakRating']),
      tier: RankTier.fromWire(map['tier'] as String?),
      wins: _int(map['wins']),
      losses: _int(map['losses']),
      draws: _int(map['draws']),
      matchesPlayed: _int(map['matchesPlayed']),
    );
  }

  static int _int(dynamic v) => v is num ? v.toInt() : 0;
}
