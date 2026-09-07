import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/services/feedback_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/gradient_button.dart';
import '../providers/auth_notifier.dart';

/// Tabs of the password auth panel.
enum _AuthMode { login, register, resetRequest, resetVerify }

/// Complete email/username/phone + password authentication panel:
/// login tab, sign-up tab, and a two-step "forgot password" flow that texts
/// an SMS code to the account's phone number. Fully bilingual.
class PasswordAuthForm extends ConsumerStatefulWidget {
  const PasswordAuthForm({super.key});

  @override
  ConsumerState<PasswordAuthForm> createState() => _PasswordAuthFormState();
}

class _PasswordAuthFormState extends ConsumerState<PasswordAuthForm> {
  final _formKey = GlobalKey<FormState>();
  final _identifierController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _usernameController = TextEditingController();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  final _newPasswordController = TextEditingController();

  _AuthMode _mode = _AuthMode.login;
  String? _devCode;

  @override
  void dispose() {
    _identifierController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _usernameController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    _codeController.dispose();
    _newPasswordController.dispose();
    super.dispose();
  }

  void _feedback() => ref.read(feedbackServiceProvider.notifier).tap();

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    _feedback();
    final ok = await ref.read(authNotifierProvider.notifier).loginWithIdentifier(
          identifier: _identifierController.text.trim(),
          password: _passwordController.text,
        );
    if (ok && mounted) ref.read(feedbackServiceProvider.notifier).success();
  }

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;
    _feedback();
    final ok = await ref.read(authNotifierProvider.notifier).registerWithEmail(
          email: _emailController.text.trim(),
          password: _passwordController.text,
          username: _usernameController.text.trim(),
          displayName: _nameController.text.trim().isEmpty
              ? _usernameController.text.trim()
              : _nameController.text.trim(),
        );
    if (ok && mounted) ref.read(feedbackServiceProvider.notifier).success();
  }

  Future<void> _sendResetCode() async {
    final phone = _phoneController.text.trim();
    if (!RegExp(r'^\+?\d{8,15}$').hasMatch(phone.replaceAll(RegExp(r'[\s-]'), ''))) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.l10n.t('phone_hint'))),
      );
      return;
    }
    _feedback();
    final normalized = phone.startsWith('+') ? phone : '+$phone';
    final devCode = await ref.read(authNotifierProvider.notifier).requestPasswordReset(phone: normalized);
    if (!mounted) return;
    if (devCode != null) setState(() => _devCode = devCode);
    setState(() => _mode = _AuthMode.resetVerify);
  }

  Future<void> _resetPassword() async {
    if (!_formKey.currentState!.validate()) return;
    _feedback();
    final ok = await ref.read(authNotifierProvider.notifier).resetPassword(
          code: _codeController.text.trim(),
          newPassword: _newPasswordController.text,
        );
    if (ok && mounted) ref.read(feedbackServiceProvider.notifier).success();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isLoading = ref.watch(authNotifierProvider.select((s) => s.isLoading));

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_mode == _AuthMode.login || _mode == _AuthMode.register) _tabSwitcher(l10n),
          const SizedBox(height: 16),
          ..._fieldsForMode(l10n),
          const SizedBox(height: 18),
          if (_mode == _AuthMode.login)
            GradientButton(label: l10n.t('login'), isLoading: isLoading, onPressed: _login)
          else if (_mode == _AuthMode.register)
            GradientButton(label: l10n.t('register'), isLoading: isLoading, onPressed: _register)
          else if (_mode == _AuthMode.resetRequest)
            GradientButton(label: l10n.t('send_code'), isLoading: isLoading, onPressed: _sendResetCode)
          else
            GradientButton(label: l10n.t('verify'), isLoading: isLoading, onPressed: _resetPassword),
          const SizedBox(height: 8),
          _footerLinks(l10n),
        ],
      ),
    );
  }

  Widget _tabSwitcher(L10n l10n) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.glassFill,
        borderRadius: BorderRadius.circular(14),
      ),
      padding: const EdgeInsets.all(4),
      child: Row(children: [
        _tab(l10n.t('login'), _mode == _AuthMode.login, () => setState(() => _mode = _AuthMode.login)),
        _tab(l10n.t('register'), _mode == _AuthMode.register, () => setState(() => _mode = _AuthMode.register)),
      ]),
    );
  }

  Widget _tab(String label, bool active, VoidCallback onTap) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 11),
          decoration: BoxDecoration(
            gradient: active ? AppColors.brandGradient : null,
            borderRadius: BorderRadius.circular(11),
          ),
          alignment: Alignment.center,
          child: Text(label,
              style: TextStyle(
                color: active ? Colors.white : AppColors.textSecondary,
                fontWeight: FontWeight.w800,
                fontSize: 14,
              )),
        ),
      ),
    );
  }

  List<Widget> _fieldsForMode(L10n l10n) {
    switch (_mode) {
      case _AuthMode.login:
        return [
          _field(
            controller: _identifierController,
            hint: l10n.t('email_username_phone'),
            icon: Icons.person_outline_rounded,
          ),
          const SizedBox(height: 12),
          _field(
            controller: _passwordController,
            hint: l10n.t('password'),
            icon: Icons.lock_outline_rounded,
            obscure: true,
          ),
        ];
      case _AuthMode.register:
        return [
          _field(
            controller: _nameController,
            hint: l10n.t('display_name'),
            icon: Icons.badge_outlined,
          ),
          const SizedBox(height: 12),
          _field(
            controller: _usernameController,
            hint: l10n.t('username'),
            icon: Icons.alternate_email,
            validator: (v) =>
                (v ?? '').trim().length < 3 ? l10n.t('username_rules') : null,
          ),
          const SizedBox(height: 12),
          _field(
            controller: _emailController,
            hint: l10n.t('email'),
            icon: Icons.alternate_email_rounded,
            keyboardType: TextInputType.emailAddress,
            validator: (v) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch((v ?? '').trim())
                ? null
                : l10n.t('invalid_email'),
          ),
          const SizedBox(height: 12),
          _field(
            controller: _passwordController,
            hint: l10n.t('password'),
            icon: Icons.lock_outline_rounded,
            obscure: true,
            validator: (v) => (v ?? '').length < 8 ? l10n.t('password_rules') : null,
          ),
        ];
      case _AuthMode.resetRequest:
        return [
          _Title(text: l10n.t('forgot_password_title'), icon: Icons.lock_reset_rounded),
          const SizedBox(height: 10),
          Text(l10n.t('forgot_password_hint'),
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.5)),
          const SizedBox(height: 14),
          _field(
            controller: _phoneController,
            hint: l10n.t('phone'),
            icon: Icons.sms_outlined,
            keyboardType: TextInputType.phone,
          ),
        ];
      case _AuthMode.resetVerify:
        return [
          _Title(text: l10n.t('enter_code'), icon: Icons.sms_outlined),
          const SizedBox(height: 10),
          if (_devCode != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text('${l10n.t('dev_code_hint')}: $_devCode',
                  style: const TextStyle(color: AppColors.softCyan, fontSize: 13, fontWeight: FontWeight.w700)),
            ),
          _field(
            controller: _codeController,
            hint: '••••',
            icon: Icons.pin_outlined,
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 12),
          _field(
            controller: _newPasswordController,
            hint: l10n.t('new_password'),
            icon: Icons.lock_outline_rounded,
            obscure: true,
            validator: (v) => (v ?? '').length < 8 ? l10n.t('password_rules') : null,
          ),
        ];
    }
  }

  Widget _footerLinks(L10n l10n) {
    final links = <Widget>[];
    if (_mode == _AuthMode.login) {
      links.add(_link(l10n.t('forgot_password'), () => setState(() => _mode = _AuthMode.resetRequest)));
      links.add(_link(l10n.t('no_account'), () => setState(() => _mode = _AuthMode.register)));
    } else if (_mode == _AuthMode.register) {
      links.add(_link(l10n.t('have_account'), () => setState(() => _mode = _AuthMode.login)));
    } else {
      links.add(_link(l10n.t('cancel'), () => setState(() => _mode = _AuthMode.login)));
    }
    return Column(children: links);
  }

  Widget _link(String text, VoidCallback onTap) {
    return TextButton(
      onPressed: () {
        _feedback();
        onTap();
      },
      child: Text(text, style: const TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.w700)),
    );
  }

  Widget _field({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    bool obscure = false,
    TextInputType? keyboardType,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      autocorrect: false,
      style: const TextStyle(color: AppColors.textPrimary),
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: Icon(icon, color: AppColors.textSecondary),
      ),
      validator: validator,
    );
  }
}

class _Title extends StatelessWidget {
  const _Title({required this.text, required this.icon});

  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: AppColors.softCyan, size: 22),
        const SizedBox(width: 10),
        Expanded(
          child: Text(text,
              style: const TextStyle(color: AppColors.textPrimary, fontSize: 17, fontWeight: FontWeight.w800)),
        ),
      ],
    );
  }
}
