import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../../core/widgets/gradient_button.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../domain/entities/daily_quests.dart';
import '../providers/quests_providers.dart';

/// Daily free reward + quest board.
class QuestsScreen extends ConsumerWidget {
  const QuestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final panel = ref.watch(dailyPanelProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Daily Rewards')),
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.navyGradient),
        child: RefreshIndicator(
          color: AppColors.softCyan,
          backgroundColor: AppColors.surfaceElevated,
          onRefresh: () async => ref.invalidate(dailyPanelProvider),
          child: panel.when(
            loading: () => const Center(child: CircularProgressIndicator(color: AppColors.softCyan)),
            error: (error, _) => _ErrorState(message: error.toString()),
            data: (data) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(20),
              children: [
                _DailyRewardCard(reward: data.daily),
                const SizedBox(height: 20),
                const Text('Daily Quests',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
                const SizedBox(height: 12),
                for (final quest in data.quests) ...[
                  _QuestCard(quest: quest),
                  const SizedBox(height: 12),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DailyRewardCard extends ConsumerWidget {
  const _DailyRewardCard({required this.reward});
  final DailyReward reward;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GlassCard(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0x557B5CFF), Color(0x2200E5FF)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.calendar_month_rounded, color: AppColors.softCyan),
              const SizedBox(width: 10),
              const Text('Daily Check-in',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const Spacer(),
              _StreakBadge(day: reward.nextStreakDay),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _RewardPill(
                icon: Icons.monetization_on_rounded,
                color: AppColors.softCyan,
                label: '+${reward.rewardCoins} coins',
              ),
              if (reward.rewardPips > 0) ...[
                const SizedBox(width: 10),
                _RewardPill(
                  icon: Icons.diamond_rounded,
                  color: AppColors.electricPurple,
                  label: '+${reward.rewardPips} pips',
                ),
              ],
            ],
          ),
          const SizedBox(height: 18),
          GradientButton(
            label: reward.claimedToday ? 'Claimed today' : 'Claim free reward',
            icon: reward.claimedToday ? Icons.check_circle_rounded : Icons.card_giftcard_rounded,
            onPressed: reward.claimedToday ? null : () => _claimDaily(context, ref),
          ),
        ],
      ),
    );
  }

  Future<void> _claimDaily(BuildContext context, WidgetRef ref) async {
    final result = await ref.read(questsRepositoryProvider).claimDailyReward();
    if (!context.mounted) return;
    result.fold(
      (failure) => _showSnack(context, failure.message, isError: true),
      (claim) {
        _showSnack(context, 'Claimed +${claim.coinsAwarded} coins and +${claim.xpAwarded} XP!');
        ref.invalidate(dailyPanelProvider);
        ref.read(authNotifierProvider.notifier).refreshUser();
      },
    );
  }
}

class _QuestCard extends ConsumerWidget {
  const _QuestCard({required this.quest});
  final UserQuest quest;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isClaimable = quest.status == QuestStatus.claimable;
    final isClaimed = quest.status == QuestStatus.claimed;

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(quest.name,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
              if (quest.rewardCoins > 0)
                _RewardPill(
                  icon: Icons.monetization_on_rounded,
                  color: AppColors.softCyan,
                  label: '${quest.rewardCoins}',
                ),
              if (quest.rewardPips > 0) ...[
                const SizedBox(width: 8),
                _RewardPill(
                  icon: Icons.diamond_rounded,
                  color: AppColors.electricPurple,
                  label: '${quest.rewardPips}',
                ),
              ],
            ],
          ),
          if (quest.description != null) ...[
            const SizedBox(height: 4),
            Text(quest.description!,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          ],
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: quest.progressFraction,
              minHeight: 8,
              backgroundColor: AppColors.glassFill,
              valueColor: AlwaysStoppedAnimation(
                isClaimed ? AppColors.textMuted : AppColors.softCyan,
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text('${quest.progress}/${quest.goalTarget}',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: isClaimed
                ? _GhostButton(label: 'Claimed', icon: Icons.check_rounded)
                : GradientButton(
                    label: isClaimable ? 'Claim reward' : 'In progress',
                    icon: isClaimable ? Icons.redeem_rounded : Icons.hourglass_bottom_rounded,
                    onPressed: isClaimable ? () => _claim(context, ref) : null,
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _claim(BuildContext context, WidgetRef ref) async {
    final result = await ref.read(questsRepositoryProvider).claimQuest(userQuestId: quest.id);
    if (!context.mounted) return;
    result.fold(
      (failure) => _showSnack(context, failure.message, isError: true),
      (claim) {
        _showSnack(context, 'Reward claimed: +${claim.coinsAwarded} coins!');
        ref.invalidate(dailyPanelProvider);
        ref.read(authNotifierProvider.notifier).refreshUser();
      },
    );
  }
}

class _StreakBadge extends StatelessWidget {
  const _StreakBadge({required this.day});
  final int day;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        gradient: AppColors.brandGradient,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.local_fire_department_rounded, color: Colors.white, size: 16),
          const SizedBox(width: 4),
          Text('Day $day', style: const TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
        ],
      ),
    );
  }
}

class _RewardPill extends StatelessWidget {
  const _RewardPill({required this.icon, required this.color, required this.label});
  final IconData icon;
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.glassFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.glassStroke),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
        ],
      ),
    );
  }
}

class _GhostButton extends StatelessWidget {
  const _GhostButton({required this.label, required this.icon});
  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.glassFill,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.glassStroke),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: AppColors.textMuted, size: 20),
          const SizedBox(width: 8),
          Text(label,
              style: const TextStyle(color: AppColors.textMuted, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 120),
        const Icon(Icons.cloud_off_rounded, color: AppColors.textMuted, size: 48),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 40),
          child: Text(message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textSecondary)),
        ),
      ],
    );
  }
}

void _showSnack(BuildContext context, String message, {bool isError = false}) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message),
      backgroundColor: isError ? AppColors.danger : AppColors.surfaceElevated,
      behavior: SnackBarBehavior.floating,
    ),
  );
}
