import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../data/moderation_remote_data_source.dart';

/// Moderator/admin dashboard: report queue with one-tap enforcement. Access is
/// enforced by the backend role guard; this screen only loads for callers
/// whose role is moderator/admin.
class ModerationDashboardScreen extends ConsumerStatefulWidget {
  const ModerationDashboardScreen({super.key});

  @override
  ConsumerState<ModerationDashboardScreen> createState() => _ModerationDashboardScreenState();
}

class _ModerationDashboardScreenState extends ConsumerState<ModerationDashboardScreen> {
  bool _loading = true;
  bool _denied = false;
  String? _error;
  List<ModerationReport> _reports = [];
  String _filter = 'open';

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
      final ds = ref.read(moderationRemoteDataSourceProvider);
      final role = await ds.myRole();
      if (role != 'moderator' && role != 'admin') {
        setState(() {
          _denied = true;
          _loading = false;
        });
        return;
      }
      final reports = await ds.fetchReports(status: _filter == 'all' ? null : _filter);
      if (!mounted) return;
      setState(() {
        _reports = reports;
        _denied = false;
        _loading = false;
      });
    } on DioException catch (e) {
      if (e.response?.statusCode == 403) {
        setState(() {
          _denied = true;
          _loading = false;
        });
      } else {
        setState(() {
          _error = 'Could not load the moderation queue.';
          _loading = false;
        });
      }
    }
  }

  Future<void> _resolve(ModerationReport report, String action, {int? minutes}) async {
    try {
      await ref.read(moderationRemoteDataSourceProvider).resolveReport(
            reportId: report.id,
            action: action,
            durationMinutes: minutes,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Report ${action == 'dismiss' ? 'dismissed' : 'actioned'}.'), backgroundColor: AppColors.success),
      );
      await _load();
    } on DioException catch (e) {
      if (!mounted) return;
      final msg = (e.response?.data is Map && (e.response!.data as Map)['message'] != null)
          ? (e.response!.data as Map)['message'].toString()
          : 'Action failed.';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: AppColors.danger));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Moderation'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: AppColors.softCyan),
            onPressed: _load,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.navyGradient),
        child: _denied
            ? const _Denied()
            : _loading
                ? const Center(child: CircularProgressIndicator(color: AppColors.softCyan))
                : _error != null
                    ? _ErrorView(message: _error!, onRetry: _load)
                    : RefreshIndicator(
                        onRefresh: _load,
                        color: AppColors.softCyan,
                        child: ListView(
                          padding: const EdgeInsets.all(16),
                          children: [
                            _FilterBar(
                              current: _filter,
                              onChanged: (f) {
                                setState(() => _filter = f);
                                _load();
                              },
                            ),
                            const SizedBox(height: 12),
                            if (_reports.isEmpty)
                              const Padding(
                                padding: EdgeInsets.only(top: 60),
                                child: Center(
                                  child: Text('No reports in this view.',
                                      style: TextStyle(color: AppColors.textSecondary)),
                                ),
                              ),
                            for (final report in _reports) ...[
                              _ReportCard(
                                report: report,
                                onAction: (action, minutes) => _resolve(report, action, minutes: minutes),
                              ),
                              const SizedBox(height: 10),
                            ],
                          ],
                        ),
                      ),
      ),
    );
  }
}

class _FilterBar extends StatelessWidget {
  const _FilterBar({required this.current, required this.onChanged});
  final String current;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    const filters = [
      ('open', 'Open'),
      ('reviewing', 'Reviewing'),
      ('resolved', 'Resolved'),
      ('dismissed', 'Dismissed'),
      ('all', 'All'),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final (value, label) in filters)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(label),
                selected: current == value,
                selectedColor: AppColors.electricPurple.withValues(alpha: 0.4),
                backgroundColor: AppColors.glassFill,
                labelStyle: TextStyle(
                  color: current == value ? AppColors.textPrimary : AppColors.textSecondary,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                  side: const BorderSide(color: AppColors.glassStroke),
                ),
                onSelected: (_) => onChanged(value),
              ),
            ),
        ],
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({required this.report, required this.onAction});
  final ModerationReport report;
  final void Function(String action, int? minutes) onAction;

  @override
  Widget build(BuildContext context) {
    final isContent = report.targetType == 'message';
    return GlassCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _StatusChip(status: report.status),
              const SizedBox(width: 8),
              Text(
                report.reason.replaceAll('_', ' '),
                style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.textPrimary),
              ),
              const Spacer(),
              Text(
                _timeAgo(report.createdAt),
                style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text('Target: ${report.targetType} · ${_short(report.targetId)}',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          if (report.details != null && report.details!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(report.details!, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _ActionButton(
                label: 'Dismiss',
                color: AppColors.textSecondary,
                onTap: () => onAction('dismiss', null),
              ),
              _ActionButton(
                label: 'Warn',
                color: AppColors.warning,
                onTap: () => onAction('warn', null),
              ),
              if (isContent)
                _ActionButton(
                  label: 'Delete',
                  color: AppColors.danger,
                  onTap: () => onAction('delete', null),
                ),
              _ActionButton(
                label: 'Mute 1h',
                color: AppColors.warning,
                onTap: () => onAction('mute', 60),
              ),
              _ActionButton(
                label: 'Ban 7d',
                color: AppColors.danger,
                onTap: () => onAction('ban', 7 * 24 * 60),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _short(String id) => id.length > 13 ? '${id.substring(0, 8)}…' : id;

  String _timeAgo(DateTime t) {
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return 'just now';
    if (d.inHours < 1) return '${d.inMinutes}m ago';
    if (d.inDays < 1) return '${d.inHours}h ago';
    return '${d.inDays}d ago';
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({required this.label, required this.color, required this.onTap});
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        side: BorderSide(color: color.withValues(alpha: 0.6)),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        minimumSize: const Size(0, 36),
      ),
      onPressed: onTap,
      child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'resolved' => AppColors.success,
      'dismissed' => AppColors.textMuted,
      'reviewing' => AppColors.softCyan,
      _ => AppColors.warning,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(status, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }
}

class _Denied extends StatelessWidget {
  const _Denied();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.shield_outlined, color: AppColors.textMuted, size: 56),
            SizedBox(height: 16),
            Text(
              'Moderator access only',
              style: TextStyle(color: AppColors.textPrimary, fontSize: 18, fontWeight: FontWeight.w800),
            ),
            SizedBox(height: 8),
            Text(
              'You need a moderator or admin account to view this panel.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message, style: const TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
