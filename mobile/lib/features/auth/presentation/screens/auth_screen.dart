import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../providers/auth_notifier.dart';
import '../widgets/auth_social_buttons.dart';
import '../widgets/email_auth_form.dart';
import '../widgets/otp_form.dart';
import '../widgets/phone_otp_form.dart';

/// Authentication entry screen. Hosts the phone-OTP flow (primary), social
/// sign-in and email/password (secondary) in a glassmorphism panel.
class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  bool _showEmail = false;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authNotifierProvider);

    ref.listen(authNotifierProvider, (previous, next) {
      if (next.errorMessage != null && next.errorMessage != previous?.errorMessage) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(next.errorMessage!)));
      }
    });

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.navyGradient),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _BrandHeader(),
                  const SizedBox(height: 32),
                  GlassCard(
                    child: state.otpSent
                        ? OtpForm(phone: state.verificationId ?? '')
                        : PhoneOtpForm(),
                  ),
                  const SizedBox(height: 20),
                  if (!state.otpSent) ...[
                    Row(
                      children: const [
                        Expanded(child: Divider(color: AppColors.glassStroke)),
                        Padding(
                          padding: EdgeInsets.symmetric(horizontal: 12),
                          child: Text('or continue with',
                              style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                        ),
                        Expanded(child: Divider(color: AppColors.glassStroke)),
                      ],
                    ),
                    const SizedBox(height: 20),
                    const AuthSocialButtons(),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () => setState(() => _showEmail = !_showEmail),
                      child: Text(_showEmail ? 'Hide email sign-in' : 'Continue with email'),
                    ),
                    if (_showEmail) ...[
                      const SizedBox(height: 8),
                      GlassCard(child: EmailAuthForm()),
                    ],
                  ],
                ],
              ),
            ),
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
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            gradient: AppColors.brandGradient,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(color: AppColors.electricPurple.withValues(alpha: 0.4), blurRadius: 28),
            ],
          ),
          child: const Icon(Icons.casino_rounded, size: 42, color: Colors.white),
        ),
        const SizedBox(height: 20),
        const Text(
          'Welcome to VibeTable',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
        ),
        const SizedBox(height: 8),
        const Text(
          'Sign in to roll the dice with friends',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 15, color: AppColors.textSecondary),
        ),
      ],
    );
  }
}
