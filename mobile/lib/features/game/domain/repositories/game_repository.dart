import 'package:fpdart/fpdart.dart';

import '../../../../core/error/failures.dart';
import '../entities/game_entities.dart';

/// Contract for games: REST catalogue/lobby actions plus the real-time
/// matchmaking + live-play streams driven over the shared Socket.IO client.
abstract class GameRepository {
  // ── Catalogue ──────────────────────────────────────────────────────────
  Future<Either<Failure, List<GameCatalogEntry>>> getCatalog();

  // ── Matchmaking (REST + socket) ────────────────────────────────────────
  Future<Either<Failure, void>> enqueue({
    required String gameSlug,
    required bool isRanked,
    int? seats,
  });
  Future<Either<Failure, void>> cancelMatchmaking();

  /// Emitted queue progress while searching.
  Stream<MatchmakingStatus> get matchmakingStatus;

  /// Emitted once a table is ready.
  Stream<MatchFound> get matchFound;

  // ── Rooms / lobbies ────────────────────────────────────────────────────
  Future<Either<Failure, GameRoom>> createRoom({
    required String gameSlug,
    String? name,
    bool isPrivate = false,
    bool isRanked = false,
    int? maxPlayers,
    bool fillWithBots = true,
  });
  Future<Either<Failure, GameRoom>> joinRoom({String? roomId, String? accessCode});
  Future<Either<Failure, GameRoom>> getRoom(String roomId);
  Future<Either<Failure, List<GameRoom>>> openRooms({String? gameSlug});
  Future<Either<Failure, GameRoom>> setReady({required String roomId, required bool isReady});
  Future<Either<Failure, MatchFound>> startRoom(String roomId);

  /// Live lobby updates (players joining / readying / starting).
  Stream<GameRoom> get roomUpdates;
  Stream<({String roomId, String userId})> get roomLeft;
  Stream<({String roomId, String sessionId, String channel})> get roomStarted;

  // ── Live play ──────────────────────────────────────────────────────────
  /// Joins a game channel. Seated players receive their private redacted view;
  /// others receive the spectator view. Returns the current snapshot.
  Future<Either<Failure, GameSessionView>> joinGame(String sessionId);

  /// Submits a move. Failures (illegal move, wrong turn) return a [Failure].
  Future<Either<Failure, void>> submitAction({
    required String sessionId,
    required String type,
    Map<String, dynamic>? payload,
  });

  /// Fetches the current redacted state (used after reconnect / refresh).
  Future<Either<Failure, GameSessionView?>> fetchSession(String sessionId);

  /// Emitted on every state change (per-seat redacted) and on finish/reconnect.
  Stream<GameSessionView> get gameUpdates;

  /// Emitted when the server hands a live table back after a socket reconnect.
  Stream<GameSessionView> get gameReconnect;
}
