import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../../core/widgets/gradient_button.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authNotifierProvider.select((s) => s.user));

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.navyGradient),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            GlassCard(
              child: Column(
                children: [
                  Center(
                    child: CircleAvatar(
                      radius: 44,
                      backgroundColor: AppColors.electricPurple,
                      backgroundImage: user.avatarUrl != null ? NetworkImage(user.avatarUrl!) : null,
                      child: user.avatarUrl == null
                          ? Text(
                              user.displayName.isNotEmpty ? user.displayName[0].toUpperCase() : '?',
                              style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w700),
                            )
                          : null,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(user.displayName,
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                  Text('@${user.username}',
                      style: const TextStyle(color: AppColors.textSecondary)),
                  const SizedBox(height: 8),
                  if (user.email != null)
                    Text(user.email!, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                  if (user.phone != null)
                    Text(user.phone!, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: _StatCard(label: 'Level', value: '${user.level}', icon: Icons.military_tech_rounded)),
                const SizedBox(width: 12),
                Expanded(child: _StatCard(label: 'Coins', value: '${user.coins}', icon: Icons.monetization_on_rounded)),
                const SizedBox(width: 12),
                Expanded(child: _StatCard(label: 'Gems', value: '${user.gems}', icon: Icons.diamond_rounded)),
              ],
            ),
            const SizedBox(height: 16),
            GlassCard(
              child: Column(
                children: [
                  _InfoRow(label: 'Verification', value: user.isVerified ? 'Verified' : 'Unverified', icon: Icons.verified_user_outlined),
                  const Divider(color: AppColors.glassStroke, height: 24),
                  _InfoRow(label: 'XP', value: '${user.xp}', icon: Icons.bolt_rounded),
                  const Divider(color: AppColors.glassStroke, height: 24),
                  _InfoRow(label: 'Status', value: user.presence, icon: Icons.circle_rounded, valueColor: AppColors.success),
                ],
              ),
            ),
            const SizedBox(height: 24),
            GradientButton(
              label: 'Log out',
              icon: Icons.logout_rounded,
              onPressed: () => ref.read(authNotifierProvider.notifier).logout(),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, required this.icon});
  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 8),
      child: Column(
        children: [
          Icon(icon, color: AppColors.softCyan),
          const SizedBox(height: 8),
          Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value, required this.icon, this.valueColor});
  final String label;
  final String value;
  final IconData icon;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: AppColors.textSecondary, size: 20),
        const SizedBox(width: 12),
        Text(label, style: const TextStyle(color: AppColors.textSecondary)),
        const Spacer(),
        Text(value, style: TextStyle(fontWeight: FontWeight.w700, color: valueColor ?? AppColors.textPrimary)),
      ],
    );
  }
}
