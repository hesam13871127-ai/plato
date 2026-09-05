import 'dart:async';

import 'package:fpdart/fpdart.dart';

import '../../../../core/error/error_mapper.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/game_entities.dart';
import '../../domain/repositories/game_repository.dart';
import '../datasources/game_remote_datasource.dart';
import '../datasources/game_socket_service.dart';
import '../models/game_models.dart';

class GameRepositoryImpl implements GameRepository {
  GameRepositoryImpl({
    required GameRemoteDataSource remote,
    required GameSocketService socket,
  })  : _remote = remote,
        _socket = socket;

  final GameRemoteDataSource _remote;
  final GameSocketService _socket;

  // ── Catalogue ────────────────────────────────────────────────────────────

  @override
  Future<Either<Failure, List<GameCatalogEntry>>> getCatalog() async {
    try {
      final items = await _remote.getCatalog();
      return Right(List<GameCatalogEntry>.from(items));
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  // ── Matchmaking ──────────────────────────────────────────────────────────

  @override
  Future<Either<Failure, void>> enqueue({
    required String gameSlug,
    required bool isRanked,
    int? seats,
  }) async {
    try {
      await _socket.enqueue(gameSlug: gameSlug, isRanked: isRanked, seats: seats);
      return const Right(null);
    } on Object catch (error) {
      // Socket emit may fail pre-connect; fall back to REST enqueue.
      try {
        await _remote.enqueue(gameSlug: gameSlug, isRanked: isRanked, seats: seats);
        return const Right(null);
      } on Object catch (restError) {
        return Left(mapErrorToFailure(restError is StateError ? error : restError));
      }
    }
  }

  @override
  Future<Either<Failure, void>> cancelMatchmaking() async {
    try {
      await _socket.cancelMatchmaking();
      await _remote.cancelMatchmaking();
      return const Right(null);
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Stream<MatchmakingStatus> get matchmakingStatus =>
      _socket.matchmakingStatus.map((m) => m as MatchmakingStatus);

  @override
  Stream<MatchFound> get matchFound => _socket.matchFound.map((m) => m as MatchFound);

  // ── Rooms / lobbies ──────────────────────────────────────────────────────

  @override
  Future<Either<Failure, GameRoom>> createRoom({
    required String gameSlug,
    String? name,
    bool isPrivate = false,
    bool isRanked = false,
    int? maxPlayers,
    bool fillWithBots = true,
  }) async {
    try {
      final room = await _remote.createRoom(
        gameSlug: gameSlug,
        name: name,
        isPrivate: isPrivate,
        isRanked: isRanked,
        maxPlayers: maxPlayers,
        fillWithBots: fillWithBots,
      );
      return Right(room as GameRoom);
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Future<Either<Failure, GameRoom>> joinRoom({String? roomId, String? accessCode}) async {
    try {
      // Socket join keeps live lobby updates flowing; REST gives the snapshot.
      try {
        await _socket.joinRoom(roomId: roomId, accessCode: accessCode);
      } on Object {
        // Socket may be reconnecting; REST still authoritative.
      }
      final room = await _remote.joinRoom(roomId: roomId, accessCode: accessCode);
      return Right(room as GameRoom);
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Future<Either<Failure, GameRoom>> getRoom(String roomId) async {
    try {
      final room = await _remote.getRoom(roomId);
      return Right(room as GameRoom);
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Future<Either<Failure, List<GameRoom>>> openRooms({String? gameSlug}) async {
    try {
      final rooms = await _remote.openRooms(gameSlug: gameSlug);
      return Right(List<GameRoom>.from(rooms));
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Future<Either<Failure, GameRoom>> setReady({
    required String roomId,
    required bool isReady,
  }) async {
    try {
      try {
        await _socket.setReady(roomId: roomId, isReady: isReady);
      } on Object {
        // ignore socket failure; REST is authoritative.
      }
      final room = await _remote.setReady(roomId: roomId, isReady: isReady);
      return Right(room as GameRoom);
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Future<Either<Failure, MatchFound>> startRoom(String roomId) async {
    try {
      final result = await _remote.startRoom(roomId);
      return Right(result as MatchFound);
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Stream<GameRoom> get roomUpdates => _socket.roomUpdates.map((m) => m as GameRoom);

  @override
  Stream<({String roomId, String userId})> get roomLeft =>
      _socket.roomLeft.map((m) => (roomId: m['roomId'] ?? '', userId: m['userId'] ?? ''));

  @override
  Stream<({String roomId, String sessionId, String channel})> get roomStarted =>
      _socket.roomStarted.map((m) => (
            roomId: m['roomId'] ?? '',
            sessionId: m['sessionId'] ?? '',
            channel: m['channel'] ?? '',
          ));

  // ── Live play ────────────────────────────────────────────────────────────

  @override
  Future<Either<Failure, GameSessionView>> joinGame(String sessionId) async {
    try {
      final ack = await _socket.joinGame(sessionId);
      final snapshot = (ack is Map && ack['snapshot'] != null)
          ? GameSessionModel.fromJson(Map<String, dynamic>.from(ack['snapshot'] as Map))
          : await _remote.fetchSession(sessionId);
      if (snapshot == null) {
        return const Left(NotFoundFailure('That table could not be found or has ended.'));
      }
      return Right(snapshot as GameSessionView);
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Future<Either<Failure, void>> submitAction({
    required String sessionId,
    required String type,
    Map<String, dynamic>? payload,
  }) async {
    try {
      final ack = await _socket.action(
        sessionId: sessionId,
        type: type,
        payload: payload,
      );
      if (ack['ok'] == true) return const Right(null);
      return Left(ValidationFailure(ack['error']?.toString() ?? 'That move is not allowed.'));
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Future<Either<Failure, GameSessionView?>> fetchSession(String sessionId) async {
    try {
      final session = await _remote.fetchSession(sessionId);
      return Right(session as GameSessionView?);
    } on Object catch (error) {
      return Left(mapErrorToFailure(error));
    }
  }

  @override
  Stream<GameSessionView> get gameUpdates => _socket.gameUpdates.map((m) => m as GameSessionView);

  @override
  Stream<GameSessionView> get gameReconnect =>
      _socket.gameReconnect.map((m) => m as GameSessionView);
}
