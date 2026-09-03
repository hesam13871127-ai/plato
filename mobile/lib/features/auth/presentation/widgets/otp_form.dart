import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/gradient_button.dart';
import '../providers/auth_notifier.dart';

/// Step 2 — enter the 6-digit code (and an optional display name on sign-up).
class OtpForm extends ConsumerStatefulWidget {
  const OtpForm({super.key, required this.phone});

  final String phone;

  @override
  ConsumerState<OtpForm> createState() => _OtpFormState();
}

class _OtpFormState extends ConsumerState<OtpForm> {
  final _formKey = GlobalKey<FormState>();
  final _codeController = TextEditingController();
  final _nameController = TextEditingController();

  @override
  void dispose() {
    _codeController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final name = _nameController.text.trim();
    await ref.read(authNotifierProvider.notifier).verifyPhoneOtp(
          code: _codeController.text.trim(),
          displayName: name.isEmpty ? null : name,
        );
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = ref.watch(authNotifierProvider.select((s) => s.isLoading));

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Enter verification code',
                    style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700, fontSize: 16)),
              ),
              TextButton(
                onPressed: () => ref.read(authNotifierProvider.notifier).resetOtpFlow(),
                child: const Text('Edit number'),
              ),
            ],
          ),
          Text(
            'We sent a 6-digit code to ${widget.phone}',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _codeController,
            keyboardType: TextInputType.number,
            maxLength: 6,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 24, letterSpacing: 8, fontWeight: FontWeight.w700),
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(
              counterText: '',
              hintText: '••••••',
              prefixIcon: Icon(Icons.pin_rounded),
            ),
            validator: (value) {
              if (!RegExp(r'^\d{4,10}$').hasMatch((value ?? '').trim())) {
                return 'Enter the code you received.';
              }
              return null;
            },
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _nameController,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              hintText: 'Display name (optional)',
              prefixIcon: Icon(Icons.badge_outlined),
            ),
          ),
          const SizedBox(height: 18),
          GradientButton(label: 'Verify & continue', isLoading: isLoading, onPressed: _submit),
        ],
      ),
    );
  }
}
