import 'dart:async';

import '../../../../core/socket/socket_io_client.dart';
import '../../domain/entities/social_entities.dart';

/// Typed real-time streams for the social feature, multiplexed over the shared
/// [SocketIoClient]. Emits friend requests/responses, group changes and game
/// invites to the user's personal socket room.
class SocialSocketService {
  SocialSocketService(this._socket);

  final SocketIoClient _socket;

  final _friendRequest = StreamController<FriendRequest>.broadcast();
  final _friendAccepted = StreamController<SocialUser>.broadcast();
  final _friendRemoved = StreamController<String>.broadcast();
  final _groupChanged = StreamController<String>.broadcast();
  final _groupInvited = StreamController<Map<String, dynamic>>.broadcast();
  final _gameInvite = StreamController<GameInvite>.broadcast();

  Stream<FriendRequest> get friendRequest => _friendRequest.stream;
  Stream<SocialUser> get friendAccepted => _friendAccepted.stream;
  Stream<String> get friendRemoved => _friendRemoved.stream;
  Stream<String> get groupChanged => _groupChanged.stream;
  Stream<Map<String, dynamic>> get groupInvited => _groupInvited.stream;
  Stream<GameInvite> get gameInvite => _gameInvite.stream;

  static Map<String, dynamic> _map(dynamic v) =>
      v is Map<String, dynamic> ? v : <String, dynamic>{};

  List<void Function()> _unsubs = [];

  /// Wires raw socket events to typed streams. Idempotent.
  void start() {
    if (_unsubs.isNotEmpty) return;
    _unsubs = [
      _socket.on('friend:request', (d) {
        final map = _map(d);
        final from = map['from'];
        if (from is Map) {
          final user = SocialUser.fromJson(Map<String, dynamic>.from(from));
          _friendRequest.add(FriendRequest(
            id: map['requestId']?.toString() ?? '',
            user: user,
            createdAt: DateTime.now(),
          ));
        }
      }),
      _socket.on('friend:accepted', (d) {
        final map = _map(d);
        final friend = map['friend'];
        if (friend is Map) {
          _friendAccepted.add(SocialUser.fromJson(Map<String, dynamic>.from(friend)));
        }
      }),
      _socket.on('friend:removed', (d) {
        _friendRemoved.add(_map(d)['by']?.toString() ?? '');
      }),
      _socket.on('group:members-changed', (d) {
        final id = _map(d)['groupId']?.toString();
        if (id != null) _groupChanged.add(id);
      }),
      _socket.on('group:updated', (d) {
        final id = _map(d)['groupId']?.toString();
        if (id != null) _groupChanged.add(id);
      }),
      _socket.on('group:invited', (d) => _groupInvited.add(_map(d))),
      _socket.on('group:removed', (d) {
        final id = _map(d)['groupId']?.toString();
        if (id != null) _groupChanged.add(id);
      }),
      _socket.on('game:invite', (d) {
        _gameInvite.add(GameInvite.fromJson(_map(d)));
      }),
    ];
  }

  void dispose() {
    for (final unsub in _unsubs) {
      unsub();
    }
    _unsubs = [];
    for (final c in [
      _friendRequest,
      _friendAccepted,
      _friendRemoved,
      _groupChanged,
      _groupInvited,
      _gameInvite,
    ]) {
      c.close();
    }
  }
}
