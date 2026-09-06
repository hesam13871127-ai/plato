import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../data/admin_remote_data_source.dart';

/// Season management: list recent seasons and force a season rollover
/// (snapshot ranks → grant tier/game rewards → start the next season).
class AdminSeasonsTab extends ConsumerStatefulWidget {
  const AdminSeasonsTab({super.key});

  @override
  ConsumerState<AdminSeasonsTab> createState() => _AdminSeasonsTabState();
}

class _AdminSeasonsTabState extends ConsumerState<AdminSeasonsTab> {
  List<Map<String, dynamic>> _seasons = [];
  bool _loading = true;
  bool _rolling = false;

  AdminRemoteDataSource get _ds => ref.read(adminRemoteDataSourceProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      _seasons = await _ds.seasons();
    } on DioException catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not load seasons.'), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _rollover() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surfaceElevated,
        title: const Text('Roll over the season now?'),
        content: const Text(
          'This closes the active season, snapshots ranks, grants tier and '
          'game rewards to all players, and starts the next season. This '
          'cannot be undone.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Roll over', style: TextStyle(color: AppColors.warning)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _rolling = true);
    try {
      await _ds.rolloverSeason();
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Season rolled over. Rewards granted.'), backgroundColor: AppColors.success),
        );
      }
    } on DioException catch (e) {
      final msg = (e.response?.data is Map && (e.response!.data as Map)['message'] != null)
          ? (e.response!.data as Map)['message'].toString()
          : 'Rollover failed.';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _rolling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.warning,
        icon: _rolling
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
            : const Icon(Icons.fast_forward_rounded, color: Colors.black),
        label: const Text('Roll over season', style: TextStyle(color: Colors.black, fontWeight: FontWeight.w800)),
        onPressed: _rolling ? null : _rollover,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.softCyan))
          : RefreshIndicator(
              onRefresh: _load,
              color: AppColors.softCyan,
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
                itemCount: _seasons.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final s = _seasons[i];
                  final status = s['status']?.toString() ?? 'unknown';
                  final color = switch (status) {
                    'active' => AppColors.success,
                    'upcoming' => AppColors.softCyan,
                    _ => AppColors.textMuted,
                  };
                  return GlassCard(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${s['name'] ?? 'Season'} (#${s['seasonNumber'] ?? '?'})',
                                  style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800)),
                              const SizedBox(height: 2),
                              Text(
                                '${_date(s['startsAt'])} → ${_date(s['endsAt'])}',
                                style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(color: color.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(8)),
                          child: Text(status, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800)),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
    );
  }

  String _date(dynamic v) {
    final d = DateTime.tryParse(v?.toString() ?? '');
    if (d == null) return '—';
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }
}
