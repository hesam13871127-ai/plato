import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/i18n/locale_controller.dart';
import '../../../../core/services/feedback_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/game_logo.dart';
import '../../../../core/widgets/glass_card.dart';
import '../providers/auth_notifier.dart';
import '../widgets/admin_login_sheet.dart';
import '../widgets/otp_form.dart';
import '../widgets/password_auth_form.dart';
import '../widgets/phone_otp_form.dart';

/// Authentication entry screen. Hosts the phone-OTP flow (primary) and the
/// full password panel (login / sign-up / forgot-password by SMS) in
/// glassmorphism cards. Bilingual (EN/FA) and RTL-aware.
class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  bool _showPassword = false;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authNotifierProvider);
    final l10n = context.l10n;

    ref.listen(authNotifierProvider, (previous, next) {
      if (next.errorMessage != null && next.errorMessage != previous?.errorMessage) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(next.errorMessage!)));
        ref.read(feedbackServiceProvider.notifier).error();
      }
    });

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0.6, -0.9),
            radius: 1.4,
            colors: [Color(0xFF1B2350), AppColors.deepNavy],
          ),
        ),
        child: SafeArea(
          child: Stack(
            children: [
              Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const _BrandHeader(),
                      const SizedBox(height: 28),
                      Text(
                        l10n.t('welcome_subtitle'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 14, height: 1.5),
                      ),
                      const SizedBox(height: 24),
                      GlassCard(
                        child: state.otpSent
                            ? OtpForm(phone: state.verificationId ?? '')
                            : PhoneOtpForm(),
                      ),
                      const SizedBox(height: 16),
                      if (!state.otpSent) ...[
                        _Divider(label: l10n.t('or')),
                        const SizedBox(height: 12),
                        SizedBox(
                          height: 52,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: AppColors.brandGradient,
                              borderRadius: BorderRadius.circular(16),
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.electricPurple.withValues(alpha: 0.35),
                                  blurRadius: 20,
                                  offset: const Offset(0, 8),
                                ),
                              ],
                            ),
                            child: Material(
                              color: Colors.transparent,
                              child: InkWell(
                                borderRadius: BorderRadius.circular(16),
                                onTap: () {
                                  ref.read(feedbackServiceProvider.notifier).tap();
                                  setState(() => _showPassword = !_showPassword);
                                },
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Icon(Icons.key_rounded, color: Colors.white, size: 20),
                                    const SizedBox(width: 10),
                                    Text(
                                      l10n.t('login') + ' / ' + l10n.t('register'),
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 16,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                        if (_showPassword) ...[
                          const SizedBox(height: 14),
                          GlassCard(child: const PasswordAuthForm()),
                        ],
                      ],
                    ],
                  ),
                ),
              ),
              // Top-right corner actions: language + settings + staff sign-in.
              Positioned(
                top: 8,
                right: 8,
                left: 8,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _CircleIcon(
                      icon: Icons.settings_outlined,
                      onTap: () => context.push('/settings'),
                    ),
                    Row(
                      children: [
                        _CircleIcon(
                          icon: Icons.translate_rounded,
                          label: l10n.isFa ? 'EN' : 'فا',
                          onTap: () => ref.read(localeControllerProvider.notifier).toggle(),
                        ),
                        const SizedBox(width: 8),
                        _CircleIcon(
                          icon: Icons.admin_panel_settings_outlined,
                          onTap: () => AdminLoginSheet.show(context),
                        ),
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

class _BrandHeader extends StatelessWidget {
  const _BrandHeader();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const AppBrandLogo(size: 96),
        const SizedBox(height: 16),
        ShaderMask(
          shaderCallback: (rect) => AppColors.brandGradient.createShader(rect),
          child: Text(
            context.l10n.t('app_name'),
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w900,
              color: Colors.white,
              letterSpacing: 0.5,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          context.l10n.t('welcome_title'),
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 15),
        ),
      ],
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(child: Divider(color: AppColors.glassStroke)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
        ),
        const Expanded(child: Divider(color: AppColors.glassStroke)),
      ],
    );
  }
}

class _CircleIcon extends StatelessWidget {
  const _CircleIcon({required this.icon, required this.onTap, this.label});

  final IconData icon;
  final VoidCallback onTap;
  final String? label;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.glassFill,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.glassStroke),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: label != null
              ? Text(label!, style: const TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.w900, fontSize: 13))
              : Icon(icon, color: AppColors.softCyan, size: 20),
        ),
      ),
    );
  }
}
