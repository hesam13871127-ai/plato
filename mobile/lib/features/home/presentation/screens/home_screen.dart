import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authNotifierProvider.select((s) => s.user));

    return Scaffold(
      appBar: AppBar(
        title: const Text('VibeTable'),
        actions: [
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
                        Text('@${user.username}',
                            style: const TextStyle(color: AppColors.textSecondary)),
                      ],
                    ),
                  ),
                  _WalletChip(coins: user.coins, gems: user.gems),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const Text('Popular Tables',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
            const SizedBox(height: 12),
            const _GameTile(title: 'Backgammon', subtitle: 'Classic · 2 players', icon: Icons.grid_on_rounded),
            const _GameTile(title: 'Dominoes', subtitle: 'Fast · 2–4 players', icon: Icons.view_module_rounded),
            const _GameTile(title: 'Ludo', subtitle: 'Party · 2–4 players', icon: Icons.sports_esports_rounded),
          ],
        ),
      ),
    );
  }
}

class _WalletChip extends StatelessWidget {
  const _WalletChip({required this.coins, required this.gems});
  final int coins;
  final int gems;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Row(children: [
          const Icon(Icons.monetization_on_rounded, color: AppColors.softCyan, size: 18),
          const SizedBox(width: 4),
          Text('$coins', style: const TextStyle(fontWeight: FontWeight.w700)),
        ]),
        const SizedBox(height: 4),
        Row(children: [
          const Icon(Icons.diamond_rounded, color: AppColors.electricPurple, size: 18),
          const SizedBox(width: 4),
          Text('$gems', style: const TextStyle(fontWeight: FontWeight.w700)),
        ]),
      ],
    );
  }
}

class _GameTile extends StatelessWidget {
  const _GameTile({required this.title, required this.subtitle, required this.icon});
  final String title;
  final String subtitle;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GlassCard(
        onTap: () {},
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
