import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../data/admin_remote_data_source.dart';

/// Analytics overview: platform KPIs and the most-played games.
class AdminOverviewTab extends ConsumerStatefulWidget {
  const AdminOverviewTab({super.key});

  @override
  ConsumerState<AdminOverviewTab> createState() => _AdminOverviewTabState();
}

class _AdminOverviewTabState extends ConsumerState<AdminOverviewTab> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  AdminOverview? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ref.read(adminRemoteDataSourceProvider).overview();
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } on DioException catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load analytics.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.softCyan));
    }
    if (_error != null || _data == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error ?? 'No data.', style: const TextStyle(color: AppColors.textSecondary)),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }
    final d = _data!;
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.softCyan,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              _StatCard(label: 'Total users', value: d.totalUsers.toString(), icon: Icons.people_alt_rounded),
              _StatCard(label: 'Active (7d)', value: d.activeUsers.toString(), icon: Icons.bolt_rounded),
              _StatCard(label: 'Active games', value: d.activeGames.toString(), icon: Icons.sports_esports_rounded),
              _StatCard(label: 'Matches total', value: d.matchesTotal.toString(), icon: Icons.emoji_events_rounded),
              _StatCard(label: 'Matches today', value: d.matchesToday.toString(), icon: Icons.today_rounded),
              _StatCard(label: 'Open reports', value: d.openReports.toString(), icon: Icons.flag_rounded, warning: d.openReports > 0),
              _StatCard(label: 'Coins circulating', value: _compact(d.coinsInCirculation), icon: Icons.monetization_on_rounded),
              _StatCard(label: 'Pips circulating', value: _compact(d.pipsInCirculation), icon: Icons.diamond_rounded),
            ],
          ),
          const SizedBox(height: 20),
          const Text('Top games',
              style: TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          GlassCard(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                for (final game in d.topGames) ...[
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.videogame_asset_rounded, color: AppColors.softCyan),
                    title: Text((game['name'] ?? game['slug']).toString(),
                        style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700)),
                    trailing: Text('${game['plays']} plays',
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                  ),
                  if (game != d.topGames.last) const Divider(height: 1, color: AppColors.glassStroke),
                ],
                if (d.topGames.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('No matches played yet.', style: TextStyle(color: AppColors.textMuted)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _compact(int v) {
    if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}K';
    return v.toString();
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, required this.icon, this.warning = false});

  final String label;
  final String value;
  final IconData icon;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    final color = warning ? AppColors.danger : AppColors.softCyan;
    return SizedBox(
      width: (MediaQuery.sizeOf(context).width - 44) / 2,
      child: GlassCard(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(height: 8),
            Text(value, style: TextStyle(color: color, fontSize: 22, fontWeight: FontWeight.w900)),
            const SizedBox(height: 2),
            Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
