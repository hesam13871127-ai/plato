import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/gradient_button.dart';
import '../providers/auth_notifier.dart';

/// Email/password sign-in with a register/login mode toggle.
class EmailAuthForm extends ConsumerStatefulWidget {
  @override
  ConsumerState<EmailAuthForm> createState() => _EmailAuthFormState();
}

class _EmailAuthFormState extends ConsumerState<EmailAuthForm> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _usernameController = TextEditingController();
  final _nameController = TextEditingController();
  bool _isRegister = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _usernameController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final notifier = ref.read(authNotifierProvider.notifier);
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (_isRegister) {
      await notifier.registerWithEmail(
        email: email,
        password: password,
        username: _usernameController.text.trim(),
        displayName: _nameController.text.trim().isEmpty
            ? _usernameController.text.trim()
            : _nameController.text.trim(),
      );
    } else {
      await notifier.loginWithEmail(email: email, password: password);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = ref.watch(authNotifierProvider.select((s) => s.isLoading));

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            decoration: const InputDecoration(
              hintText: 'Email address',
              prefixIcon: Icon(Icons.alternate_email_rounded),
            ),
            validator: (value) {
              final v = (value ?? '').trim();
              if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v)) {
                return 'Enter a valid email address.';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _passwordController,
            obscureText: true,
            decoration: const InputDecoration(
              hintText: 'Password',
              prefixIcon: Icon(Icons.lock_outline_rounded),
            ),
            validator: (value) {
              if ((value ?? '').length < 8) return 'Password must be at least 8 characters.';
              return null;
            },
          ),
          if (_isRegister) ...[
            const SizedBox(height: 12),
            TextFormField(
              controller: _usernameController,
              decoration: const InputDecoration(
                hintText: 'Username (unique)',
                prefixIcon: Icon(Icons.alternate_email),
              ),
              validator: (value) {
                if ((value ?? '').trim().length < 3) return 'Username must be at least 3 characters.';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _nameController,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                hintText: 'Display name',
                prefixIcon: Icon(Icons.badge_outlined),
              ),
            ),
          ],
          const SizedBox(height: 18),
          GradientButton(
            label: _isRegister ? 'Create account' : 'Sign in',
            isLoading: isLoading,
            onPressed: _submit,
          ),
          const SizedBox(height: 4),
          TextButton(
            onPressed: () => setState(() => _isRegister = !_isRegister),
            child: Text(
              _isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register",
              style: const TextStyle(color: AppColors.softCyan),
            ),
          ),
        ],
      ),
    );
  }
}
