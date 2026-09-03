import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../../core/widgets/gradient_button.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../domain/entities/shop_item.dart';
import '../providers/shop_providers.dart';

/// Bottom sheet for gifting an item to another player by username.
class GiftSheet extends ConsumerStatefulWidget {
  const GiftSheet({super.key, required this.item});

  final ShopItem item;

  @override
  ConsumerState<GiftSheet> createState() => _GiftSheetState();
}

class _GiftSheetState extends ConsumerState<GiftSheet> {
  final _usernameController = TextEditingController();
  final _messageController = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _usernameController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final username = _usernameController.text.trim().replaceAll('@', '');
    if (username.isEmpty) {
      _snack('Enter the recipient’s username.', isError: true);
      return;
    }
    setState(() => _sending = true);
    final result = await ref.read(shopRepositoryProvider).giftItem(
          itemId: widget.item.id,
          recipientUsername: username,
          message: _messageController.text.trim().isEmpty ? null : _messageController.text.trim(),
        );
    if (!mounted) return;
    setState(() => _sending = false);
    result.fold(
      (failure) => _snack(failure.message, isError: true),
      (_) {
        _snack('${widget.item.name} gifted to @$username!');
        ref.read(authNotifierProvider.notifier).refreshUser();
        ref.invalidate(shopItemsProvider(null));
        Navigator.of(context).pop(true);
      },
    );
  }

  void _snack(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.danger : AppColors.surfaceElevated,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final isCoins = item.currency == Currency.coins;
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: viewInsets),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.surfaceDark,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(top: BorderSide(color: AppColors.glassStroke)),
        ),
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 44,
                height: 5,
                decoration: BoxDecoration(
                  color: AppColors.glassStroke,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                const Icon(Icons.card_giftcard_rounded, color: AppColors.softCyan, size: 28),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Gift an item',
                          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                      Text('Send ${item.name} to a friend',
                          style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            GlassCard(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Icon(
                    isCoins ? Icons.monetization_on_rounded : Icons.diamond_rounded,
                    color: isCoins ? AppColors.softCyan : AppColors.electricPurple,
                  ),
                  const SizedBox(width: 8),
                  Text('Price: ${item.effectivePrice}',
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  const Spacer(),
                  Text(isCoins ? 'coins' : 'pips',
                      style: const TextStyle(color: AppColors.textSecondary)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            const Text('Recipient username',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
            const SizedBox(height: 8),
            TextField(
              controller: _usernameController,
              textInputAction: TextInputAction.next,
              autocorrect: false,
              style: const TextStyle(color: AppColors.textPrimary),
              decoration: _decoration('@username', Icons.alternate_email_rounded),
            ),
            const SizedBox(height: 14),
            const Text('Message (optional)',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
            const SizedBox(height: 8),
            TextField(
              controller: _messageController,
              maxLength: 200,
              style: const TextStyle(color: AppColors.textPrimary),
              decoration: _decoration('Say something nice…', Icons.edit_rounded),
            ),
            const SizedBox(height: 8),
            GradientButton(
              label: _sending ? 'Sending…' : 'Send gift',
              icon: Icons.send_rounded,
              isLoading: _sending,
              onPressed: _send,
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  InputDecoration _decoration(String hint, IconData icon) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: AppColors.textMuted),
      prefixIcon: Icon(icon, color: AppColors.textSecondary),
      filled: true,
      fillColor: AppColors.glassFill,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.glassStroke),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.softCyan),
      ),
    );
  }
}
