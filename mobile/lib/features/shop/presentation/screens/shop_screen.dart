import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/wallet_chip.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../../quests/presentation/providers/quests_providers.dart';
import '../../domain/entities/shop_item.dart';
import '../providers/shop_providers.dart';
import '../widgets/gift_sheet.dart';
import '../widgets/shop_item_card.dart';

/// Cosmetic shop with category filters. Strictly cosmetic — nothing here
/// affects gameplay (no pay-to-win).
class ShopScreen extends ConsumerStatefulWidget {
  const ShopScreen({super.key});

  @override
  ConsumerState<ShopScreen> createState() => _ShopScreenState();
}

class _ShopScreenState extends ConsumerState<ShopScreen> {
  ShopItemType? _filter;

  static const _categories = <ShopItemType?>[
    null, // All
    ShopItemType.avatarFrame,
    ShopItemType.banner,
    ShopItemType.chatBubble,
    ShopItemType.theme,
    ShopItemType.gameSkin,
    ShopItemType.idColor,
    ShopItemType.usernameChange,
    ShopItemType.diceSet,
    ShopItemType.emote,
  ];

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authNotifierProvider.select((s) => s.user));
    final itemsAsync = ref.watch(shopItemsProvider(_filter));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Shop'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(child: WalletChip(coins: user.coins, pips: user.pips, compact: true)),
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.navyGradient),
        child: Column(
          children: [
            SizedBox(
              height: 48,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  for (final category in _categories)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _CategoryChip(
                        label: category == null ? 'All' : category.label,
                        selected: _filter == category,
                        onTap: () => setState(() => _filter = category),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: itemsAsync.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator(color: AppColors.softCyan)),
                error: (error, _) => RefreshIndicator(
                  color: AppColors.softCyan,
                  onRefresh: () async => ref.invalidate(shopItemsProvider(_filter)),
                  child: ListView(
                    children: [
                      const SizedBox(height: 120),
                      Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 40),
                          child: Text('$error',
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: AppColors.textSecondary)),
                        ),
                      ),
                    ],
                  ),
                ),
                data: (items) {
                  if (items.isEmpty) {
                    return const Center(
                      child: Text('No items in this category yet.',
                          style: TextStyle(color: AppColors.textSecondary)),
                    );
                  }
                  return RefreshIndicator(
                    color: AppColors.softCyan,
                    onRefresh: () async => ref.invalidate(shopItemsProvider(_filter)),
                    child: GridView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(16),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        mainAxisSpacing: 14,
                        crossAxisSpacing: 14,
                        childAspectRatio: 0.78,
                      ),
                      itemCount: items.length,
                      itemBuilder: (context, index) {
                        final item = items[index];
                        return ShopItemCard(
                          item: item,
                          walletCoins: user.coins,
                          walletPips: user.pips,
                          onBuy: () => _purchase(item),
                          onGift: item.giftable ? () => _openGift(item) : null,
                        );
                      },
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _purchase(ShopItem item) async {
    final result = await ref.read(shopRepositoryProvider).purchaseItem(itemId: item.id);
    if (!mounted) return;
    result.fold(
      (failure) => _snack(failure.message, isError: true),
      (_) {
        _snack('${item.name} added to your inventory!');
        ref.invalidate(shopItemsProvider(_filter));
        ref.invalidate(inventoryProvider);
        ref.read(authNotifierProvider.notifier).refreshUser();
      },
    );
  }

  Future<void> _openGift(ShopItem item) async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => GiftSheet(item: item),
    );
    if (sent == true) {
      ref.read(authNotifierProvider.notifier).refreshUser();
      refreshDailyPanel(ref);
    }
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
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        decoration: BoxDecoration(
          gradient: selected ? AppColors.brandGradient : null,
          color: selected ? null : AppColors.glassFill,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? Colors.transparent : AppColors.glassStroke),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : AppColors.textSecondary,
            fontWeight: FontWeight.w700,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}
