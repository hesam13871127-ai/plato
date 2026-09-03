import 'package:dio/dio.dart';

import '../../../../core/network/api_endpoints.dart';
import '../../domain/repositories/quests_repository.dart';
import '../models/quest_models.dart';

/// Thin HTTP client for the daily-reward + quest endpoints.
class QuestsRemoteDataSource {
  QuestsRemoteDataSource(this._dio);

  final Dio _dio;

  Future<DailyPanel> getDailyPanel() async {
    final response = await _dio.get<Map<String, dynamic>>(ApiEndpoints.questsDaily);
    final data = response.data?['data'] as Map<String, dynamic>? ?? const {};

    final dailyJson = data['daily'] as Map<String, dynamic>? ?? const {};
    final questsJson = (data['quests'] as List?) ?? const [];

    final daily = DailyRewardModel.fromJson(dailyJson);
    final quests = questsJson
        .whereType<Map<String, dynamic>>()
        .map(UserQuestModel.fromJson)
        .toList();

    return DailyPanel(daily: daily, quests: quests);
  }

  Future<ClaimResultModel> claimDaily() async {
    final response = await _dio.post<Map<String, dynamic>>(ApiEndpoints.questsDailyClaim);
    final data = response.data?['data'] as Map<String, dynamic>? ?? const {};
    return ClaimResultModel.fromJson(data);
  }

  Future<ClaimResultModel> claimQuest({required String userQuestId}) async {
    final response = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.questClaim(userQuestId),
    );
    final data = response.data?['data'] as Map<String, dynamic>? ?? const {};
    return ClaimResultModel.fromJson(data);
  }
}
