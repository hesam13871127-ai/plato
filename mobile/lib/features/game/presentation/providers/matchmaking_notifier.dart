import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/entities/game_entities.dart';
import 'game_providers.dart';

enum MatchmakingPhase { idle, queued, found, cancelled, error }

class MatchmakingState {
  const MatchmakingState({
    this.phase = MatchmakingPhase.idle,
    this.status,
    this.match,
    this.error,
    this.gameSlug,
    this.isRanked = false,
  });

  final MatchmakingPhase phase;
  final MatchmakingStatus? status;
  final MatchFound? match;
  final String? error;
  final String? gameSlug;
  final bool isRanked;

  MatchmakingState copyWith({
    MatchmakingPhase? phase,
    MatchmakingStatus? status,
    MatchFound? match,
    String? error,
    String? gameSlug,
    bool? isRanked,
  }) {
    return MatchmakingState(
      phase: phase ?? this.phase,
      status: status ?? this.status,
      match: match ?? this.match,
      error: error,
      gameSlug: gameSlug ?? this.gameSlug,
      isRanked: isRanked ?? this.isRanked,
    );
  }
}

/// Drives the smart-matchmaking flow: enqueue, live queue progress, the
/// invisible-bot fallback (server-side after ~30s) and the found match that
/// routes the player into the table.
class MatchmakingNotifier extends StateNotifier<MatchmakingState> {
  MatchmakingNotifier(this._ref) : super(const MatchmakingState()) {
    final socket = _ref.read(gameSocketServiceProvider);
    _subs.add(socket.matchmakingStatus.listen((status) {
      if (status.state == 'cancelled') {
        state = state.copyWith(phase: MatchmakingPhase.cancelled);
      } else {
        state = state.copyWith(phase: MatchmakingPhase.queued, status: status);
      }
    }));
    _subs.add(socket.matchFound.listen((match) {
      state = state.copyWith(phase: MatchmakingPhase.found, match: match);
    }));
  }

  final Ref _ref;
  final List<StreamSubscription<dynamic>> _subs = [];

  Future<void> enqueue({
    required String gameSlug,
    bool isRanked = false,
    int? seats,
  }) async {
    state = MatchmakingState(
      phase: MatchmakingPhase.queued,
      gameSlug: gameSlug,
      isRanked: isRanked,
      status: const MatchmakingStatus(state: 'queued', playersFound: 1, fallbackInSeconds: 30),
    );
    final repo = _ref.read(gameRepositoryProvider);
    final result = await repo.enqueue(gameSlug: gameSlug, isRanked: isRanked, seats: seats);
    result.fold(
      (failure) => state = state.copyWith(phase: MatchmakingPhase.error, error: failure.message),
      (_) => null,
    );
  }

  void cancel() {
    _ref.read(gameRepositoryProvider).cancelMatchmaking();
    state = const MatchmakingState(phase: MatchmakingPhase.cancelled);
  }

  void reset() {
    state = const MatchmakingState();
  }

  @override
  void dispose() {
    for (final sub in _subs) {
      unawaited(sub.cancel());
    }
    super.dispose();
  }
}

final matchmakingNotifierProvider =
    StateNotifierProvider.autoDispose<MatchmakingNotifier, MatchmakingState>((ref) {
  ref.watch(gameConnectionProvider);
  return MatchmakingNotifier(ref);
});
