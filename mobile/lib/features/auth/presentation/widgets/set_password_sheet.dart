import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/gradient_button.dart';
import '../providers/auth_notifier.dart';

/// Shown once after a phone-OTP sign-up so the account gets a username/password
/// and can be signed into directly next time (and recovered by SMS).
class SetPasswordSheet extends ConsumerStatefulWidget {
  const SetPasswordSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => const SetPasswordSheet(),
    );
  }

  @override
  ConsumerState<SetPasswordSheet> createState() => _SetPasswordSheetState();
}

class _SetPasswordSheetState extends ConsumerState<SetPasswordSheet> {
  final _formKey = GlobalKey<FormState>();
  final _passwordController = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    final ok = await ref
        .read(authNotifierProvider.notifier)
        .setPassword(newPassword: _passwordController.text);
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      ref.read(authNotifierProvider.notifier).dismissNewUserPrompt();
      if (mounted) {
        Navigator.of(context).pop();
        context.go('/home');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(22, 18, 22, 22),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xF21A2B52), Color(0xF20E1830)],
          ),
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: AppColors.glassStroke),
        ),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 5,
                  decoration: BoxDecoration(
                    color: AppColors.glassStroke,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              const Icon(Icons.lock_outline_rounded, color: AppColors.softCyan, size: 34),
              const SizedBox(height: 12),
              Text(
                l10n.t('set_password_title'),
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textPrimary, fontSize: 19, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              Text(
                l10n.t('set_password_hint'),
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.5),
              ),
              const SizedBox(height: 18),
              TextFormField(
                controller: _passwordController,
                obscureText: true,
                style: const TextStyle(color: AppColors.textPrimary),
                decoration: InputDecoration(
                  hintText: l10n.t('password'),
                  prefixIcon: const Icon(Icons.lock_outline_rounded),
                ),
                validator: (v) => (v ?? '').length < 8 ? l10n.t('password_rules') : null,
              ),
              const SizedBox(height: 18),
              GradientButton(
                label: l10n.t('save'),
                isLoading: _saving,
                onPressed: _save,
              ),
              TextButton(
                onPressed: () {
                  ref.read(authNotifierProvider.notifier).dismissNewUserPrompt();
                  Navigator.of(context).pop();
                  context.go('/home');
                },
                child: Text(l10n.t('cancel'),
                    style: const TextStyle(color: AppColors.textSecondary)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
