import '../../domain/entities/game_entities.dart';

Map<String, dynamic> _asMap(dynamic v) => v is Map<String, dynamic> ? v : <String, dynamic>{};
List<dynamic> _asList(dynamic v) => v is List ? v : const <dynamic>[];

class GameCatalogEntryModel extends GameCatalogEntry {
  const GameCatalogEntryModel({
    required super.slug,
    required super.name,
    required super.description,
    required super.minPlayers,
    required super.maxPlayers,
    required super.avgDurationMinutes,
    required super.supportsBots,
    required super.rankedEnabled,
    required super.isLive,
    required super.status,
    super.iconUrl,
  });

  factory GameCatalogEntryModel.fromJson(Map<String, dynamic> json) {
    return GameCatalogEntryModel(
      slug: json['slug'] as String? ?? '',
      name: json['name'] as String? ?? '',
      description: json['description'] as String? ?? '',
      minPlayers: (json['minPlayers'] as num?)?.toInt() ?? 2,
      maxPlayers: (json['maxPlayers'] as num?)?.toInt() ?? 4,
      avgDurationMinutes: (json['avgDurationMinutes'] as num?)?.toInt() ?? 10,
      supportsBots: json['supportsBots'] as bool? ?? false,
      rankedEnabled: json['rankedEnabled'] as bool? ?? false,
      isLive: json['isLive'] as bool? ?? false,
      status: json['status'] as String? ?? 'coming_soon',
      iconUrl: json['iconUrl'] as String?,
    );
  }
}

class GameSeatModel extends GameSeat {
  const GameSeatModel({
    required super.seatNumber,
    required super.playerId,
    required super.displayName,
    required super.connected,
    required super.score,
    super.avatarUrl,
  });

  factory GameSeatModel.fromJson(Map<String, dynamic> json) {
    return GameSeatModel(
      seatNumber: (json['seatNumber'] as num?)?.toInt() ?? 0,
      playerId: json['playerId'] as String? ?? '',
      displayName: json['displayName'] as String? ?? 'Player',
      avatarUrl: json['avatarUrl'] as String?,
      connected: json['connected'] as bool? ?? true,
      score: (json['score'] as num?)?.toInt() ?? 0,
    );
  }
}

class GameSessionModel extends GameSessionView {
  const GameSessionModel({
    required super.sessionId,
    required super.phase,
    required super.turn,
    required super.currentSeat,
    required super.version,
    required super.seats,
    required super.board,
    required super.winnerSeat,
    required super.scores,
    super.winnerSeats,
    super.gameSlug,
  });

  factory GameSessionModel.fromJson(Map<String, dynamic> json) {
    final nested = _asMap(json['state']);
    final source = nested.isNotEmpty ? nested : json; // snapshot wraps {sessionId, state}
    final rawSeats = _asList(source['seats']);
    final rawScores = _asList(source['scores']);
    final versionValue = json['version'] ?? source['version'];
    return GameSessionModel(
      sessionId: (json['sessionId'] ?? source['sessionId']) as String? ?? '',
      gameSlug: (json['gameSlug'] ?? source['gameSlug']) as String? ?? '',
      phase: source['phase'] as String? ?? 'in_progress',
      turn: (source['turn'] as num?)?.toInt() ?? 0,
      currentSeat: (source['currentSeat'] as num?)?.toInt() ?? 0,
      version: versionValue is num ? versionValue.toInt() : 0,
      seats: rawSeats.whereType<Map>().map((e) => GameSeatModel.fromJson(_asMap(e))).toList(),
      board: _asMap(source['board']),
      winnerSeat: (source['winnerSeat'] as num?)?.toInt(),
      winnerSeats: (source['winnerSeats'] as List?)?.whereType<num>().map((n) => n.toInt()).toList(),
      scores: rawScores.whereType<num>().map((n) => n.toInt()).toList(),
    );
  }
}

class MatchmakingStatusModel extends MatchmakingStatus {
  const MatchmakingStatusModel({
    required super.state,
    required super.playersFound,
    required super.fallbackInSeconds,
    super.gameSlug,
    super.isRanked,
  });

  factory MatchmakingStatusModel.fromJson(Map<String, dynamic> json) {
    return MatchmakingStatusModel(
      state: json['state'] as String? ?? 'queued',
      playersFound: (json['playersFound'] as num?)?.toInt() ?? 1,
      fallbackInSeconds: (json['fallbackInSeconds'] as num?)?.toInt() ?? 30,
      gameSlug: json['gameSlug'] as String?,
      isRanked: json['isRanked'] as bool?,
    );
  }
}

class MatchFoundModel extends MatchFound {
  const MatchFoundModel({
    required super.sessionId,
    required super.channel,
    required super.gameSlug,
    required super.isRanked,
    required super.waitSeconds,
  });

  factory MatchFoundModel.fromJson(Map<String, dynamic> json) {
    return MatchFoundModel(
      sessionId: json['sessionId'] as String? ?? '',
      channel: json['channel'] as String? ?? '',
      gameSlug: json['gameSlug'] as String? ?? '',
      isRanked: json['isRanked'] as bool? ?? false,
      waitSeconds: (json['waitSeconds'] as num?)?.toInt() ?? 0,
    );
  }
}

class RoomPlayerModel extends RoomPlayer {
  const RoomPlayerModel({
    required super.userId,
    required super.displayName,
    required super.username,
    required super.seatNumber,
    required super.isReady,
    required super.isHost,
    super.avatarUrl,
    super.level,
  });

  factory RoomPlayerModel.fromJson(Map<String, dynamic> json) {
    return RoomPlayerModel(
      userId: json['userId'] as String? ?? '',
      displayName: json['displayName'] as String? ?? 'Player',
      username: json['username'] as String? ?? '',
      avatarUrl: json['avatarUrl'] as String?,
      level: (json['level'] as num?)?.toInt() ?? 1,
      seatNumber: (json['seatNumber'] as num?)?.toInt() ?? 0,
      isReady: json['isReady'] as bool? ?? false,
      isHost: json['isHost'] as bool? ?? false,
    );
  }
}

class GameRoomModel extends GameRoom {
  const GameRoomModel({
    required super.id,
    required super.gameSlug,
    required super.gameName,
    required super.name,
    required super.isPrivate,
    required super.isRanked,
    required super.maxPlayers,
    required super.status,
    required super.hostId,
    required super.players,
    required super.isLive,
    super.accessCode,
    super.sessionId,
    super.inviteUrl,
  });

  factory GameRoomModel.fromJson(Map<String, dynamic> json) {
    return GameRoomModel(
      id: json['id'] as String? ?? '',
      gameSlug: json['gameSlug'] as String? ?? '',
      gameName: json['gameName'] as String? ?? '',
      name: json['name'] as String?,
      isPrivate: json['isPrivate'] as bool? ?? false,
      isRanked: json['isRanked'] as bool? ?? false,
      maxPlayers: (json['maxPlayers'] as num?)?.toInt() ?? 2,
      status: json['status'] as String? ?? 'waiting',
      hostId: json['hostId'] as String? ?? '',
      players: _asList(json['players'])
          .whereType<Map>()
          .map((e) => RoomPlayerModel.fromJson(_asMap(e)))
          .toList(),
      isLive: json['isLive'] as bool? ?? false,
      accessCode: json['accessCode'] as String?,
      sessionId: json['sessionId'] as String?,
      inviteUrl: json['inviteUrl'] as String?,
    );
  }
}
