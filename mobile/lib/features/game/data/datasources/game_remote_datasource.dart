import 'package:dio/dio.dart';

import '../../../../core/network/api_endpoints.dart';
import '../models/game_models.dart';

/// REST client for `/api/games`: catalogue, matchmaking queue, lobby/room
/// management and session-state snapshots (used for reconnect / refresh).
class GameRemoteDataSource {
  GameRemoteDataSource(this._dio);

  final Dio _dio;

  Map<String, dynamic> _payload(Response<Map<String, dynamic>> res) =>
      (res.data?['data'] as Map<String, dynamic>?) ?? const <String, dynamic>{};

  Future<List<GameCatalogEntryModel>> getCatalog() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.gamesCatalog);
    final items = (_payload(res)['games'] as List?) ?? const [];
    return items
        .whereType<Map>()
        .map((e) => GameCatalogEntryModel.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<List<GameRoomModel>> openRooms({String? gameSlug}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiEndpoints.gamesOpenRooms,
      queryParameters: gameSlug == null ? null : {'game': gameSlug},
    );
    final items = (_payload(res)['rooms'] as List?) ?? const [];
    return items
        .whereType<Map>()
        .map((e) => GameRoomModel.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<void> enqueue({
    required String gameSlug,
    required bool isRanked,
    int? seats,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.gamesEnqueue,
      data: {
        'gameSlug': gameSlug,
        'isRanked': isRanked,
        if (seats != null) 'seats': seats,
      },
    );
  }

  Future<void> cancelMatchmaking() async {
    await _dio.post<Map<String, dynamic>>(ApiEndpoints.gamesCancelMatch);
  }

  Future<GameRoomModel> createRoom({
    required String gameSlug,
    String? name,
    bool isPrivate = false,
    bool isRanked = false,
    int? maxPlayers,
    bool fillWithBots = true,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.gamesCreateRoom,
      data: {
        'gameSlug': gameSlug,
        if (name != null && name.isNotEmpty) 'name': name,
        'isPrivate': isPrivate,
        'isRanked': isRanked,
        if (maxPlayers != null) 'maxPlayers': maxPlayers,
        'fillWithBots': fillWithBots,
      },
    );
    return GameRoomModel.fromJson(Map<String, dynamic>.from(_payload(res)['room'] as Map? ?? const {}));
  }

  Future<GameRoomModel> joinRoom({String? roomId, String? accessCode}) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.gamesJoinRoom,
      data: {
        if (roomId != null) 'roomId': roomId,
        if (accessCode != null) 'accessCode': accessCode,
      },
    );
    return GameRoomModel.fromJson(Map<String, dynamic>.from(_payload(res)['room'] as Map? ?? const {}));
  }

  Future<GameRoomModel> getRoom(String roomId) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.gamesRoom(roomId));
    return GameRoomModel.fromJson(Map<String, dynamic>.from(_payload(res)['room'] as Map? ?? const {}));
  }

  Future<GameRoomModel> setReady({required String roomId, required bool isReady}) async {
    final res = await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.gamesRoomReady(roomId),
      data: {'isReady': isReady},
    );
    return GameRoomModel.fromJson(Map<String, dynamic>.from(_payload(res)['room'] as Map? ?? const {}));
  }

  Future<MatchFoundModel> startRoom(String roomId) async {
    final res = await _dio.post<Map<String, dynamic>>(ApiEndpoints.gamesRoomStart(roomId));
    final data = _payload(res);
    return MatchFoundModel.fromJson({
      'sessionId': data['sessionId'],
      'channel': data['channel'],
      'gameSlug': '',
      'isRanked': false,
      'waitSeconds': 0,
    });
  }

  /// Returns the live session snapshot, or null when the table has ended and
  /// been evicted.
  Future<GameSessionModel?> fetchSession(String sessionId) async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.gamesSession(sessionId));
    final data = _payload(res);
    if (data['active'] != true) return null;
    return GameSessionModel.fromJson(data);
  }
}
