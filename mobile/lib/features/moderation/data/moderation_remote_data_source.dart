import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_endpoints.dart';
import '../../../core/network/dio_client.dart';

/// A single report row in the moderator queue.
class ModerationReport {
  ModerationReport({
    required this.id,
    required this.reporterId,
    required this.targetType,
    required this.targetId,
    required this.reason,
    required this.status,
    this.details,
    this.resolutionNote,
    required this.createdAt,
  });

  final String id;
  final String reporterId;
  final String targetType;
  final String targetId;
  final String reason;
  final String status;
  final String? details;
  final String? resolutionNote;
  final DateTime createdAt;

  factory ModerationReport.fromJson(Map<String, dynamic> json) {
    return ModerationReport(
      id: json['id']?.toString() ?? '',
      reporterId: json['reporterId']?.toString() ?? '',
      targetType: json['targetType']?.toString() ?? 'user',
      targetId: json['targetId']?.toString() ?? '',
      reason: json['reason']?.toString() ?? 'other',
      status: json['status']?.toString() ?? 'open',
      details: json['details']?.toString(),
      resolutionNote: json['resolutionNote']?.toString(),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0),
    );
  }
}

/// A currently active ban row.
class ActiveBan {
  ActiveBan({
    required this.id,
    required this.userId,
    required this.type,
    this.reason,
    this.expiresAt,
    required this.createdAt,
  });

  final String id;
  final String userId;
  final String type;
  final String? reason;
  final DateTime? expiresAt;
  final DateTime createdAt;

  factory ActiveBan.fromJson(Map<String, dynamic> json) {
    final exp = json['expiresAt']?.toString();
    return ActiveBan(
      id: json['id']?.toString() ?? '',
      userId: json['userId']?.toString() ?? '',
      type: json['type']?.toString() ?? 'chat',
      reason: json['reason']?.toString(),
      expiresAt: exp == null ? null : DateTime.tryParse(exp),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0),
    );
  }
}

///
/// Thin data layer for the moderator/admin dashboard. Calls the Phase 9
/// moderation REST endpoints; access is enforced server-side by the role guard,
/// so a non-privileged account receives 403 regardless of what the client does.
///
class ModerationRemoteDataSource {
  ModerationRemoteDataSource(this._dio);
  final Dio _dio;

  /// Returns the caller's platform role ('player' | 'moderator' | 'admin').
  Future<String> myRole() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.me);
    final data = (res.data?['data'] as Map<String, dynamic>?) ?? const {};
    return (data['role']?.toString()) ?? 'player';
  }

  Future<List<ModerationReport>> fetchReports({String? status}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiEndpoints.moderationQueue,
      queryParameters: status == null ? null : {'status': status},
    );
    final data = res.data?['data'] as Map<String, dynamic>?;
    final items = (data?['items'] as List?) ?? const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(ModerationReport.fromJson)
        .toList();
  }

  Future<void> resolveReport({
    required String reportId,
    required String action,
    String? note,
    int? durationMinutes,
  }) async {
    await _dio.post<dynamic>(
      ApiEndpoints.moderationResolve(reportId),
      data: {
        'action': action,
        if (note != null && note.isNotEmpty) 'note': note,
        if (durationMinutes != null) 'durationMinutes': durationMinutes,
      },
    );
  }

  Future<List<ActiveBan>> fetchActiveBans() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.moderationBans);
    final data = res.data?['data'] as Map<String, dynamic>?;
    final items = (data?['items'] as List?) ?? const [];
    return items.whereType<Map<String, dynamic>>().map(ActiveBan.fromJson).toList();
  }

  Future<void> banUser({
    required String userId,
    required String type,
    int? durationMinutes,
    String? reason,
  }) async {
    await _dio.post<dynamic>(
      ApiEndpoints.moderationBans,
      data: {
        'userId': userId,
        'type': type,
        if (durationMinutes != null) 'durationMinutes': durationMinutes,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
    );
  }

  Future<void> liftBan(String userId) async {
    await _dio.post<dynamic>(ApiEndpoints.moderationLiftBan, data: {'userId': userId});
  }

  Future<void> deleteMessage({required String messageId, String? reason}) async {
    await _dio.post<dynamic>(
      ApiEndpoints.moderationDeleteMessage,
      data: {'messageId': messageId, if (reason != null && reason.isNotEmpty) 'reason': reason},
    );
  }
}

final moderationRemoteDataSourceProvider = Provider<ModerationRemoteDataSource>((ref) {
  return ModerationRemoteDataSource(ref.watch(dioClientProvider).dio);
});
