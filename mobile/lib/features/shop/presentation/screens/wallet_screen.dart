import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../../core/widgets/wallet_chip.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../domain/entities/shop_item.dart';
import '../../domain/entities/wallet_transaction.dart';
import '../providers/shop_providers.dart';

/// Wallet overview (coins + pips) with the append-only transaction ledger.
class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authNotifierProvider.select((s) => s.user));
    final transactionsAsync = ref.watch(transactionsProvider(1));

    return Scaffold(
      appBar: AppBar(title: const Text('Wallet')),
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.navyGradient),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            GlassCard(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0x557B5CFF), Color(0x2200E5FF)],
              ),
              child: Column(
                children: [
                  const Text('Current balance',
                      style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                  const SizedBox(height: 12),
                  Center(child: WalletChip(coins: user.coins, pips: user.pips)),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.local_fire_department_rounded, color: AppColors.warning, size: 18),
                      const SizedBox(width: 6),
                      Text('${user.streakDays}-day streak',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const Text('Transaction history',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
            const SizedBox(height: 12),
            transactionsAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator(color: AppColors.softCyan)),
              ),
              error: (error, _) => GlassCard(
                child: Text('$error', style: const TextStyle(color: AppColors.textSecondary)),
              ),
              data: (txs) {
                if (txs.isEmpty) {
                  return const GlassCard(
                    child: Row(
                      children: [
                        Icon(Icons.receipt_long_rounded, color: AppColors.textMuted),
                        SizedBox(width: 12),
                        Text('No transactions yet.',
                            style: TextStyle(color: AppColors.textSecondary)),
                      ],
                    ),
                  );
                }
                return Column(
                  children: [
                    for (final tx in txs) ...[
                      _TransactionTile(tx: tx),
                      const SizedBox(height: 10),
                    ],
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({required this.tx});
  final WalletTransaction tx;

  IconData get _icon => switch (tx.type) {
        'purchase' => Icons.shopping_bag_rounded,
        'gift_purchase' => Icons.card_giftcard_rounded,
        'gift' => Icons.redeem_rounded,
        'daily_reward' => Icons.calendar_month_rounded,
        'quest_reward' => Icons.task_alt_rounded,
        _ => Icons.swap_horiz_rounded,
      };

  String get _label => switch (tx.type) {
        'purchase' => 'Purchase',
        'gift_purchase' => 'Gift sent',
        'gift' => 'Gift received',
        'daily_reward' => 'Daily reward',
        'quest_reward' => 'Quest reward',
        _ => tx.type.replaceAll('_', ' '),
      };

  @override
  Widget build(BuildContext context) {
    final isCoins = tx.currency == Currency.coins;
    final currencyColor = isCoins ? AppColors.softCyan : AppColors.electricPurple;
    final currencyIcon = isCoins ? Icons.monetization_on_rounded : Icons.diamond_rounded;
    final sign = tx.isCredit ? '+' : '';

    return GlassCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: AppColors.glassFill,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(_icon, color: currencyColor, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                if (tx.description != null)
                  Text(tx.description!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Row(
            children: [
              Icon(currencyIcon,
                  size: 15, color: tx.isCredit ? AppColors.success : AppColors.danger),
              const SizedBox(width: 4),
              Text('$sign${tx.amount}',
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: tx.isCredit ? AppColors.success : AppColors.danger)),
            ],
          ),
        ],
      ),
    );
  }
}
