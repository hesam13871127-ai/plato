import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/dio_client.dart';
import '../../data/datasources/quests_remote_datasource.dart';
import '../../data/repositories/quests_repository_impl.dart';
import '../../domain/repositories/quests_repository.dart';

final questsRemoteDataSourceProvider = Provider<QuestsRemoteDataSource>((ref) {
  return QuestsRemoteDataSource(ref.watch(dioClientProvider).dio);
});

final questsRepositoryProvider = Provider<QuestsRepository>((ref) {
  return QuestsRepositoryImpl(
    remoteDataSource: ref.watch(questsRemoteDataSourceProvider),
  );
});

/// Today's daily-reward state + quest board.
final dailyPanelProvider = FutureProvider.autoDispose<DailyPanel>((ref) async {
  final result = await ref.watch(questsRepositoryProvider).getDailyPanel();
  return result.fold(
    (failure) => throw StateError(failure.message),
    (panel) => panel,
  );
});

/// Invalidates the panel so screens re-fetch after a claim or other mutation.
void refreshDailyPanel(WidgetRef ref) => ref.invalidate(dailyPanelProvider);
