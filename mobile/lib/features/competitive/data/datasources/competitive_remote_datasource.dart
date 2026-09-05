import 'package:dio/dio.dart';

import '../../../../core/network/api_endpoints.dart';
import '../../domain/entities/season_ranking.dart';
import '../models/competitive_models.dart';

/// Thin HTTP client for the competitive ladder endpoints.
class CompetitiveRemoteDataSource {
  CompetitiveRemoteDataSource(this._dio);

  final Dio _dio;

  Future<SeasonInfo> getActiveSeason() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.competitiveSeason);
    final data = res.data?['data'] as Map<String, dynamic>? ?? const {};
    final seasonJson = data['season'] as Map<String, dynamic>?;
    final ranks = SeasonInfoModel.parseRanks(data['ranks'] as List?);
    if (seasonJson == null) {
      return SeasonInfo(
        id: '',
        name: 'Off-Season',
        seasonNumber: 0,
        status: 'upcoming',
        startsAt: DateTime.now(),
        endsAt: DateTime.now(),
        timeRemainingMs: 0,
        ranks: ranks,
      );
    }
    return SeasonInfoModel.fromJson(seasonJson, ranks);
  }

  Future<MyRanking> getMyRankings() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.competitiveMe);
    final data = res.data?['data'] as Map<String, dynamic>? ?? const {};
    return MyRankingModel.fromJson(data);
  }

  Future<Leaderboard> getLeaderboard({
    String? gameSlug,
    required bool friends,
    int limit = 50,
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiEndpoints.competitiveLeaderboard,
      queryParameters: <String, dynamic>{
        if (gameSlug != null) 'game': gameSlug,
        'scope': friends ? 'friends' : 'global',
        'limit': limit,
      },
    );
    final data = res.data?['data'] as Map<String, dynamic>? ?? const {};
    return LeaderboardModel.fromJson(data);
  }
}
