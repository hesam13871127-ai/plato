import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/dio_client.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../../auth/presentation/providers/auth_state.dart';
import '../../../chat/data/datasources/chat_socket_service.dart';
import '../../data/datasources/game_remote_datasource.dart';
import '../../data/datasources/game_socket_service.dart';
import '../../data/repositories/game_repository_impl.dart';
import '../../domain/entities/game_entities.dart';
import '../../domain/repositories/game_repository.dart';

// ── Wiring ─────────────────────────────────────────────────────────────────

final gameRemoteDataSourceProvider = Provider<GameRemoteDataSource>((ref) {
  return GameRemoteDataSource(ref.watch(dioClientProvider).dio);
});

final gameSocketServiceProvider = Provider<GameSocketService>((ref) {
  final service = GameSocketService(ref.watch(socketIoClientProvider));
  service.start();
  ref.onDispose(service.dispose);
  return service;
});

final gameRepositoryProvider = Provider<GameRepository>((ref) {
  return GameRepositoryImpl(
    remote: ref.watch(gameRemoteDataSourceProvider),
    socket: ref.watch(gameSocketServiceProvider),
  );
});

/// Keeps the shared socket connected for the authenticated session so game
/// events flow even before the chat screen is opened.
final gameConnectionProvider = Provider<void>((ref) {
  final authState = ref.watch(authNotifierProvider);
  if (authState.status == AuthStatus.authenticated) {
    final socket = ref.watch(socketIoClientProvider);
    unawaited(socket.connect());
  }
});

// ── Catalogue ─────────────────────────────────────────────────────────────

final gameCatalogProvider = FutureProvider<List<GameCatalogEntry>>((ref) async {
  ref.watch(gameConnectionProvider);
  final repo = ref.watch(gameRepositoryProvider);
  final result = await repo.getCatalog();
  return result.fold(
    (failure) => throw StateError(failure.message),
    (games) => games,
  );
});

final openRoomsProvider =
    FutureProvider.autoDispose<List<GameRoom>>((ref) async {
  ref.watch(gameConnectionProvider);
  final repo = ref.watch(gameRepositoryProvider);
  final result = await repo.openRooms();
  return result.fold(
    (failure) => throw StateError(failure.message),
    (rooms) => rooms,
  );
});
