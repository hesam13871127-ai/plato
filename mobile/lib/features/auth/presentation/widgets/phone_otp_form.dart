import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/gradient_button.dart';
import '../providers/auth_notifier.dart';

/// Step 1 — enter phone number and request an SMS code.
class PhoneOtpForm extends ConsumerStatefulWidget {
  @override
  ConsumerState<PhoneOtpForm> createState() => _PhoneOtpFormState();
}

class _PhoneOtpFormState extends ConsumerState<PhoneOtpForm> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final phone = _phoneController.text.trim();
    await ref.read(authNotifierProvider.notifier).requestPhoneOtp(phone);
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = ref.watch(authNotifierProvider.select((s) => s.isLoading));

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Align(
            alignment: Alignment.centerLeft,
            child: Text('Phone number',
                style: TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.w600)),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumber],
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+]'))],
            decoration: const InputDecoration(
              hintText: '+1 415 555 0123',
              prefixIcon: Icon(Icons.phone_iphone_rounded),
            ),
            validator: (value) {
              final v = (value ?? '').trim();
              if (!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(v)) {
                return 'Enter a valid phone number in international format (e.g. +14155550123).';
              }
              return null;
            },
          ),
          const SizedBox(height: 18),
          GradientButton(
            label: 'Send verification code',
            icon: Icons.send_rounded,
            isLoading: isLoading,
            
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}
