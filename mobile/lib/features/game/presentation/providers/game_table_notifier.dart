import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../../auth/presentation/providers/auth_state.dart';
import '../../domain/entities/game_entities.dart';
import 'game_providers.dart';

/// Phase of the local table view.
enum TablePhase { joining, playing, finished, error }

class TableState {
  const TableState({
    this.phase = TablePhase.joining,
    this.session,
    this.error,
    this.mySeat = -1,
  });

  final TablePhase phase;
  final GameSessionView? session;
  final String? error;
  /// Seat number this device's player occupies (-1 when spectating).
  final int mySeat;

  bool get isMyTurn =>
      session != null &&
      mySeat >= 0 &&
      session!.isInProgress &&
      session!.currentSeat == mySeat;

  TableState copyWith({
    TablePhase? phase,
    GameSessionView? session,
    String? error,
    int? mySeat,
  }) {
    return TableState(
      phase: phase ?? this.phase,
      session: session ?? this.session,
      error: error,
      mySeat: mySeat ?? this.mySeat,
    );
  }
}

/// Holds a single live table: joins the game channel, applies incoming
/// redacted state frames, submits moves and recovers the snapshot after a
/// socket reconnect. All game truth comes from the server.
class GameTableNotifier extends StateNotifier<TableState> {
  GameTableNotifier(this._ref, this.sessionId) : super(const TableState()) {
    _init();
  }

  final Ref _ref;
  final String sessionId;
  final List<StreamSubscription<dynamic>> _subs = [];
  bool _joined = false;

  Future<void> _init() async {
    final repo = _ref.read(gameRepositoryProvider);
    final socketRepo = repo;

    // Live frames (per-seat redacted on the server).
    _subs.add(socketRepo.gameUpdates.listen(_onSession));
    _subs.add(socketRepo.gameReconnect.listen((s) {
      _onSession(s);
    }));

    // Join the channel and get the authoritative snapshot.
    final result = await repo.joinGame(sessionId);
    result.fold(
      (failure) => state = state.copyWith(phase: TablePhase.error, error: failure.message),
      (session) {
        _joined = true;
        _onSession(session);
      },
    );
  }

  void _onSession(GameSessionView session) {
    final mySeat = state.mySeat >= 0
        ? state.mySeat
        : _detectMySeat(session);
    state = state.copyWith(
      session: session,
      mySeat: mySeat,
      phase: session.isCompleted ? TablePhase.finished : TablePhase.playing,
    );
  }

  /// The server marks only seated players; spectator snapshots include no
  /// matching seat so this stays -1 for watchers.
  int _detectMySeat(GameSessionView session) {
    final me = _ref.read(currentUserIdProvider);
    if (me == null) return -1;
    final idx = session.seats.indexWhere((s) => s.playerId == me);
    return idx >= 0 ? session.seats[idx].seatNumber : -1;
  }

  /// Generic action submission used by every game board. Live games route
  /// per-seat actions (roll/vote/claim/guess/draw); turn-based games route the
  /// active seat's move. The server validates legality regardless.
  Future<void> sendAction(String type, [Map<String, dynamic> payload = const {}]) async {
    final session = state.session;
    if (session == null || !session.isInProgress) return;
    final result = await _ref.read(gameRepositoryProvider).submitAction(
          sessionId: sessionId,
          type: type,
          payload: payload,
        );
    result.fold(
      (failure) => state = state.copyWith(error: failure.message),
      (_) => state = state.copyWith(error: null),
    );
  }

  Future<void> playTile({required List<int> tile}) async {
    if (!state.isMyTurn) return;
    await sendAction('play_tile', {'tile': tile});
  }

  Future<void> draw() async {
    if (!state.isMyTurn) return;
    final result = await _ref.read(gameRepositoryProvider).submitAction(
          sessionId: sessionId,
          type: 'draw',
        );
    result.fold(
      (failure) => state = state.copyWith(error: failure.message),
      (_) => state = state.copyWith(error: null),
    );
  }

  Future<void> pass() async {
    if (!state.isMyTurn) return;
    final result = await _ref.read(gameRepositoryProvider).submitAction(
          sessionId: sessionId,
          type: 'pass',
        );
    result.fold(
      (failure) => state = state.copyWith(error: failure.message),
      (_) => state = state.copyWith(error: null),
    );
  }

  @override
  void dispose() {
    for (final sub in _subs) {
      unawaited(sub.cancel());
    }
    super.dispose();
  }
}

/// Family parameterised by session id so each table has its own notifier.
final gameTableProvider = StateNotifierProvider.autoDispose
    .family<GameTableNotifier, TableState, String>((ref, sessionId) {
  ref.watch(gameConnectionProvider);
  return GameTableNotifier(ref, sessionId);
});

/// The signed-in user's id, used to detect which seat this device occupies.
/// Spectators never match a seat, so their [TableState.mySeat] stays -1.
final currentUserIdProvider = Provider<String?>((ref) {
  final authState = ref.watch(authNotifierProvider);
  return authState.status == AuthStatus.authenticated ? authState.user.id : null;
});
