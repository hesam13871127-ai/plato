import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/services/feedback_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/bottom_dock.dart';
import '../../../../core/widgets/cached_avatar.dart';
import '../../../../core/widgets/game_logo.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../../core/widgets/wallet_chip.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../../auth/presentation/widgets/set_password_sheet.dart';
import '../../../quests/presentation/providers/quests_providers.dart';

/// Redesigned landing screen: a rich hero header, 3D glass cards for the main
/// categories, quick-launch game tiles, and the floating bottom dock.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  @override
  void initState() {
    super.initState();
    // New phone sign-ups land here; offer to set a password once so future
    // logins can use username/password (and SMS recovery works).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = ref.read(authNotifierProvider);
      if (auth.isNewUser) {
        SetPasswordSheet.show(context);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final user = ref.watch(authNotifierProvider.select((s) => s.user));
    final dailyAvailable = ref.watch(dailyPanelProvider).maybeWhen(
          data: (panel) => !panel.daily.claimedToday,
          orElse: () => false,
        );

    return Scaffold(
      backgroundColor: Colors.transparent,
      extendBody: true,
      body: Container(
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0.8, -0.9),
            radius: 1.5,
            colors: [Color(0xFF2A1F5E), AppColors.deepNavy],
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 120),
            children: [
              // ── Top bar ──────────────────────────────────────────────
              Row(
                children: [
                  AppBrandLogo(size: 44),
                  const SizedBox(width: 10),
                  ShaderMask(
                    shaderCallback: (r) => AppColors.brandGradient.createShader(r),
                    child: const Text(
                      'VibeTable',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                  const Spacer(),
                  _IconPill(
                    icon: Icons.settings_outlined,
                    onTap: () => context.push(AppRoutes.settings),
                  ),
                  _IconPill(
                    icon: Icons.forum_rounded,
                    onTap: () => context.push(AppRoutes.chat),
                  ),
                ],
              ),
              const SizedBox(height: 18),

              // ── Profile/hero card ────────────────────────────────────
              GlassCard(
                onTap: () => context.push(AppRoutes.profile),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0x4D8A6CFF), Color(0x26FF6B8B)],
                ),
                child: Row(
                  children: [
                    CachedAvatar(
                        name: user.displayName, imageUrl: user.avatarUrl, radius: 30),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${user.displayName.isNotEmpty ? user.displayName : 'Player'} 👋',
                            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
                          ),
                          Text('@${user.username} · Lv ${user.level}',
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                        ],
                      ),
                    ),
                    WalletChip(coins: user.coins, pips: user.pips),
                  ],
                ),
              ),
              const SizedBox(height: 22),

              // ── Main categories (large 3D glass tiles) ───────────────
              Row(
                children: [
                  _CategoryCard(
                    emoji: '🎲',
                    title: l10n.t('tab_games'),
                    subtitle: '25',
                    gradient: const LinearGradient(
                      colors: [Color(0xFF3B2A9E), Color(0xFF1B3A6B)],
                    ),
                    onTap: () => context.push(AppRoutes.games),
                  ),
                  const SizedBox(width: 12),
                  _CategoryCard(
                    emoji: '🛍️',
                    title: l10n.t('tab_shop'),
                    subtitle: l10n.t('shop_games'),
                    gradient: const LinearGradient(
                      colors: [Color(0xFF5A2A6E), Color(0xFF7A2E4C)],
                    ),
                    onTap: () => context.push(AppRoutes.shop),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _CategoryCard(
                    emoji: '🏆',
                    title: l10n.t('tab_profile'),
                    subtitle: 'Season',
                    gradient: const LinearGradient(
                      colors: [Color(0xFF14574A), Color(0xFF1B3A6B)],
                    ),
                    onTap: () => context.push(AppRoutes.season),
                  ),
                  const SizedBox(width: 12),
                  _CategoryCard(
                    emoji: '🎁',
                    title: l10n.t('tab_chat'),
                    subtitle: 'Daily',
                    badge: dailyAvailable,
                    gradient: const LinearGradient(
                      colors: [Color(0xFF7A4A1E), Color(0xFF7A2E4C)],
                    ),
                    onTap: () =>
                        context.push(dailyAvailable ? AppRoutes.quests : AppRoutes.chat),
                  ),
                ],
              ),
              const SizedBox(height: 26),

              // ── Quick-play games strip ───────────────────────────────
              Text(l10n.t('choose_game'),
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
              const SizedBox(height: 14),
              SizedBox(
                height: 128,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: const [
                    _QuickGame(slug: 'ludo', name: 'Ludo', emoji: '🟥'),
                    _QuickGame(slug: 'checkers', name: 'Checkers', emoji: '⚫'),
                    _QuickGame(slug: 'backgammon', name: 'Backgammon', emoji: '🎲'),
                    _QuickGame(slug: 'dots_boxes', name: 'Dots & Boxes', emoji: '🔲'),
                    _QuickGame(slug: 'reversi', name: 'Reversi', emoji: '⚪'),
                    _QuickGame(slug: 'sea_battle', name: 'Sea Battle', emoji: '🚢'),
                    _QuickGame(slug: 'mines', name: 'Mines', emoji: '💣'),
                    _QuickGame(slug: 'mancala', name: 'Mancala', emoji: '🪨'),
                    _QuickGame(slug: 'go_fish', name: 'Go Fish', emoji: '🐟'),
                    _QuickGame(slug: 'dice_party', name: 'Dice Party', emoji: '🎲'),
                    _QuickGame(slug: 'chess', name: 'Chess', emoji: '♟️'),
                    _QuickGame(slug: 'dominoes', name: 'Dominoes', emoji: '🁢'),
                    _QuickGame(slug: 'pool_8ball', name: '8 Ball', emoji: '🎱'),
                    _QuickGame(slug: 'ocho', name: 'Ocho', emoji: '🃏'),
                    _QuickGame(slug: 'connect4', name: 'Connect 4', emoji: '🔴'),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
        child: BottomDock(
          current: 0,
          items: [
            DockItem(icon: Icons.home_rounded, labelKey: 'tab_home', onTap: () {}),
            DockItem(
                icon: Icons.casino_rounded,
                labelKey: 'tab_games',
                onTap: () => context.push(AppRoutes.games)),
            DockItem(
                icon: Icons.storefront_rounded,
                labelKey: 'tab_shop',
                onTap: () => context.push(AppRoutes.shop)),
            DockItem(
                icon: Icons.forum_rounded,
                labelKey: 'tab_chat',
                onTap: () => context.push(AppRoutes.chat)),
            DockItem(
                icon: Icons.person_rounded,
                labelKey: 'tab_profile',
                onTap: () => context.push(AppRoutes.profile)),
          ],
        ),
      ),
    );
  }
}

class _IconPill extends ConsumerWidget {
  const _IconPill({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(left: 8),
      child: Material(
        color: AppColors.glassFill,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppColors.glassStroke),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () {
            ref.read(feedbackServiceProvider.notifier).tap();
            onTap();
          },
          child: Padding(padding: const EdgeInsets.all(9), child: Icon(icon, color: AppColors.softCyan, size: 21)),
        ),
      ),
    );
  }
}

class _CategoryCard extends ConsumerWidget {
  const _CategoryCard({
    required this.emoji,
    required this.title,
    required this.subtitle,
    required this.gradient,
    required this.onTap,
    this.badge = false,
  });

  final String emoji;
  final String title;
  final String subtitle;
  final Gradient gradient;
  final VoidCallback onTap;
  final bool badge;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Expanded(
      child: GestureDetector(
        onTap: () {
          ref.read(feedbackServiceProvider.notifier).action();
          onTap();
        },
        child: Container(
          height: 132,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            gradient: gradient,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: AppColors.glassStroke),
            boxShadow: [
              BoxShadow(
                color: AppColors.electricPurple.withValues(alpha: 0.25),
                blurRadius: 22,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Stack(
            children: [
              Positioned(
                right: -6,
                bottom: -10,
                child: Text(emoji, style: const TextStyle(fontSize: 56)),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Text(title,
                          style: const TextStyle(
                              color: Colors.white, fontSize: 17, fontWeight: FontWeight.w900)),
                      if (badge)
                        Container(
                          margin: const EdgeInsets.only(left: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.danger,
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: const Text('1',
                              style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
                        ),
                    ],
                  ),
                  Text(subtitle,
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickGame extends ConsumerWidget {
  const _QuickGame({required this.slug, required this.name, required this.emoji});

  final String slug;
  final String name;
  final String emoji;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(right: 14),
      child: GestureDetector(
        onTap: () {
          ref.read(feedbackServiceProvider.notifier).diceRoll();
          context.push(AppRoutes.matchmaking(slug));
        },
        child: Column(
          children: [
            GameLogo(slug: slug, size: 84, radius: 24, emoji: emoji),
            const SizedBox(height: 8),
            SizedBox(
              width: 84,
              child: Text(name,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }
}
