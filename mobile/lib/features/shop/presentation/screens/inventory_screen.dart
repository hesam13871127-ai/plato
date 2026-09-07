import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../domain/entities/inventory_item.dart';
import '../../domain/entities/shop_item.dart';
import '../providers/shop_providers.dart';
import '../widgets/cosmetic_preview.dart';

/// The user's owned cosmetics, grouped by category, with equip/unequip.
class InventoryScreen extends ConsumerWidget {
  const InventoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inventoryAsync = ref.watch(inventoryProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My Inventory')),
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.navyGradient),
        child: inventoryAsync.when(
          loading: () => const Center(child: CircularProgressIndicator(color: AppColors.softCyan)),
          error: (error, _) => _Message(
            icon: Icons.inventory_2_outlined,
            message: '$error',
            onRetry: () => ref.invalidate(inventoryProvider),
          ),
          data: (inventory) {
            if (inventory.isEmpty) {
              return _Message(
                icon: Icons.checkroom_rounded,
                message: 'Your inventory is empty. Visit the shop to grab some cosmetics!',
                onRetry: () => ref.invalidate(inventoryProvider),
              );
            }
            final grouped = <ShopItemType, List<InventoryItem>>{};
            for (final item in inventory) {
              grouped.putIfAbsent(item.type, () => []).add(item);
            }
            final ordered = ShopItemType.values
                .where((t) => grouped.containsKey(t))
                .toList();

            return RefreshIndicator(
              color: AppColors.softCyan,
              onRefresh: () async => ref.invalidate(inventoryProvider),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20),
                children: [
                  for (final type in ordered) ...[
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Text(type.label,
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
                    ),
                    for (final item in grouped[type]!)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _InventoryTile(item: item),
                      ),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _InventoryTile extends ConsumerWidget {
  const _InventoryTile({required this.item});
  final InventoryItem item;

  IconData get _icon => switch (item.type) {
        ShopItemType.avatarFrame => Icons.crop_portrait_rounded,
        ShopItemType.banner => Icons.image_rounded,
        ShopItemType.chatBubble => Icons.chat_bubble_rounded,
        ShopItemType.theme => Icons.palette_rounded,
        ShopItemType.gameSkin => Icons.sports_esports_rounded,
        ShopItemType.gamePiece => Icons.circle_rounded,
        ShopItemType.boardTheme => Icons.grid_on_rounded,
        ShopItemType.idColor => Icons.badge_rounded,
        ShopItemType.usernameChange => Icons.alternate_email_rounded,
        ShopItemType.diceSet => Icons.casino_rounded,
        ShopItemType.emote => Icons.emoji_emotions_rounded,
        ShopItemType.bundle => Icons.inventory_2_rounded,
        ShopItemType.consumable => Icons.redeem_rounded,
      };

  bool get _isEquippable =>
      item.type == ShopItemType.avatarFrame ||
      item.type == ShopItemType.banner ||
      item.type == ShopItemType.chatBubble ||
      item.type == ShopItemType.theme ||
      item.type == ShopItemType.idColor ||
      item.type == ShopItemType.gamePiece ||
      item.type == ShopItemType.boardTheme ||
      item.type == ShopItemType.diceSet;

  bool get _hasPreview => CosmeticPreview.supports(item.type);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isToken = item.type == ShopItemType.usernameChange;

    return GlassCard(
      child: Row(
        children: [
          Container(
            width: _hasPreview ? 88 : 52,
            height: 52,
            decoration: BoxDecoration(
              gradient: _hasPreview ? null : AppColors.brandGradient,
              color: _hasPreview ? AppColors.glassFill : null,
              borderRadius: BorderRadius.circular(14),
              border: _hasPreview ? Border.all(color: AppColors.glassStroke) : null,
            ),
            child: _hasPreview
                ? Center(child: CosmeticPreview(type: item.type, metadata: item.metadata, compact: true))
                : Icon(_icon, color: Colors.white),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(item.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    ),
                    if (item.quantity > 1)
                      Text(' ×${item.quantity}',
                          style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                  ],
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Text(item.rarity.toUpperCase(),
                        style: const TextStyle(
                            fontSize: 10,
                            color: AppColors.textMuted,
                            letterSpacing: 0.8,
                            fontWeight: FontWeight.w700)),
                    if (item.source == InventorySource.gift) ...[
                      const SizedBox(width: 8),
                      const Icon(Icons.card_giftcard_rounded, size: 13, color: AppColors.electricPurple),
                      const Text(' gift',
                          style: TextStyle(fontSize: 11, color: AppColors.electricPurple)),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (item.isEquipped)
            _PillButton(
              label: 'Equipped',
              icon: Icons.check_circle_rounded,
              filled: false,
              onTap: () => _unequip(context, ref),
            )
          else if (_isEquippable)
            _PillButton(
              label: 'Equip',
              icon: Icons.upload_rounded,
              filled: true,
              onTap: () => _equip(context, ref),
            )
          else if (isToken)
            _PillButton(
              label: 'Use',
              icon: Icons.arrow_forward_rounded,
              filled: true,
              onTap: () => _changeUsername(context, ref),
            ),
        ],
      ),
    );
  }

  Future<void> _equip(BuildContext context, WidgetRef ref) async {
    final result = await ref.read(shopRepositoryProvider).equipItem(inventoryId: item.id);
    if (!context.mounted) return;
    result.fold(
      (failure) => _snack(context, failure.message, isError: true),
      (_) {
        _snack(context, '${item.name} equipped!');
        ref.invalidate(inventoryProvider);
        ref.read(authNotifierProvider.notifier).refreshUser();
      },
    );
  }

  Future<void> _unequip(BuildContext context, WidgetRef ref) async {
    final result = await ref.read(shopRepositoryProvider).unequipItem(inventoryId: item.id);
    if (!context.mounted) return;
    result.fold(
      (failure) => _snack(context, failure.message, isError: true),
      (_) {
        _snack(context, '${item.name} unequipped.');
        ref.invalidate(inventoryProvider);
        ref.read(authNotifierProvider.notifier).refreshUser();
      },
    );
  }

  Future<void> _changeUsername(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final newName = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.surfaceElevated,
        title: const Text('Change username', style: TextStyle(color: AppColors.textPrimary)),
        content: TextField(
          controller: controller,
          autofocus: true,
          autocorrect: false,
          style: const TextStyle(color: AppColors.textPrimary),
          decoration: InputDecoration(
            hintText: 'new_username',
            hintStyle: const TextStyle(color: AppColors.textMuted),
            enabledBorder: const UnderlineInputBorder(
              borderSide: BorderSide(color: AppColors.glassStroke),
            ),
            focusedBorder: const UnderlineInputBorder(
              borderSide: BorderSide(color: AppColors.softCyan),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel', style: TextStyle(color: AppColors.textSecondary)),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(controller.text.trim()),
            child: const Text('Confirm', style: TextStyle(color: AppColors.softCyan)),
          ),
        ],
      ),
    );
    controller.dispose();

    if (newName == null || newName.isEmpty) return;
    final result = await ref.read(shopRepositoryProvider).changeUsername(username: newName);
    if (!context.mounted) return;
    result.fold(
      (failure) => _snack(context, failure.message, isError: true),
      (_) {
        _snack(context, 'Username changed to @$newName!');
        ref.read(authNotifierProvider.notifier).refreshUser();
      },
    );
  }

  void _snack(BuildContext context, String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.danger : AppColors.surfaceElevated,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

class _PillButton extends StatelessWidget {
  const _PillButton({
    required this.label,
    required this.icon,
    required this.filled,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool filled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            gradient: filled ? AppColors.brandGradient : null,
            color: filled ? null : AppColors.glassFill,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: filled ? Colors.transparent : AppColors.glassStroke),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 15, color: filled ? Colors.white : AppColors.softCyan),
              const SizedBox(width: 6),
              Text(label,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: filled ? Colors.white : AppColors.softCyan)),
            ],
          ),
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.message, required this.onRetry});

  final IconData icon;
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: AppColors.softCyan,
      onRefresh: () async => onRetry(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: 140),
          Icon(icon, color: AppColors.textMuted, size: 52),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 48),
            child: Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 15)),
          ),
        ],
      ),
    );
  }
}
