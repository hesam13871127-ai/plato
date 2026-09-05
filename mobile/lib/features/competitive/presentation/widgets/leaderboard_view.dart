import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../game/presentation/providers/game_providers.dart' show gameCatalogProvider;
import '../../domain/entities/season_ranking.dart';
import '../providers/competitive_providers.dart';
import 'rank_badge.dart';

/// Global / friends leaderboard with an optional per-game filter.
class LeaderboardView extends ConsumerStatefulWidget {
  const LeaderboardView({super.key, required this.gameSlug, required this.onGameChanged});

  final String? gameSlug;
  final ValueChanged<String?> onGameChanged;

  @override
  ConsumerState<LeaderboardView> createState() => _LeaderboardViewState();
}

class _LeaderboardViewState extends ConsumerState<LeaderboardView> {
  bool _friends = false;

  @override
  Widget build(BuildContext context) {
    final query = LeaderboardQuery(gameSlug: widget.gameSlug, friends: _friends);
    final boardAsync = ref.watch(leaderboardProvider(query));

    return Column(
      children: [
        _Controls(
          friends: _friends,
          gameSlug: widget.gameSlug,
          onToggleFriends: () => setState(() => _friends = !_friends),
          onGameChanged: widget.onGameChanged,
        ),
        Expanded(
          child: boardAsync.when(
            data: (board) => RefreshIndicator(
              color: AppColors.softCyan,
              backgroundColor: AppColors.surfaceElevated,
              onRefresh: () async => ref.invalidate(leaderboardProvider(query)),
              child: board.entries.isEmpty
                  ? _empty()
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      children: [
                        if (board.self != null && board.self!.rank > 3) ...[
                          _SelfPinnedCard(entry: board.self!),
                          const SizedBox(height: 10),
                        ],
                        ...board.entries.map((e) => _EntryRow(entry: e)),
                      ],
                    ),
            ),
            loading: () => const Center(child: CircularProgressIndicator(color: AppColors.softCyan)),
            error: (e, _) => _errorState(query),
          ),
        ),
      ],
    );
  }

  Widget _empty() => ListView(
        children: [
          const SizedBox(height: 90),
          Icon(_friends ? Icons.people_outline_rounded : Icons.leaderboard_rounded,
              size: 56, color: AppColors.textMuted),
          const SizedBox(height: 12),
          Center(
            child: Text(
              _friends ? 'No friends ranked here yet.' : 'No ranked matches this season yet.',
              style: const TextStyle(color: AppColors.textSecondary),
            ),
          ),
          const SizedBox(height: 6),
          const Center(
            child: Text('Play a ranked match to claim your spot.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 12.5)),
          ),
        ],
      );

  Widget _errorState(LeaderboardQuery query) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Could not load the leaderboard.', style: TextStyle(color: AppColors.textSecondary)),
            const SizedBox(height: 10),
            TextButton(
              onPressed: () => ref.invalidate(leaderboardProvider(query)),
              child: const Text('Retry', style: TextStyle(color: AppColors.softCyan)),
            ),
          ],
        ),
      );
}

class _Controls extends ConsumerWidget {
  const _Controls({
    required this.friends,
    required this.gameSlug,
    required this.onToggleFriends,
    required this.onGameChanged,
  });

  final bool friends;
  final String? gameSlug;
  final VoidCallback onToggleFriends;
  final ValueChanged<String?> onGameChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalogAsync = ref.watch(gameCatalogProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(value: false, label: Text('Global'), icon: Icon(Icons.public_rounded, size: 16)),
                    ButtonSegment(value: true, label: Text('Friends'), icon: Icon(Icons.people_rounded, size: 16)),
                  ],
                  selected: {friends},
                  onSelectionChanged: (selection) {
                    final next = selection.first;
                    if (next != friends) onToggleFriends();
                  },
                  style: ButtonStyle(
                    backgroundColor: WidgetStateProperty.resolveWith(
                      (states) => states.contains(WidgetState.selected)
                          ? AppColors.electricPurple
                          : AppColors.surfaceElevated,
                    ),
                    foregroundColor: WidgetStatePropertyAll(AppColors.textPrimary),
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          catalogAsync.maybeWhen(
            data: (games) => SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  _GameChip(label: 'Overall', selected: gameSlug == null, onTap: () => onGameChanged(null)),
                  for (final g in games)
                    _GameChip(
                      label: g.name,
                      selected: gameSlug == g.slug,
                      onTap: () => onGameChanged(g.slug),
                    ),
                ],
              ),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

class _GameChip extends StatelessWidget {
  const _GameChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? AppColors.softCyan.withValues(alpha: 0.18) : AppColors.surfaceElevated,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: selected ? AppColors.softCyan : AppColors.glassStroke),
          ),
          child: Text(label,
              style: TextStyle(
                  color: selected ? AppColors.softCyan : AppColors.textSecondary,
                  fontSize: 13,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500)),
        ),
      ),
    );
  }
}

class _EntryRow extends StatelessWidget {
  const _EntryRow({required this.entry});
  final LeaderboardEntry entry;

  @override
  Widget build(BuildContext context) {
    final medal = entry.rank <= 3 ? Color(entry.tier.colorValue) : null;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: entry.isSelf
            ? AppColors.electricPurple.withValues(alpha: 0.18)
            : AppColors.glassFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: entry.isSelf ? AppColors.electricPurple : AppColors.glassStroke,
            width: entry.isSelf ? 1.4 : 1),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 34,
            child: Text(
              entry.rank <= 3 ? medalEmoji(entry.rank) : '${entry.rank}',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: entry.rank <= 3 ? 20 : 15,
                  fontWeight: FontWeight.w800,
                  color: medal ?? AppColors.textSecondary),
            ),
          ),
          const SizedBox(width: 8),
          RankBadge(tier: entry.tier, size: 34),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.isSelf ? '${entry.displayName} (You)' : entry.displayName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700, fontSize: 14.5),
                ),
                Text('${entry.tier.label} · ${entry.wins}W ${entry.losses}L',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
              ],
            ),
          ),
          Text('${entry.rating}',
              style: const TextStyle(color: AppColors.softCyan, fontSize: 18, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }

  static String medalEmoji(int rank) => switch (rank) { 1 => '🥇', 2 => '🥈', _ => '🥉' };
}

/// Pinned "you" card shown above the list when the player is outside the top 3.
class _SelfPinnedCard extends StatelessWidget {
  const _SelfPinnedCard({required this.entry});
  final LeaderboardEntry entry;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      margin: EdgeInsets.zero,
      padding: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Row(
          children: [
            SizedBox(
              width: 34,
              child: Text('#${entry.rank}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.w800, fontSize: 15)),
            ),
            const SizedBox(width: 8),
            RankBadge(tier: entry.tier, size: 34),
            const SizedBox(width: 10),
            Expanded(
              child: Text('${entry.displayName} (You)',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700)),
            ),
            Text('${entry.rating}',
                style: const TextStyle(color: AppColors.softCyan, fontSize: 18, fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }
}
