import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../constants/app_constants.dart';
import '../network/api_endpoints.dart';
import '../storage/secure_token_storage.dart';

/// A small, dependency-free Socket.IO (Engine.IO v4 / Socket.IO v4) client
/// implemented directly over a WebSocket.
///
/// The chat gateway authenticates the socket handshake with the same JWT used
/// by the REST API (`auth.token`). Only the WebSocket transport is used;
/// payloads are standard Socket.IO frames so this interoperates with the
/// NestJS Socket.IO server.
///
/// Frame reference (Engine.IO v4):
///  - `0` open, `2` ping (server→client), `3` pong (client→server),
///    `4` message. Socket.IO wraps message packets as `4<type><json>`:
///    type `0` = CONNECT, `2` = EVENT, `3` = ACK (server→client response to a
///    client emit with acknowledgement).
class SocketIoClient {
  SocketIoClient({SecureTokenStorage? storage, required String baseUrl})
      : _storage = storage,
        _baseUrl = baseUrl;

  final SecureTokenStorage? _storage;

  /// Backend origin for the WebSocket upgrade (scheme + host + port).
  final String _baseUrl;

  WebSocketChannel? _channel;
  bool _socketReady = false;
  StreamSubscription<dynamic>? _socketSub;
  Timer? _reconnectTimer;
  bool _disposed = false;
  bool _intentionalClose = false;
  bool _connecting = false;
  int _reconnectAttempts = 0;

  // --- token-expired handling ---
  bool _handlingExpired = false;
  String? _lastDisconnectCode;
  Future<bool>? _refreshInFlight;
  int _consecutiveExpired = 0;

  final Map<String, Set<void Function(dynamic data)>> _eventHandlers = {};
  final Map<int, Completer<dynamic>> _pendingAcks = {};
  int _ackId = 0;
  String? _connectFrame;

  /// Fired with `true` on (re)connect, `false` on disconnect.
  void Function(bool connected)? onConnectionChange;

  /// Connects to the root Socket.IO namespace.
  Future<void> connect() async {
    if (_channel != null || _connecting) return;
    _connecting = true;
    _intentionalClose = false;

    final token = await _storage?.accessToken;
    final auth = token != null && token.isNotEmpty
        ? {'token': token}
        : <String, dynamic>{};
    // For the root namespace, the Socket.IO CONNECT packet's payload IS the
    // auth object (verified against the live gateway: `40{"token":"…"}` →
    // server emits `authenticated`). A custom namespace would prefix the path.
    _connectFrame = '40${jsonEncode(auth)}';

    final uri = Uri.parse(_baseUrl);
    final scheme = uri.scheme == 'https' ? 'wss' : 'ws';
    // EIO=4 → Engine.IO protocol v4; transport=websocket upgrades straight in.
    final wsUrl = Uri(
      scheme: scheme,
      host: uri.host,
      port: uri.hasPort ? uri.port : null,
      path: '/socket.io/',
      queryParameters: {
        'EIO': '4',
        'transport': 'websocket',
      },
    ).toString();

    try {
      final channel = WebSocketChannel.connect(Uri.parse(wsUrl));
      _channel = channel;

      // Wait for the transport to be ready; a failure here triggers reconnect.
      await channel.ready;
      _socketReady = true;
      _connecting = false;
      // Don't reset _reconnectAttempts fully on jwt-expired loops — it provides
      // backoff, but on a successful `authenticated` we reset.
      // Keep existing attempts for now.

      _socketSub = channel.stream.listen(
        _onRawData,
        onDone: _onDone,
        onError: (Object error) => _onDone(),
        cancelOnError: true,
      );

      // The Socket.IO CONNECT frame is sent once the Engine.IO OPEN arrives
      // (see _onRawData, packet type '0').
    } on Object {
      _connecting = false;
      _socketReady = false;
      _channel = null;
      _scheduleReconnect();
    }
  }

  void disconnect() {
    _intentionalClose = true;
    _teardown();
  }

  void dispose() {
    _disposed = true;
    disconnect();
    _eventHandlers.clear(); // cleared on dispose
    for (final completer in _pendingAcks.values) {
      if (!completer.isCompleted) completer.completeError(StateError('disposed'));
    }
    _pendingAcks.clear();
  }

  bool get isConnected => _channel != null && _socketReady;

  /// Registers a handler for a server-emitted event (e.g. `chat:message`).
  /// True once the server has accepted the handshake JWT (`authenticated`).
  bool isAuthenticated = false;

  /// Registers a handler for a server-emitted event. Multiple subscribers may
  /// listen to the same event (e.g. chat and game features share one socket);
  /// the returned callback removes this subscription.
  void Function() on(String event, void Function(dynamic data) handler) {
    final set = _eventHandlers.putIfAbsent(event, () => <void Function(dynamic data)>{});
    set.add(handler);
    return () => set.remove(handler);
  }

  /// Removes a specific handler, or every handler for [event] when [handler]
  /// is omitted.
  void off(String event, [void Function(dynamic data)? handler]) {
    if (handler == null) {
      _eventHandlers.remove(event);
    } else {
      _eventHandlers[event]?.remove(handler);
    }
  }

  /// Emits an event to the server. When [withAck] is true the returned future
  /// completes with the server's acknowledgement payload.
  Future<dynamic> emit(String event, Map<String, dynamic> payload,
      {bool withAck = false}) {
    final channel = _channel;
    if (channel == null || !_socketReady) {
      return Future<dynamic>.error(StateError('Socket not connected.'));
    }
    if (!withAck) {
      _sendRaw('42${jsonEncode([event, payload])}');
      return Future<dynamic>.value();
    }
    final id = ++_ackId;
    final completer = Completer<dynamic>();
    _pendingAcks[id] = completer;
    _sendRaw('42$id${jsonEncode([event, payload])}');
    return completer.future.timeout(
      const Duration(seconds: 10),
      onTimeout: () {
        _pendingAcks.remove(id);
        throw TimeoutException('Acknowledgement for "$event" timed out.');
      },
    );
  }

  // ── internals ────────────────────────────────────────────────────────────

  void _onRawData(dynamic raw) {
    // Socket.IO text frames arrive as String; defensively decode the rare
    // binary (List<int>/ByteBuffer) frame so nothing is dropped on any client.
    if (raw is! String) {
      if (raw is List<int>) {
        raw = utf8.decode(raw);
      } else {
        return;
      }
    }
    final packet = raw as String;
    if (packet.isEmpty) return;
    final packetType = packet.substring(0, 1);
    switch (packetType) {
      case '0': // Engine.IO OPEN → send the Socket.IO CONNECT (with auth)
        // Engine.IO v4 pings then originate from the server; we answer each
        // with a PONG below, so no client-side heartbeat timer is required.
        _sendRaw(_connectFrame ?? '');
        break;
      case '2': // server PING → respond PONG immediately
        _sendRaw('3');
        break;
      case '4': // Socket.IO packet
        _onSocketPacket(packet.substring(1));
        break;
      default:
        break;
    }
  }

  void _onSocketPacket(String packet) {
    final type = packet.substring(0, 1);
    final body = packet.substring(1);
    switch (type) {
      case '0': // CONNECT (namespace established)
        onConnectionChange?.call(true);
        break;
      case '1': // DISCONNECT
        isAuthenticated = false;
        onConnectionChange?.call(false);
        break;
      case '2': // EVENT: [event, ...args]
        _dispatchEvent(body);
        break;
      case '3': // ACK: <ackId>[args]
        _dispatchAck(body);
        break;
      default:
        break;
    }
  }

  void _dispatchEvent(String body) {
    try {
      final decoded = jsonDecode(body) as List<dynamic>;
      if (decoded.isEmpty) return;
      final event = decoded[0] as String?;
      if (event == null) return;
      final data = decoded.length > 1 ? decoded[1] : null;
      if (event == 'authenticated') {
        isAuthenticated = true;
        _reconnectAttempts = 0;
        _consecutiveExpired = 0;
        _lastDisconnectCode = null;
      }
      if (event == 'unauthorized') {
        isAuthenticated = false;
        final isExpired = _isExpiredUnauthorized(data);
        if (isExpired) {
          _lastDisconnectCode = 'token_expired';
          _consecutiveExpired++;
          // Kick off a refresh without blocking the event dispatch.
          // The next reconnect will use the fresh token.
          if (!_handlingExpired) {
            _handlingExpired = true;
            // ignore: discarded_futures
            _tryRefresh().whenComplete(() => _handlingExpired = false);
          }
        } else {
          _lastDisconnectCode = 'unauthorized';
        }
      }
      for (final handler in List<void Function(dynamic)>.of(_eventHandlers[event] ?? const [])) {
        handler(data);
      }
    } on Object {
      // Ignore malformed frames defensively.
    }
  }

  bool _isExpiredUnauthorized(dynamic data) {
    if (data is Map<String, dynamic>) {
      final code = data['code'] as String?;
      if (code == 'token_expired') return true;
      if (data['expired'] == true) return true;
      final msg = (data['message'] as String?)?.toLowerCase() ?? '';
      if (msg.contains('expired')) return true;
    } else if (data is Map) {
      final code = data['code'] as String?;
      if (code == 'token_expired') return true;
      if (data['expired'] == true) return true;
    }
    return false;
  }

  Future<bool> _tryRefresh() async {
    if (_refreshInFlight != null) return _refreshInFlight!;
    final f = _doRefresh();
    _refreshInFlight = f;
    try {
      return await f;
    } finally {
      _refreshInFlight = null;
    }
  }

  Future<bool> _doRefresh() async {
    final refreshToken = await _storage?.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) return false;
    try {
      final dio = Dio(BaseOptions(
        baseUrl: '$_baseUrl${AppConstants.apiPrefix}',
        connectTimeout: const Duration(seconds: 8),
        receiveTimeout: const Duration(seconds: 8),
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
      ));
      final res = await dio.post<Map<String, dynamic>>(
        ApiEndpoints.refresh,
        data: {'refreshToken': refreshToken},
        options: Options(headers: {'Authorization': ''}),
      );
      final wrapper = res.data;
      // Server replies { data: { accessToken, refreshToken, ... } }  OR  { accessToken, ... }
      final Map<String, dynamic>? data = (wrapper?['data'] as Map<String, dynamic>?) ?? wrapper;
      final at = data?['accessToken'] as String?;
      final rt = data?['refreshToken'] as String?;
      if (at != null && at.isNotEmpty && rt != null && rt.isNotEmpty) {
        await _storage?.saveTokens(accessToken: at, refreshToken: rt);
        _consecutiveExpired = 0;
        return true;
      }
      return false;
    } catch (_) {
      // Single-use refresh token may already be consumed — on failure we
      // surface unauthorized again; the app's HTTP layer will eventually
      // clear storage and redirect to login.
      // Don't clear here immediately — let the HTTP refresh flow decide.
      // After 3 consecutive expired loops we back off harder.
      return false;
    }
  }

  void _dispatchAck(String body) {
    final match = RegExp(r'^(\d+)').firstMatch(body);
    if (match == null) return;
    final id = int.tryParse(match.group(1)!);
    if (id == null) return;
    final completer = _pendingAcks.remove(id);
    if (completer == null || completer.isCompleted) return;
    try {
      final argsJson = body.substring(match.end);
      final args = jsonDecode(argsJson) as List<dynamic>;
      completer.complete(args.isNotEmpty ? args.first : null);
    } on Object catch (error) {
      completer.completeError(error);
    }
  }

  void _sendRaw(String frame) {
    final channel = _channel;
    if (channel != null && _socketReady) {
      channel.sink.add(frame);
    }
  }

  void _onDone() {
    _teardown(keepReconnect: !_intentionalClose);
    if (!_intentionalClose) _scheduleReconnect();
  }

  void _teardown({bool keepReconnect = false}) {
    isAuthenticated = false;
    _connecting = false;
    _socketReady = false;
    final channel = _channel;
    _channel = null;
    final sub = _socketSub;
    _socketSub = null;
    if (channel != null) {
      try {
        sub?.cancel();
        channel.sink.close();
      } on Object {
        // already closed
      }
    }
    onConnectionChange?.call(false);
    if (!keepReconnect) {
      for (final completer in _pendingAcks.values) {
        if (!completer.isCompleted) {
          completer.completeError(StateError('Socket disconnected.'));
        }
      }
      _pendingAcks.clear();
    }
  }

  void _scheduleReconnect() {
    if (_disposed || _intentionalClose) return;
    // If the last disconnect was due to an expired JWT we must refresh
    // before the next handshake — otherwise we'd hammer the server with the
    // same stale token every ~500ms (observed `jwt expired` flood). Refresh
    // is single-flight so concurrent sockets share the rotation.
    if (_lastDisconnectCode == 'token_expired') {
      _reconnectTimer?.cancel();
      // Cap the hot-loop: after 3 consecutive expiries back off to 8s.
      final expiredDelayMs = _consecutiveExpired >= 3 ? 8000 : 1200;
      _reconnectTimer = Timer(Duration(milliseconds: expiredDelayMs), () async {
        if (_disposed || _intentionalClose) return;
        final ok = await _tryRefresh();
        if (_disposed || _intentionalClose) return;
        if (!ok) {
          // Refresh failed — still attempt a reconnect (maybe token was already
          // refreshed by the HTTP layer), but keep backing off to avoid spam.
          // After many failures the HTTP 401 path will clear tokens and the
          // app will redirect to login, which disposes this client.
        }
        _lastDisconnectCode = null;
        await connect();
      });
      return;
    }
    _reconnectTimer?.cancel();
    _reconnectAttempts++;
    final delay = Duration(
      milliseconds: (500 * _reconnectAttempts).clamp(500, 8000),
    );
    _reconnectTimer = Timer(delay, () async {
      if (_disposed || _intentionalClose) return;
      await connect();
    });
  }
}
