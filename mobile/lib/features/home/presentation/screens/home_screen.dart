import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../../core/widgets/wallet_chip.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../../quests/presentation/providers/quests_providers.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authNotifierProvider.select((s) => s.user));
    final dailyAvailable = ref.watch(dailyPanelProvider).maybeWhen(
          data: (panel) => !panel.daily.claimedToday,
          orElse: () => false,
        );

    return Scaffold(
      appBar: AppBar(
        title: const Text('VibeTable'),
        actions: [
          // Friends & groups hub.
          IconButton(
            icon: const Icon(Icons.people_alt_rounded, size: 26),
            color: AppColors.softCyan,
            onPressed: () => context.push(AppRoutes.friends),
            tooltip: 'Friends',
          ),
          // Real-time chat inbox.
          IconButton(
            icon: const Icon(Icons.forum_rounded, size: 26),
            color: AppColors.softCyan,
            onPressed: () => context.push(AppRoutes.chat),
            tooltip: 'Messages',
          ),
          // Daily reward shortcut — pulses/highlights when unclaimed.
          IconButton(
            icon: Badge(
              isLabelVisible: dailyAvailable,
              label: const Text('1'),
              child: const Icon(Icons.calendar_month_rounded, size: 26),
            ),
            color: AppColors.softCyan,
            onPressed: () => context.push(AppRoutes.quests),
            tooltip: 'Daily rewards',
          ),
          IconButton(
            icon: const Icon(Icons.account_circle_rounded, size: 28),
            color: AppColors.softCyan,
            onPressed: () => context.push(AppRoutes.profile),
            tooltip: 'Profile',
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.navyGradient),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            GlassCard(
              onTap: () => context.push(AppRoutes.wallet),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0x407B5CFF), Color(0x2000E5FF)],
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: AppColors.electricPurple,
                    backgroundImage: user.avatarUrl != null ? NetworkImage(user.avatarUrl!) : null,
                    child: user.avatarUrl == null
                        ? Text(
                            user.displayName.isNotEmpty ? user.displayName[0].toUpperCase() : '?',
                            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
                          )
                        : null,
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Hi, ${user.displayName.isNotEmpty ? user.displayName : 'Player'}',
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                        ),
                        Text('@${user.username} · Level ${user.level}',
                            style: const TextStyle(color: AppColors.textSecondary)),
                      ],
                    ),
                  ),
                  WalletChip(coins: user.coins, pips: user.pips),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const Text('Your stuff',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.5,
              children: const [
                _HubTile(
                  title: 'Play',
                  subtitle: 'Games & matchmaking',
                  icon: Icons.casino_rounded,
                  route: AppRoutes.games,
                ),
                _HubTile(
                  title: 'Ranked Season',
                  subtitle: 'Tiers, rewards & leaderboard',
                  icon: Icons.emoji_events_rounded,
                  route: AppRoutes.season,
                ),
                _HubTile(
                  title: 'Shop',
                  subtitle: 'Cosmetics & gifts',
                  icon: Icons.storefront_rounded,
                  route: AppRoutes.shop,
                ),
                _HubTile(
                  title: 'Inventory',
                  subtitle: 'Equip your look',
                  icon: Icons.checkroom_rounded,
                  route: AppRoutes.inventory,
                ),
                _HubTile(
                  title: 'Daily rewards',
                  subtitle: 'Free coins & quests',
                  icon: Icons.card_giftcard_rounded,
                  route: AppRoutes.quests,
                ),
                _HubTile(
                  title: 'Wallet',
                  subtitle: 'Balance & history',
                  icon: Icons.account_balance_wallet_rounded,
                  route: AppRoutes.wallet,
                ),
                _HubTile(
                  title: 'Messages',
                  subtitle: 'Chat, voice & Lounge',
                  icon: Icons.forum_rounded,
                  route: AppRoutes.chat,
                ),
              ],
            ),
            const SizedBox(height: 20),
            const Text('Popular Tables',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
            const SizedBox(height: 12),
            _GameTile(
              title: 'Dominoes',
              subtitle: 'Draw Dominoes · 2–4 players · play now',
              icon: Icons.view_module_rounded,
              route: AppRoutes.matchmaking('dominoes'),
            ),
            const _GameTile(
              title: 'More games',
              subtitle: 'Browse the full catalogue',
              icon: Icons.sports_esports_rounded,
              route: AppRoutes.games,
            ),
          ],
        ),
      ),
    );
  }
}

class _HubTile extends StatelessWidget {
  const _HubTile({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.route,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final String route;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      onTap: () => context.push(route),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              gradient: AppColors.brandGradient,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: Colors.white),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                Text(subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _GameTile extends StatelessWidget {
  const _GameTile({required this.title, required this.subtitle, required this.icon, required this.route});
  final String title;
  final String subtitle;
  final IconData icon;
  final String route;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GlassCard(
        onTap: () => context.push(route),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                gradient: AppColors.brandGradient,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: Colors.white),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  Text(subtitle, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
          ],
        ),
      ),
    );
  }
}
