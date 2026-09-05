import 'package:equatable/equatable.dart';

/// A playable game in the catalogue (e.g. Dominoes).
class GameCatalogEntry extends Equatable {
  const GameCatalogEntry({
    required this.slug,
    required this.name,
    required this.description,
    required this.minPlayers,
    required this.maxPlayers,
    required this.avgDurationMinutes,
    required this.supportsBots,
    required this.rankedEnabled,
    required this.isLive,
    required this.status,
    this.iconUrl,
  });

  final String slug;
  final String name;
  final String description;
  final int minPlayers;
  final int maxPlayers;
  final int avgDurationMinutes;
  final bool supportsBots;
  final bool rankedEnabled;

  /// Live/real-time games run a wall-clock tick; turn-based games don't.
  final bool isLive;
  final String status;
  final String? iconUrl;

  bool get isPlayable => status == 'active';

  @override
  List<Object?> get props => [slug, name, status, isLive];
}

/// A seated player at a table. Mirrors the server's public seat descriptor —
/// there is intentionally no bot flag: bots are indistinguishable on the wire.
class GameSeat extends Equatable {
  const GameSeat({
    required this.seatNumber,
    required this.playerId,
    required this.displayName,
    required this.connected,
    required this.score,
    this.avatarUrl,
  });

  final int seatNumber;
  final String playerId;
  final String displayName;
  final String? avatarUrl;
  final bool connected;
  final int score;

  @override
  List<Object?> get props => [seatNumber, playerId, displayName, connected, score];
}

/// Domino-specific board data (redacted server-side: a player only sees their
/// own hand plus opponents' hand sizes; spectators see no hands).
class DominoBoardView extends Equatable {
  const DominoBoardView({
    required this.chain,
    required this.ends,
    required this.boneyard,
    required this.handSizes,
    required this.myHand,
  });

  /// Played tiles in order, each `{ tile: [a,b], openEnds: [l,r] }`.
  final List<Map<String, dynamic>> chain;
  final List<int>? ends;
  final int boneyard;
  final List<int> handSizes;

  /// Tiles in the viewing player's hand as `[a,b]` pairs (empty for spectators).
  final List<List<int>> myHand;

  @override
  List<Object?> get props => [chain, ends, boneyard, handSizes, myHand];
}

/// The full synchronised state of a live game session.
class GameSessionView extends Equatable {
  const GameSessionView({
    required this.sessionId,
    required this.phase,
    required this.turn,
    required this.currentSeat,
    required this.version,
    required this.seats,
    required this.board,
    required this.winnerSeat,
    required this.scores,
    this.gameSlug = '',
  });

  final String sessionId;
  final String gameSlug; // engine slug ('connect4', 'chess', …) driving the board UI
  final String phase; // 'in_progress' | 'completed' | 'abandoned' | 'setup'
  final int turn;
  final int currentSeat;
  final int version;
  final List<GameSeat> seats;
  final Map<String, dynamic> board;
  final int? winnerSeat;
  final List<int> scores;

  bool get isCompleted => phase == 'completed';
  bool get isInProgress => phase == 'in_progress';

  /// Parsed domino board when the game slug is dominoes.
  DominoBoardView? get dominoBoard {
    if (board.isEmpty) return null;
    final rawHand = (board['hand'] as List?) ?? const [];
    final rawSizes = (board['handSizes'] as List?) ?? const [];
    final rawChain = (board['chain'] as List?) ?? const [];
    final rawEnds = board['ends'] as List?;
    return DominoBoardView(
      chain: rawChain.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList(),
      ends: rawEnds?.whereType<num>().map((n) => n.toInt()).toList(),
      boneyard: (board['boneyard'] as num?)?.toInt() ?? 0,
      handSizes: rawSizes.whereType<num>().map((n) => n.toInt()).toList(),
      myHand: rawHand
          .whereType<List>()
          .map((t) => t.whereType<num>().map((n) => n.toInt()).toList())
          .where((t) => t.length == 2)
          .toList(),
    );
  }

  @override
  List<Object?> get props => [sessionId, phase, turn, currentSeat, version, winnerSeat];
}

/// Matchmaking queue progress reported over the socket.
class MatchmakingStatus extends Equatable {
  const MatchmakingStatus({
    required this.state,
    required this.playersFound,
    required this.fallbackInSeconds,
    this.gameSlug,
    this.isRanked,
  });

  final String state; // 'queued' | 'searching' | 'cancelled'
  final int playersFound;
  final int fallbackInSeconds;
  final String? gameSlug;
  final bool? isRanked;

  @override
  List<Object?> get props => [state, playersFound, fallbackInSeconds];
}

/// Fired when a match has been formed (human vs human, or humans + bots).
class MatchFound extends Equatable {
  const MatchFound({
    required this.sessionId,
    required this.channel,
    required this.gameSlug,
    required this.isRanked,
    required this.waitSeconds,
  });

  final String sessionId;
  final String channel;
  final String gameSlug;
  final bool isRanked;
  final int waitSeconds;

  @override
  List<Object?> get props => [sessionId, channel, gameSlug];
}

/// A lobby/room seat (lobby list — distinct from in-game seats).
class RoomPlayer extends Equatable {
  const RoomPlayer({
    required this.userId,
    required this.displayName,
    required this.username,
    required this.seatNumber,
    required this.isReady,
    required this.isHost,
    this.avatarUrl,
    this.level = 1,
  });

  final String userId;
  final String displayName;
  final String username;
  final String? avatarUrl;
  final int level;
  final int seatNumber;
  final bool isReady;
  final bool isHost;

  @override
  List<Object?> get props => [userId, seatNumber, isReady, isHost];
}

/// A private or public table lobby.
class GameRoom extends Equatable {
  const GameRoom({
    required this.id,
    required this.gameSlug,
    required this.gameName,
    required this.name,
    required this.isPrivate,
    required this.isRanked,
    required this.maxPlayers,
    required this.status,
    required this.hostId,
    required this.players,
    required this.isLive,
    this.accessCode,
    this.sessionId,
    this.inviteUrl,
  });

  final String id;
  final String gameSlug;
  final String gameName;
  final String? name;
  final bool isPrivate;
  final bool isRanked;
  final int maxPlayers;
  final String status;
  final String hostId;
  final List<RoomPlayer> players;
  final bool isLive;
  final String? accessCode;
  final String? sessionId;
  final String? inviteUrl;

  int get humanCount => players.length;

  @override
  List<Object?> get props => [id, status, players.length, isLive];
}
