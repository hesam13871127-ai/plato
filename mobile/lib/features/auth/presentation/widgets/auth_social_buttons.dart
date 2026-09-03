import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../providers/auth_notifier.dart';

/// Google + Apple sign-in buttons with a frosted-glass treatment.
class AuthSocialButtons extends ConsumerWidget {
  const AuthSocialButtons({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isLoading = ref.watch(authNotifierProvider.select((s) => s.isLoading));

    return Column(
      children: [
        _SocialButton(
          label: 'Continue with Google',
          icon: Icons.g_mobiledata_rounded,
          iconColor: const Color(0xFFEA4335),
          enabled: !isLoading,
          onTap: () => ref.read(authNotifierProvider.notifier).signInWithGoogle(),
        ),
        const SizedBox(height: 12),
        _SocialButton(
          label: 'Continue with Apple',
          icon: Icons.apple_rounded,
          iconColor: Colors.white,
          enabled: !isLoading,
          onTap: () => ref.read(authNotifierProvider.notifier).signInWithApple(),
        ),
      ],
    );
  }
}

class _SocialButton extends StatelessWidget {
  const _SocialButton({
    required this.label,
    required this.icon,
    required this.iconColor,
    required this.onTap,
    required this.enabled,
  });

  final String label;
  final IconData icon;
  final Color iconColor;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: Material(
        color: AppColors.glassFill,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: enabled ? onTap : null,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 15),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.glassStroke),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: iconColor, size: 24),
                const SizedBox(width: 12),
                Text(
                  label,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
