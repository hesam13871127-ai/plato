import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../moderation/data/moderation_remote_data_source.dart';
import '../../data/admin_remote_data_source.dart';
import 'admin_games_tab.dart';
import 'admin_overview_tab.dart';
import 'admin_seasons_tab.dart';
import 'admin_shop_tab.dart';
import 'admin_users_tab.dart';

///
/// Full administration panel (Phase 10). Access is enforced server-side:
/// the dashboard only renders for accounts whose role is `admin`, and every
/// mutating call is re-checked by the backend RolesGuard.
///
class AdminPanelScreen extends ConsumerStatefulWidget {
  const AdminPanelScreen({super.key});

  @override
  ConsumerState<AdminPanelScreen> createState() => _AdminPanelScreenState();
}

class _AdminPanelScreenState extends ConsumerState<AdminPanelScreen> {
  bool _checking = true;
  bool _allowed = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _checkAccess();
  }

  Future<void> _checkAccess() async {
    try {
      final ds = ref.read(moderationRemoteDataSourceProvider);
      final role = await ds.myRole();
      if (!mounted) return;
      setState(() {
        _allowed = role == 'admin';
        _checking = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _allowed = false;
        _checking = false;
        _error = e.response?.statusCode == 403
            ? 'Admin access required.'
            : 'Could not verify admin access.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.softCyan)),
      );
    }
    if (!_allowed) {
      return Scaffold(
        appBar: AppBar(title: const Text('Admin Panel')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.admin_panel_settings_outlined, color: AppColors.textMuted, size: 64),
              const SizedBox(height: 16),
              Text(_error ?? 'Admin access required.',
                  style: const TextStyle(color: AppColors.textSecondary)),
            ],
          ),
        ),
      );
    }

    return DefaultTabController(
      length: 6,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Admin Panel'),
          bottom: const TabBar(
            isScrollable: true,
            labelColor: AppColors.softCyan,
            unselectedLabelColor: AppColors.textSecondary,
            indicatorColor: AppColors.electricPurple,
            tabs: [
              Tab(icon: Icon(Icons.insights_rounded), text: 'Overview'),
              Tab(icon: Icon(Icons.people_alt_rounded), text: 'Users'),
              Tab(icon: Icon(Icons.storefront_rounded), text: 'Shop'),
              Tab(icon: Icon(Icons.sports_esports_rounded), text: 'Games'),
              Tab(icon: Icon(Icons.event_rounded), text: 'Seasons'),
              Tab(icon: Icon(Icons.shield_rounded), text: 'Moderation'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            AdminOverviewTab(),
            AdminUsersTab(),
            AdminShopTab(),
            AdminGamesTab(),
            AdminSeasonsTab(),
            _ModerationLinkTab(),
          ],
        ),
      ),
    );
  }
}

/// Points admins to the dedicated moderation dashboard (existing screen).
class _ModerationLinkTab extends StatelessWidget {
  const _ModerationLinkTab();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.rule_folder_rounded, color: AppColors.softCyan, size: 56),
            const SizedBox(height: 16),
            const Text(
              'Reports, bans and the audit trail live in the Moderation dashboard.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: AppColors.electricPurple),
              icon: const Icon(Icons.shield_rounded),
              label: const Text('Open Moderation dashboard'),
              onPressed: () => context.push('/moderation'),
            ),
          ],
        ),
      ),
    );
  }
}
