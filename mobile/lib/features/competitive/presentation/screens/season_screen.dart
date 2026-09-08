import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../domain/entities/season_ranking.dart';
import '../providers/competitive_providers.dart';
import '../widgets/leaderboard_view.dart';
import '../widgets/rank_badge.dart';
import '../widgets/season_countdown.dart';

/// Season hub: the active season with a live countdown, the Bronze/Silver/Gold
/// reward ladder, the player's current standing, and global / friends / game
/// leaderboards.
class SeasonScreen extends ConsumerStatefulWidget {
  const SeasonScreen({super.key});

  @override
  ConsumerState<SeasonScreen> createState() => _SeasonScreenState();
}

class _SeasonScreenState extends ConsumerState<SeasonScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final ValueNotifier<String?> _selectedGame = ValueNotifier<String?>(null);

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    _selectedGame.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final seasonAsync = ref.watch(seasonProvider);
    final myRankAsync = ref.watch(myRankingsProvider);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Ranked Season',
            style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
        bottom: TabBar(
          controller: _tabs,
          indicatorColor: AppColors.softCyan,
          labelColor: AppColors.softCyan,
          unselectedLabelColor: AppColors.textSecondary,
          tabs: const [Tab(text: 'Season'), Tab(text: 'Leaderboards')],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _seasonTab(seasonAsync, myRankAsync),
          _leaderboardsTab(),
        ],
      ),
    );
  }

  // ── Season tab ─────────────────────────────────────────────────────────────
  Widget _seasonTab(AsyncValue<SeasonInfo> seasonAsync, AsyncValue<MyRanking> myRankAsync) {
    return RefreshIndicator(
      color: AppColors.softCyan,
      backgroundColor: AppColors.surfaceElevated,
      onRefresh: () async {
        ref.invalidate(seasonProvider);
        ref.invalidate(myRankingsProvider);
        // Best-effort refresh; the providers rebuild regardless of the result.
        await ref.read(seasonProvider.future).then((_) {}).catchError((_) {});
      },
      child: seasonAsync.when(
        data: (season) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _SeasonHeader(season: season),
            const SizedBox(height: 16),
            myRankAsync.maybeWhen(
              data: (ranking) => ranking.overall != null
                  ? Column(
                      children: [
                        _MyRankCard(entry: ranking.overall!),
                        if (ranking.games.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          _GameRatings(entries: ranking.games),
                        ],
                      ],
                    )
                  : const _UnrankedCard(),
              orElse: () => const SizedBox.shrink(),
            ),
            const SizedBox(height: 20),
            const _SectionTitle('Season rewards'),
            const SizedBox(height: 8),
            ...season.ranks.map((rank) => _RankRewardCard(rank: rank)),
            const SizedBox(height: 24),
            GlassCard(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: const [
                    Icon(Icons.shield_rounded, color: AppColors.softCyan, size: 20),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'High-score protection: once you reach a tier, losses can never '
                        'demote you below it this season.',
                        style: TextStyle(color: AppColors.textSecondary, fontSize: 12.5, height: 1.4),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.softCyan)),
        error: (e, _) => _ErrorState(
          message: 'Could not load the season.',
          onRetry: () => ref.invalidate(seasonProvider),
        ),
      ),
    );
  }

  // ── Leaderboards tab ───────────────────────────────────────────────────────
  Widget _leaderboardsTab() {
    return ValueListenableBuilder<String?>(
      valueListenable: _selectedGame,
      builder: (context, gameSlug, _) {
        return LeaderboardView(
          gameSlug: gameSlug,
          onGameChanged: (slug) => _selectedGame.value = slug,
        );
      },
    );
  }
}

class _SeasonHeader extends StatelessWidget {
  const _SeasonHeader({required this.season});
  final SeasonInfo season;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: AppColors.brandGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: AppColors.electricPurple.withValues(alpha: 0.35), blurRadius: 24)],
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.emoji_events_rounded, color: Colors.white, size: 26),
                const SizedBox(width: 10),
                Text(season.name,
                    style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: 14),
            SeasonCountdown(timeRemainingMs: season.timeRemainingMs),
            const SizedBox(height: 6),
            Text(
              'Ends ${_formatDate(season.endsAt)}',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  static String _formatDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

class _MyRankCard extends StatelessWidget {
  const _MyRankCard({required this.entry});
  final MyRankingEntry entry;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      margin: EdgeInsets.zero,
      padding: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            RankBadge(tier: entry.tier, size: 52),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${entry.tier.label} Division',
                      style: const TextStyle(color: AppColors.textPrimary, fontSize: 17, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text('${entry.wins}W · ${entry.losses}L · ${entry.draws}D · ${entry.matchesPlayed} matches',
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('${entry.rating}',
                    style: const TextStyle(
                        color: AppColors.softCyan, fontSize: 28, fontWeight: FontWeight.w800)),
                Text('Peak ${entry.peakRating}',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _UnrankedCard extends StatelessWidget {
  const _UnrankedCard();

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            const Icon(Icons.workspace_premium_outlined, color: AppColors.softCyan, size: 28),
            const SizedBox(width: 14),
            const Expanded(
              child: Text(
                'Play a ranked match to get your rating and start climbing.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 13.5, height: 1.4),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GameRatings extends StatelessWidget {
  const _GameRatings({required this.entries});
  final List<MyRankingEntry> entries;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        children: [
          for (final e in entries)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(
                children: [
                  RankBadge(tier: e.tier, size: 30),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(e.gameName ?? 'Game',
                        style: const TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w600)),
                  ),
                  Text('${e.rating}',
                      style: const TextStyle(color: AppColors.softCyan, fontSize: 16, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _RankRewardCard extends StatelessWidget {
  const _RankRewardCard({required this.rank});
  final RankRewardInfo rank;

  @override
  Widget build(BuildContext context) {
    final color = Color(rank.colorValue);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassCard(
        margin: EdgeInsets.zero,
        padding: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              RankBadge(tier: rank.tier, size: 44),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${rank.label}  ·  ${rank.minRating}+',
                        style: TextStyle(color: color, fontSize: 16, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(rank.title, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        _RewardChip(icon: Icons.monetization_on_rounded, label: '${rank.coins}', color: AppColors.warning),
                        if (rank.pips > 0)
                          _RewardChip(icon: Icons.diamond_rounded, label: '${rank.pips}', color: AppColors.softCyan),
                        _RewardChip(icon: Icons.bolt_rounded, label: '${rank.xp} XP', color: AppColors.electricPurple),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RewardChip extends StatelessWidget {
  const _RewardChip({required this.icon, required this.label, required this.color});
  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.w700));
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const SizedBox(height: 80),
        Center(child: Text(message, style: const TextStyle(color: AppColors.textSecondary))),
        const SizedBox(height: 12),
        Center(
          child: TextButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded, color: AppColors.softCyan),
            label: const Text('Retry', style: TextStyle(color: AppColors.softCyan)),
          ),
        ),
      ],
    );
  }
}
