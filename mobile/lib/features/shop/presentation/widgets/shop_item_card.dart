import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../domain/entities/shop_item.dart';

/// A single catalogue tile with price, discount badge, buy/gift actions.
class ShopItemCard extends StatelessWidget {
  const ShopItemCard({
    super.key,
    required this.item,
    required this.walletCoins,
    required this.walletPips,
    required this.onBuy,
    this.onGift,
  });

  final ShopItem item;
  final int walletCoins;
  final int walletPips;
  final VoidCallback onBuy;
  final VoidCallback? onGift;

  Color get _rarityColor => switch (item.rarity) {
        'legendary' => const Color(0xFFFFC857),
        'epic' => AppColors.electricPurple,
        'rare' => AppColors.softCyan,
        _ => AppColors.textSecondary,
      };

  IconData get _icon => switch (item.type) {
        ShopItemType.avatarFrame => Icons.crop_portrait_rounded,
        ShopItemType.banner => Icons.image_rounded,
        ShopItemType.chatBubble => Icons.chat_bubble_rounded,
        ShopItemType.theme => Icons.palette_rounded,
        ShopItemType.gameSkin => Icons.sports_esports_rounded,
        ShopItemType.gamePiece => Icons.extension_rounded,
        ShopItemType.boardTheme => Icons.format_paint_rounded,
        ShopItemType.idColor => Icons.badge_rounded,
        ShopItemType.usernameChange => Icons.alternate_email_rounded,
        ShopItemType.diceSet => Icons.casino_rounded,
        ShopItemType.emote => Icons.emoji_emotions_rounded,
        ShopItemType.bundle => Icons.inventory_2_rounded,
        ShopItemType.consumable => Icons.redeem_rounded,
      };

  @override
  Widget build(BuildContext context) {
    final isCoins = item.currency == Currency.coins;
    final wallet = isCoins ? walletCoins : walletPips;
    final affordable = wallet >= item.effectivePrice;
    final priceColor = isCoins ? AppColors.softCyan : AppColors.electricPurple;
    final priceIcon = isCoins ? Icons.monetization_on_rounded : Icons.diamond_rounded;

    return GlassCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              Container(
                height: 76,
                width: double.infinity,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      _rarityColor.withValues(alpha: 0.28),
                      AppColors.glassFill,
                    ],
                  ),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(_icon, color: _rarityColor, size: 34),
              ),
              if (item.isDiscounted)
                Positioned(
                  left: 8,
                  top: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.danger,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text('-${item.discountPercent}%',
                        style: const TextStyle(
                            color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(item.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          Text(item.rarity.toUpperCase(),
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _rarityColor, letterSpacing: 0.8)),
          const Spacer(),
          if (item.equipped)
            const _OwnedLabel(label: 'Equipped', color: AppColors.softCyan, icon: Icons.check_circle_rounded)
          else if (item.owned)
            const _OwnedLabel(label: 'Owned', color: AppColors.textSecondary, icon: Icons.check_rounded)
          else ...[
            Row(
              children: [
                Icon(priceIcon, color: priceColor, size: 16),
                const SizedBox(width: 4),
                if (item.isDiscounted) ...[
                  Text('${item.price}',
                      style: const TextStyle(
                          decoration: TextDecoration.lineThrough,
                          color: AppColors.textMuted,
                          fontSize: 12)),
                  const SizedBox(width: 4),
                ],
                Text('${item.effectivePrice}',
                    style: TextStyle(
                        color: affordable ? AppColors.textPrimary : AppColors.danger,
                        fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _ActionButton(
                    label: item.type == ShopItemType.usernameChange ? 'Use' : 'Buy',
                    icon: Icons.shopping_bag_rounded,
                    enabled: affordable,
                    onTap: onBuy,
                  ),
                ),
                if (onGift != null) ...[
                  const SizedBox(width: 8),
                  _ActionButton(
                    label: 'Gift',
                    icon: Icons.card_giftcard_rounded,
                    enabled: affordable,
                    onTap: onGift!,
                    compact: true,
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _OwnedLabel extends StatelessWidget {
  const _OwnedLabel({required this.label, required this.color, required this.icon});
  final String label;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.glassFill,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.glassStroke),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.enabled,
    required this.onTap,
    this.compact = false,
  });

  final String label;
  final IconData icon;
  final bool enabled;
  final VoidCallback onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: enabled ? onTap : null,
          child: Container(
            padding: EdgeInsets.symmetric(vertical: 10, horizontal: compact ? 12 : 0),
            decoration: BoxDecoration(
              gradient: enabled ? AppColors.brandGradient : null,
              color: enabled ? null : AppColors.glassFill,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: enabled ? Colors.white : AppColors.textMuted, size: 15),
                const SizedBox(width: 6),
                Text(label,
                    style: TextStyle(
                        color: enabled ? Colors.white : AppColors.textMuted,
                        fontWeight: FontWeight.w800,
                        fontSize: 13)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
