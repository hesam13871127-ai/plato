import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../data/admin_remote_data_source.dart';

/// User management: search, ban/unban, suspend, change role, grant currency.
class AdminUsersTab extends ConsumerStatefulWidget {
  const AdminUsersTab({super.key});

  @override
  ConsumerState<AdminUsersTab> createState() => _AdminUsersTabState();
}

class _AdminUsersTabState extends ConsumerState<AdminUsersTab> {
  final TextEditingController _search = TextEditingController();
  List<AdminUser> _users = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  AdminRemoteDataSource get _ds => ref.read(adminRemoteDataSourceProvider);

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final users = await _ds.users(search: _search.text.trim());
      if (!mounted) return;
      setState(() => _users = users);
    } on DioException catch (e) {
      _toast(e, 'Could not load users.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(DioException e, String fallback) {
    final msg = (e.response?.data is Map && (e.response!.data as Map)['message'] != null)
        ? (e.response!.data as Map)['message'].toString()
        : fallback;
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: AppColors.danger));
    }
  }

  Future<void> _confirmAction(String title, String message, Future<void> Function() run) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surfaceElevated,
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Confirm', style: TextStyle(color: AppColors.danger))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await run();
      await _load();
    } on DioException catch (e) {
      _toast(e, 'Action failed.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            controller: _search,
            style: const TextStyle(color: AppColors.textPrimary),
            onSubmitted: (_) => _load(),
            decoration: InputDecoration(
              hintText: 'Search by name, email or phone',
              hintStyle: const TextStyle(color: AppColors.textMuted),
              prefixIcon: const Icon(Icons.search, color: AppColors.textSecondary),
              suffixIcon: IconButton(
                icon: const Icon(Icons.arrow_forward_rounded, color: AppColors.softCyan),
                onPressed: _load,
              ),
              filled: true,
              fillColor: AppColors.glassFill,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.glassStroke)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.glassStroke)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.softCyan)),
            ),
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: AppColors.softCyan))
              : RefreshIndicator(
                  onRefresh: _load,
                  color: AppColors.softCyan,
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                    itemCount: _users.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, i) => _UserCard(
                      user: _users[i],
                      onSuspend: () => _confirmAction('Suspend user?', 'This blocks their login.', () => _ds.setUserStatus(_users[i].id, 'suspended')),
                      onActivate: () => _confirmAction('Reactivate user?', 'Restore their access.', () => _ds.setUserStatus(_users[i].id, 'active')),
                      onBan: () => _confirmAction('Ban from chat?', 'Mute this account for 24 hours.', () => _ds.banUser(userId: _users[i].id, type: 'chat', durationMinutes: 24 * 60, reason: 'admin moderation')),
                      onLift: () => _confirmAction('Lift all bans?', 'Remove all active restrictions.', () => _ds.liftBan(_users[i].id)),
                      onGrant: () => _grantDialog(_users[i]),
                      onToggleRole: () => _confirmAction(
                        _users[i].role == 'admin' ? 'Revoke admin?' : 'Make admin?',
                        _users[i].role == 'admin' ? 'Restore the player role.' : 'Grant full admin privileges.',
                        () => _ds.setUserRole(_users[i].id, _users[i].role == 'admin' ? 'player' : 'admin'),
                      ),
                    ),
                  ),
                ),
        ),
      ],
    );
  }

  Future<void> _grantDialog(AdminUser user) async {
    final amount = TextEditingController();
    String currency = 'coins';
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (context, setDialog) => AlertDialog(
          backgroundColor: AppColors.surfaceElevated,
          title: Text('Grant / deduct — ${user.displayName}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: amount,
                keyboardType: const TextInputType.numberWithOptions(signed: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'-?[0-9]*'))],
                style: const TextStyle(color: AppColors.textPrimary),
                decoration: const InputDecoration(
                  hintText: 'Amount (negative to deduct)',
                  hintStyle: TextStyle(color: AppColors.textMuted),
                ),
              ),
              const SizedBox(height: 12),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'coins', label: Text('Coins')),
                  ButtonSegment(value: 'pips', label: Text('Pips')),
                ],
                selected: {currency},
                onSelectionChanged: (s) => setDialog(() => currency = s.first),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.electricPurple),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Apply'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;
    final value = int.tryParse(amount.text.trim());
    if (value == null || value == 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a non-zero amount.')));
      return;
    }
    try {
      await _ds.grantCurrency(userId: user.id, currency: currency, amount: value, reason: 'admin panel');
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Wallet updated.'), backgroundColor: AppColors.success));
      }
    } on DioException catch (e) {
      _toast(e, 'Could not adjust wallet.');
    }
  }
}

class _UserCard extends StatelessWidget {
  const _UserCard({
    required this.user,
    required this.onSuspend,
    required this.onActivate,
    required this.onBan,
    required this.onLift,
    required this.onGrant,
    required this.onToggleRole,
  });

  final AdminUser user;
  final VoidCallback onSuspend;
  final VoidCallback onActivate;
  final VoidCallback onBan;
  final VoidCallback onLift;
  final VoidCallback onGrant;
  final VoidCallback onToggleRole;

  @override
  Widget build(BuildContext context) {
    final suspended = user.status == 'suspended' || user.status == 'banned';
    return GlassCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user.displayName.isNotEmpty ? user.displayName : user.username,
                      style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 15),
                    ),
                    Text(user.email ?? user.phone ?? user.id,
                        style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                  ],
                ),
              ),
              _Badge(text: user.role, color: user.role == 'admin' ? AppColors.electricPurple : AppColors.textMuted),
              const SizedBox(width: 6),
              _Badge(text: user.status, color: suspended ? AppColors.danger : AppColors.success),
            ],
          ),
          const SizedBox(height: 6),
          Text('${user.gamesPlayed} games · 🪙 ${user.coins} · 💎 ${user.pips}',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _ActionBtn(label: 'Coins', icon: Icons.payments_rounded, onTap: onGrant),
              _ActionBtn(
                label: suspended ? 'Reactivate' : 'Suspend',
                icon: suspended ? Icons.verified_user_rounded : Icons.block_rounded,
                color: suspended ? AppColors.success : AppColors.warning,
                onTap: suspended ? onActivate : onSuspend,
              ),
              _ActionBtn(label: 'Mute 24h', icon: Icons.mic_off_rounded, onTap: onBan),
              _ActionBtn(label: 'Lift bans', icon: Icons.gpp_good_rounded, color: AppColors.success, onTap: onLift),
              _ActionBtn(
                label: user.role == 'admin' ? 'Remove admin' : 'Make admin',
                icon: Icons.admin_panel_settings_rounded,
                color: AppColors.softCyan,
                onTap: onToggleRole,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(8)),
      child: Text(text, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }
}

class _ActionBtn extends StatelessWidget {
  const _ActionBtn({required this.label, required this.icon, required this.onTap, this.color});
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.textSecondary;
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(
        foregroundColor: c,
        side: BorderSide(color: c.withValues(alpha: 0.5)),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        minimumSize: const Size(0, 34),
      ),
      icon: Icon(icon, size: 16),
      label: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
      onPressed: onTap,
    );
  }
}
