import 'dart:async';

import '../../../../core/socket/socket_io_client.dart';
import '../models/game_models.dart';

/// Typed real-time streams for the game feature. The game and chat features
/// share a single [SocketIoClient]; this service subscribes to game events and
/// never touches chat events (and vice versa).
class GameSocketService {
  GameSocketService(this._socket);

  final SocketIoClient _socket;

  // Matchmaking
  final _matchmakingStatus = StreamController<MatchmakingStatusModel>.broadcast();
  final _matchFound = StreamController<MatchFoundModel>.broadcast();
  // Lobby
  final _roomUpdates = StreamController<GameRoomModel>.broadcast();
  final _roomLeft = StreamController<Map<String, String>>.broadcast();
  final _roomStarted = StreamController<Map<String, String>>.broadcast();
  // Live play
  final _gameUpdates = StreamController<GameSessionModel>.broadcast();
  final _gameReconnect = StreamController<GameSessionModel>.broadcast();
  final _gameError = StreamController<String>.broadcast();
  final _gameChat = StreamController<Map<String, dynamic>>.broadcast();

  Stream<MatchmakingStatusModel> get matchmakingStatus => _matchmakingStatus.stream;
  Stream<MatchFoundModel> get matchFound => _matchFound.stream;
  Stream<GameRoomModel> get roomUpdates => _roomUpdates.stream;
  Stream<Map<String, String>> get roomLeft => _roomLeft.stream;
  Stream<Map<String, String>> get roomStarted => _roomStarted.stream;
  Stream<GameSessionModel> get gameUpdates => _gameUpdates.stream;
  Stream<GameSessionModel> get gameReconnect => _gameReconnect.stream;
  Stream<String> get gameError => _gameError.stream;
  Stream<Map<String, dynamic>> get gameChat => _gameChat.stream;

  static Map<String, dynamic> _map(dynamic v) =>
      v is Map<String, dynamic> ? v : <String, dynamic>{};

  List<void Function()> _unsubs = [];

  /// Wires raw socket events to typed streams. Idempotent.
  void start() {
    if (_unsubs.isNotEmpty) return;
    _unsubs = [
      _socket.on('matchmaking:status', (d) {
        final map = _map(d);
        if (map['state'] == 'cancelled') {
          _matchmakingStatus.add(MatchmakingStatusModel(
            state: 'cancelled',
            playersFound: 0,
            fallbackInSeconds: 0,
          ));
        } else {
          _matchmakingStatus.add(MatchmakingStatusModel.fromJson(map));
        }
      }),
      _socket.on('matchmaking:found', (d) => _matchFound.add(MatchFoundModel.fromJson(_map(d)))),
      _socket.on('room:update', (d) => _roomUpdates.add(GameRoomModel.fromJson(_map(d)))),
      _socket.on('room:left', (d) {
        final map = _map(d);
        _roomLeft.add({'roomId': map['roomId']?.toString() ?? '', 'userId': map['userId']?.toString() ?? ''});
      }),
      _socket.on('room:started', (d) {
        final map = _map(d);
        _roomStarted.add({
          'roomId': map['roomId']?.toString() ?? '',
          'sessionId': map['sessionId']?.toString() ?? '',
          'channel': map['channel']?.toString() ?? '',
        });
      }),
      // game:start / game:update / game:finish all carry the redacted state.
      _socket.on('game:start', (d) => _gameUpdates.add(GameSessionModel.fromJson(_map(d)))),
      _socket.on('game:update', (d) => _gameUpdates.add(GameSessionModel.fromJson(_map(d)))),
      _socket.on('game:finish', (d) => _gameUpdates.add(GameSessionModel.fromJson(_map(d)))),
      _socket.on('game:presence', (d) => _gameUpdates.add(GameSessionModel.fromJson(_map(d)))),
      _socket.on('game:reconnect', (d) => _gameReconnect.add(GameSessionModel.fromJson(_map(d)))),
      _socket.on('game:chat:message', (d) => _gameChat.add(_map(d))),
    ];
  }

  void dispose() {
    for (final unsub in _unsubs) {
      unsub();
    }
    _unsubs = [];
    _matchmakingStatus.close();
    _matchFound.close();
    _roomUpdates.close();
    _roomLeft.close();
    _roomStarted.close();
    _gameUpdates.close();
    _gameReconnect.close();
    _gameError.close();
    _gameChat.close();
  }

  // ── Emits (return server acknowledgements) ───────────────────────────────

  Future<dynamic> _emit(String event, Map<String, dynamic> payload, {bool ack = true}) {
    return _socket.emit(event, payload, withAck: ack);
  }

  Future<dynamic> enqueue({required String gameSlug, required bool isRanked, int? seats}) {
    return _emit('matchmaking:enqueue', {
      'gameSlug': gameSlug,
      'isRanked': isRanked,
      if (seats != null) 'seats': seats,
    });
  }

  Future<dynamic> cancelMatchmaking() => _emit('matchmaking:cancel', const {}, ack: false);

  Future<dynamic> joinRoom({String? roomId, String? accessCode}) => _emit('room:join', {
        if (roomId != null) 'roomId': roomId,
        if (accessCode != null) 'accessCode': accessCode,
      });

  Future<dynamic> leaveRoom(String roomId) => _emit('room:leave', {'roomId': roomId}, ack: false);

  Future<dynamic> setReady({required String roomId, required bool isReady}) =>
      _emit('room:ready', {'roomId': roomId, 'isReady': isReady});

  Future<dynamic> startRoom(String roomId) => _emit('room:start', {'roomId': roomId});

  Future<dynamic> joinGame(String sessionId) => _emit('game:join', {'sessionId': sessionId});

  Future<dynamic> spectate({String? sessionId, String? roomId}) => _emit('game:spectate', {
        if (sessionId != null) 'sessionId': sessionId,
        if (roomId != null) 'roomId': roomId,
      });

  /// Sends an in-table chat message (relayed to everyone in the game channel).
  Future<Map<String, dynamic>> sendGameChat({required String sessionId, required String text}) async {
    final ack = await _emit('game:chat', {'sessionId': sessionId, 'text': text});
    return _map(ack);
  }

  /// Submits a move; the server acks with `{ok, error?}`.
  Future<Map<String, dynamic>> action({
    required String sessionId,
    required String type,
    Map<String, dynamic>? payload,
  }) async {
    final ack = await _emit('game:action', {
      'sessionId': sessionId,
      'type': type,
      'payload': payload ?? const {},
    });
    return _map(ack);
  }
}
