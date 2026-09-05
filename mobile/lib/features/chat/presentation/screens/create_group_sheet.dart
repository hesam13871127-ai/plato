import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../../core/widgets/gradient_button.dart';
import '../providers/chat_providers.dart';
import 'chat_thread_screen.dart';

/// Bottom sheet to create a new group chat, optionally protected by a Chat Pass.
class CreateGroupSheet extends ConsumerStatefulWidget {
  const CreateGroupSheet({super.key});

  @override
  ConsumerState<CreateGroupSheet> createState() => _CreateGroupSheetState();
}

class _CreateGroupSheetState extends ConsumerState<CreateGroupSheet> {
  final _titleController = TextEditingController();
  final _passController = TextEditingController();
  bool _withPass = false;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _titleController.dispose();
    _passController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final title = _titleController.text.trim();
    if (title.length < 2) {
      setState(() => _error = 'Group name must be at least 2 characters.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });

    final result = await ref.read(chatRepositoryProvider).createGroup(
          title: title,
          accessPass: _withPass ? _passController.text.trim() : null,
        );

    if (!mounted) return;
    result.fold(
      (failure) => setState(() {
        _submitting = false;
        _error = failure.message;
      }),
      (chat) {
        Navigator.of(context).pop();
        ref.invalidate(conversationsProvider);
        Navigator.of(context).pushReplacement(MaterialPageRoute<void>(
          builder: (_) => ChatThreadScreen(
            chatId: chat.id,
            title: title,
            themeKey: chat.themeKey,
          ),
        ));
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: GlassCard(
        borderRadius: 24,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('New group chat',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 16),
            TextField(
              controller: _titleController,
              style: const TextStyle(color: AppColors.textPrimary),
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Group name',
                hintText: 'Weekend Rollers',
              ),
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              activeColor: AppColors.softCyan,
              title: const Text('Require a Chat Pass'),
              subtitle: const Text(
                'Members need the code to join.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
              ),
              value: _withPass,
              onChanged: (value) => setState(() => _withPass = value),
            ),
            if (_withPass)
              TextField(
                controller: _passController,
                style: const TextStyle(color: AppColors.textPrimary),
                decoration: const InputDecoration(
                  labelText: 'Pass code',
                  hintText: '3–32 letters/numbers',
                ),
              ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
            ],
            const SizedBox(height: 18),
            GradientButton(
              label: 'Create group',
              isLoading: _submitting,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

/// Prompts for a Chat Pass when joining a pass-gated chat (403).
Future<bool> showPassPrompt(BuildContext context, ValueChanged<String> onSubmit) async {
  final controller = TextEditingController();
  final accepted = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      backgroundColor: AppColors.surfaceElevated,
      title: const Text('Chat Pass required'),
      content: TextField(
        controller: controller,
        autofocus: true,
        style: const TextStyle(color: AppColors.textPrimary),
        decoration: const InputDecoration(hintText: 'Enter the pass code'),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text('Join', style: TextStyle(color: AppColors.softCyan)),
        ),
      ],
    ),
  );
  if (accepted == true && controller.text.trim().isNotEmpty) {
    onSubmit(controller.text.trim());
    return true;
  }
  return false;
}
