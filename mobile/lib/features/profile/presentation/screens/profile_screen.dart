import 'package:flutter/material.dart';
import '../../../../core/widgets/cached_avatar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../../core/widgets/gradient_button.dart';
import '../../../auth/domain/entities/auth_user.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../../moderation/data/moderation_remote_data_source.dart';

/// Full player profile: avatar with equipped frame/banner, level/XP, titles,
/// badges and aggregate statistics. All cosmetics are purely visual.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authNotifierProvider.select((s) => s.user));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: AppColors.softCyan),
            tooltip: 'Refresh',
            onPressed: () => ref.read(authNotifierProvider.notifier).refreshUser(),
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.navyGradient),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            _IdentityCard(user: user),
            const SizedBox(height: 16),
            _LevelCard(user: user),
            const SizedBox(height: 16),
            if (user.badges.isNotEmpty) ...[
              _SectionTitle(title: 'Badges'),
              const SizedBox(height: 10),
              _BadgesRow(badges: user.badges),
              const SizedBox(height: 16),
            ],
            _SectionTitle(title: 'Statistics'),
            const SizedBox(height: 10),
            _StatsGrid(user: user),
            const SizedBox(height: 16),
            _SectionTitle(title: 'Equipped cosmetics'),
            const SizedBox(height: 10),
            _CosmeticsCard(user: user),
            if (user.unlockedTitles.isNotEmpty) ...[
              const SizedBox(height: 16),
              _SectionTitle(title: 'Titles'),
              const SizedBox(height: 10),
              _TitlesCard(user: user),
            ],
            const SizedBox(height: 16),
            const _ModerationEntry(),
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

/// Only rendered for moderator/admin accounts (role is read from the server,
/// which is also the authoritative enforcer via the role guard). Moderators
/// see the reports/moderation dashboard; admins additionally get the full
/// admin panel (users, shop, games, seasons, analytics).
class _ModerationEntry extends ConsumerWidget {
  const _ModerationEntry();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds = ref.watch(moderationRemoteDataSourceProvider);
    return FutureBuilder<String>(
      future: ds.myRole(),
      builder: (context, snapshot) {
        final role = snapshot.data;
        if (role != 'moderator' && role != 'admin') {
          return const SizedBox.shrink();
        }
        final isAdmin = role == 'admin';
        return Column(
          children: [
            if (isAdmin)
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.electricPurple,
                  side: BorderSide(color: AppColors.electricPurple.withValues(alpha: 0.6)),
                  minimumSize: const Size.fromHeight(48),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                icon: const Icon(Icons.admin_panel_settings_rounded, size: 20),
                label: const Text('Admin panel', style: TextStyle(fontWeight: FontWeight.w800)),
                onPressed: () => context.push(AppRoutes.admin),
              ),
            if (isAdmin) const SizedBox(height: 10),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.softCyan,
                side: const BorderSide(color: AppColors.glassStroke),
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              icon: const Icon(Icons.shield_outlined, size: 20),
              label: const Text('Moderation dashboard', style: TextStyle(fontWeight: FontWeight.w700)),
              onPressed: () => context.push(AppRoutes.moderation),
            ),
          ],
        );
      },
    );
  }
}

class _IdentityCard extends StatelessWidget {
  const _IdentityCard({required this.user});
  final AuthUser user;

  @override
  Widget build(BuildContext context) {
    final bannerColor = _bannerColor(user.banner?.metadata);

    return GlassCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          // Banner strip.
          Container(
            height: 92,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: bannerColor ??
                    const [Color(0x557B5CFF), Color(0x2200E5FF)],
              ),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            ),
          ),
          Transform.translate(
            offset: const Offset(0, -34),
            child: Column(
              children: [
                _FramedAvatar(user: user),
                const SizedBox(height: 10),
                if (user.title != null && user.title!.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      gradient: AppColors.brandGradient,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(user.title!,
                        style: const TextStyle(
                            color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
                  ),
                const SizedBox(height: 8),
                Text(user.displayName,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                Text('@${user.username}',
                    style: const TextStyle(color: AppColors.textSecondary)),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.monetization_on_rounded, size: 16, color: AppColors.softCyan),
                    const SizedBox(width: 4),
                    Text('${user.coins}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(width: 16),
                    Icon(Icons.diamond_rounded, size: 16, color: AppColors.electricPurple),
                    const SizedBox(width: 4),
                    Text('${user.pips}', style: const TextStyle(fontWeight: FontWeight.w700)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static List<Color>? _bannerColor(Map<String, dynamic>? meta) {
    if (meta == null) return null;
    final base = meta['color'] ?? meta['gradientFrom'];
    if (base is String && base.startsWith('#') && base.length >= 7) {
      final c = _hexToColor(base);
      if (c != null) return [c.withValues(alpha: 0.55), c.withValues(alpha: 0.15)];
    }
    return null;
  }
}

class _FramedAvatar extends StatelessWidget {
  const _FramedAvatar({required this.user});
  final AuthUser user;

  @override
  Widget build(BuildContext context) {
    final frameColor = _frameColor(user.frame?.metadata);
    final avatar = CachedAvatar(name: user.displayName, imageUrl: user.avatarUrl, radius: 40);

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: frameColor != null
            ? LinearGradient(colors: frameColor)
            : AppColors.brandGradient,
        boxShadow: [
          if (user.frame != null)
            BoxShadow(
              color: (frameColor?.first ?? AppColors.electricPurple).withValues(alpha: 0.5),
              blurRadius: 18,
            ),
        ],
      ),
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: const BoxDecoration(color: AppColors.deepNavy, shape: BoxShape.circle),
        child: avatar,
      ),
    );
  }

  static List<Color>? _frameColor(Map<String, dynamic>? meta) {
    if (meta == null) return null;
    final base = meta['color'] ?? meta['frameColor'];
    if (base is String && base.startsWith('#') && base.length >= 7) {
      final c = _hexToColor(base);
      if (c != null) return [c, AppColors.softCyan];
    }
    return null;
  }
}

class _LevelCard extends StatelessWidget {
  const _LevelCard({required this.user});
  final AuthUser user;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.military_tech_rounded, color: AppColors.warning),
              const SizedBox(width: 10),
              Text('Level ${user.level}',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const Spacer(),
              Text('${user.xp} XP',
                  style: const TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: _xpFraction(user.xp),
              minHeight: 10,
              backgroundColor: AppColors.glassFill,
              valueColor: const AlwaysStoppedAnimation<Color>(AppColors.softCyan),
            ),
          ),
          const SizedBox(height: 8),
          const Text('Earn XP from daily rewards and quests to level up.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
        ],
      ),
    );
  }

  double _xpFraction(int xp) {
    // Backend leveling: cumulative XP for level n is 100(n-1)+25(n-1)(n-2).
    int xpForLevel(int n) => 100 * (n - 1) + 25 * (n - 1) * (n - 2);
    final intoLevel = xp - xpForLevel(user.level);
    final span = xpForLevel(user.level + 1) - xpForLevel(user.level);
    return span <= 0 ? 0 : (intoLevel / span).clamp(0, 1);
  }
}

class _StatsGrid extends StatelessWidget {
  const _StatsGrid({required this.user});
  final AuthUser user;

  @override
  Widget build(BuildContext context) {
    final entries = <_Stat>[
      _Stat('Played', '${user.gamesPlayed}', Icons.sports_esports_rounded),
      _Stat('Won', '${user.gamesWon}', Icons.emoji_events_rounded, AppColors.success),
      _Stat('Lost', '${user.gamesLost}', Icons.sentiment_dissatisfied_outlined, AppColors.danger),
      _Stat('Drawn', '${user.gamesDrawn}', Icons.handshake_rounded, AppColors.textSecondary),
      _Stat('Win rate', '${user.winRate.toStringAsFixed(0)}%', Icons.percent_rounded),
      _Stat('Streak', '${user.streakDays}d', Icons.local_fire_department_rounded, AppColors.warning),
      _Stat('Gifts sent', '${user.giftsSent}', Icons.outbox_rounded),
      _Stat('Gifts received', '${user.giftsReceived}', Icons.move_to_inbox_rounded),
    ];

    return GridView.count(
      crossAxisCount: 4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 0.92,
      children: [
        for (final stat in entries)
          GlassCard(
            padding: const EdgeInsets.all(8),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(stat.icon, color: stat.color ?? AppColors.softCyan, size: 20),
                const SizedBox(height: 6),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(stat.value,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                ),
                Text(stat.label,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
              ],
            ),
          ),
      ],
    );
  }
}

class _Stat {
  const _Stat(this.label, this.value, this.icon, [this.color]);
  final String label;
  final String value;
  final IconData icon;
  final Color? color;
}

class _BadgesRow extends StatelessWidget {
  const _BadgesRow({required this.badges});
  final List<UserBadge> badges;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (final badge in badges)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.glassFill,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.glassStroke),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.shield_rounded, color: AppColors.warning, size: 16),
                  const SizedBox(width: 6),
                  Text(badge.name,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _CosmeticsCard extends StatelessWidget {
  const _CosmeticsCard({required this.user});
  final AuthUser user;

  @override
  Widget build(BuildContext context) {
    final rows = <_CosmeticRow>[
      _CosmeticRow('Frame', user.frame?.name, Icons.crop_portrait_rounded),
      _CosmeticRow('Banner', user.banner?.name, Icons.image_rounded),
      _CosmeticRow('Chat bubble', user.chatBubble?.name, Icons.chat_bubble_rounded),
      _CosmeticRow('Theme', user.theme?.name, Icons.palette_rounded),
      _CosmeticRow('ID color', user.idColor?.name, Icons.badge_rounded),
    ];

    return GlassCard(
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            rows[i],
            if (i < rows.length - 1) const Divider(color: AppColors.glassStroke, height: 20),
          ],
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => context.push(AppRoutes.inventory),
              icon: const Icon(Icons.checkroom_rounded, size: 18, color: AppColors.softCyan),
              label: const Text('Manage in inventory',
                  style: TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}

class _CosmeticRow extends StatelessWidget {
  const _CosmeticRow(this.label, this.value, this.icon);
  final String label;
  final String? value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: AppColors.textSecondary, size: 20),
        const SizedBox(width: 12),
        Text(label, style: const TextStyle(color: AppColors.textSecondary)),
        const Spacer(),
        Text(value ?? 'None',
            style: TextStyle(
                fontWeight: FontWeight.w700,
                color: value != null ? AppColors.textPrimary : AppColors.textMuted)),
      ],
    );
  }
}

class _TitlesCard extends StatelessWidget {
  const _TitlesCard({required this.user});
  final AuthUser user;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (final title in user.unlockedTitles)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                gradient: title == user.title ? AppColors.brandGradient : null,
                color: title == user.title ? null : AppColors.glassFill,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                    color: title == user.title ? Colors.transparent : AppColors.glassStroke),
              ),
              child: Text(title,
                  style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                      color: title == user.title ? Colors.white : AppColors.textSecondary)),
            ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Text(title,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
    );
  }
}

Color? _hexToColor(String hex) {
  final cleaned = hex.replaceFirst('#', '');
  final value = int.tryParse(cleaned.length == 6 ? 'FF$cleaned' : cleaned, radix: 16);
  return value == null ? null : Color(value);
}
