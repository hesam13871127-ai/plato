import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/services/feedback_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/game_logo.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../../core/widgets/gradient_button.dart';
import '../../domain/entities/game_entities.dart';
import '../providers/game_providers.dart';
import '../widgets/tutorial_sheet.dart';

/// Landing screen for the game subsystem: catalogue, quick play (smart
/// matchmaking with invisible bot fallback), private tables and open lobbies.
class GameHubScreen extends ConsumerWidget {
  const GameHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalogAsync = ref.watch(gameCatalogProvider);
    final roomsAsync = ref.watch(openRoomsProvider);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.softCyan,
          backgroundColor: AppColors.surfaceDark,
          onRefresh: () async {
            ref.invalidate(gameCatalogProvider);
            ref.invalidate(openRoomsProvider);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              const _HubHeader(),
              const SizedBox(height: 24),
              Text('Choose a game',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.bold,
                      )),
              const SizedBox(height: 14),
              catalogAsync.when(
                loading: () => const _CatalogLoader(),
                error: (e, _) => _ErrorTile(message: e.toString()),
                data: (games) => Column(
                  children: games
                      .map((g) => Padding(
                            padding: const EdgeInsets.only(bottom: 14),
                            child: _GameCard(game: g),
                          ))
                      .toList(),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Text('Open tables',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.bold,
                          )),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () => context.push('/rooms'),
                    icon: const Icon(Icons.public, size: 18, color: AppColors.softCyan),
                    label: const Text('Browse all',
                        style: TextStyle(color: AppColors.softCyan)),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              roomsAsync.when(
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
                data: (rooms) {
                  final open = rooms.take(4).toList();
                  if (open.isEmpty) {
                    return GlassCard(
                      child: Row(
                        children: const [
                          Icon(Icons.bedtime, color: AppColors.textMuted),
                          SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'No open tables right now. Start one — invisible '
                              'opponents join in seconds if it is quiet.',
                              style: TextStyle(color: AppColors.textSecondary),
                            ),
                          ),
                        ],
                      ),
                    );
                  }
                  return Column(
                    children: open
                        .map((r) => Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: _RoomTile(room: r),
                            ))
                        .toList(),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HubHeader extends StatelessWidget {
  const _HubHeader();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.electricPurple, AppColors.softCyan],
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(Icons.casino, color: Colors.white, size: 26),
            ),
            const SizedBox(width: 14),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('VibeTable',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          color: AppColors.textPrimary,
                          fontWeight: FontWeight.bold,
                        )),
                const Text('Play. Match. Win.',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
              ],
            ),
          ],
        ),
      ],
    );
  }
}

class _GameCard extends ConsumerWidget {
  const _GameCard({required this.game});
  final GameCatalogEntry game;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final playable = game.isPlayable;
    return GlassCard(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: playable
            ? [AppColors.electricPurple.withOpacity(0.22), AppColors.softCyan.withOpacity(0.08)]
            : [AppColors.surfaceElevated.withOpacity(0.6), AppColors.surfaceDark.withOpacity(0.6)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              GameLogo(slug: game.slug, size: 64, radius: 18, emoji: _gameEmoji(game.slug)),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(game.name,
                        style: const TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        )),
                    const SizedBox(height: 2),
                    Text(
                      '${game.minPlayers}–${game.maxPlayers} ${context.l10n.t('players')} · ~${game.avgDurationMinutes} ${context.l10n.t('minutes')}'
                      '${game.isLive ? ' · Live' : ' · Turn-based'}',
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                    ),
                  ],
                ),
              ),
              if (!playable)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppColors.glassFill,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(context.l10n.t('status_coming_soon').toUpperCase(),
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 11, letterSpacing: 1)),
                ),
              IconButton(
                tooltip: context.l10n.t('how_to_play'),
                onPressed: () {
                  ref.read(feedbackServiceProvider.notifier).tap();
                  TutorialSheet.show(context, slug: game.slug, name: game.name);
                },
                icon: const Icon(Icons.help_outline_rounded, color: AppColors.softCyan),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(game.description,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.4)),
          const SizedBox(height: 16),
          if (playable)
            Row(
              children: [
                Expanded(
                  child: GradientButton(
                    label: context.l10n.t('play_now'),
                    icon: Icons.play_arrow_rounded,
                    onPressed: () {
                      ref.read(feedbackServiceProvider.notifier).action();
                      context.push('/matchmaking/${game.slug}');
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => context.push('/rooms/create/${game.slug}'),
                    icon: const Icon(Icons.group_add, size: 18),
                    label: Text(context.l10n.t('create_room')),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.softCyan,
                      side: const BorderSide(color: AppColors.glassStroke),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

/// Fallback emoji per slug for games whose 3D logo asset is not bundled.
/// Games ship a bundled 3D logo as they are rebuilt, so this map only needs
/// entries for slugs without artwork.
String _gameEmoji(String slug) {
  switch (slug) {
    case 'dominoes':
      return '🁢';
    case 'ludo':
      return '🔴';
    case 'ocho':
      return '🃏';
    case 'connect4':
      return '🔴';
    case 'checkers':
      return '⚪';
    case 'chess':
      return '♞';
    case 'pool':
      return '🎱';
    case 'carrom':
      return '🎯';
    case 'dots_and_boxes':
      return '🔹';
    case 'snakes_ladders':
      return '🐍';
    case 'bingo':
      return '🎱';
    case 'dice_party':
      return '🎲';
    case 'backgammon':
      return '♟️';
    case 'mancala':
      return '🫘';
    case 'bowling':
      return '🎳';
    case 'trivia':
      return '🧠';
    case 'word_chain':
      return '🔗';
    case 'emoji_charades':
      return '🎭';
    case 'memory':
      return '🃏';
    case 'sketch':
      return '✏️';
    case 'werewolf':
      return '🐺';
    default:
      return '🎮';
  }
}

/// Shown while the catalogue is between rebuild waves — never an error.
class _EmptyCatalog extends StatelessWidget {
  const _EmptyCatalog();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 34),
      decoration: BoxDecoration(
        color: AppColors.glassFill,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.glassStroke),
      ),
      child: Column(
        children: [
          const Text('🛠️', style: TextStyle(fontSize: 40)),
          const SizedBox(height: 12),
          Text(
            'The arcade is being rebuilt',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Games return wave by wave — each one fully playable, with 3D boards and fresh cosmetics.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _RoomTile extends StatelessWidget {
  const _RoomTile({required this.room});
  final GameRoom room;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(14),
      borderRadius: 18,
      onTap: () => context.push('/rooms/${room.id}'),
      child: Row(
        children: [
          const Icon(Icons.meeting_room, color: AppColors.electricPurple),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(room.name ?? room.gameName,
                    style: const TextStyle(
                        color: AppColors.textPrimary, fontWeight: FontWeight.w600)),
                Text('${room.humanCount}/${room.maxPlayers} seated · ${room.gameName}',
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AppColors.textMuted),
        ],
      ),
    );
  }
}

class _CatalogLoader extends StatelessWidget {
  const _CatalogLoader();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 40),
      child: Center(child: CircularProgressIndicator(color: AppColors.softCyan)),
    );
  }
}

class _ErrorTile extends StatelessWidget {
  const _ErrorTile({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Row(
        children: [
          const Icon(Icons.cloud_off, color: AppColors.danger),
          const SizedBox(width: 12),
          Expanded(
            child: Text('Could not load games.\n$message',
                style: const TextStyle(color: AppColors.textSecondary)),
          ),
        ],
      ),
    );
  }
}
