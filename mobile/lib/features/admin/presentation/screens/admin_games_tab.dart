import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../data/admin_remote_data_source.dart';

/// Game catalogue management: enable/disable/maintenance and add new games.
class AdminGamesTab extends ConsumerStatefulWidget {
  const AdminGamesTab({super.key});

  @override
  ConsumerState<AdminGamesTab> createState() => _AdminGamesTabState();
}

class _AdminGamesTabState extends ConsumerState<AdminGamesTab> {
  List<AdminGame> _games = [];
  bool _loading = true;

  AdminRemoteDataSource get _ds => ref.read(adminRemoteDataSourceProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      _games = await _ds.games();
    } on DioException catch (e) {
      _toast(e, 'Could not load games.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(DioException e, String fallback, {Color color = AppColors.danger}) {
    final msg = (e.response?.data is Map && (e.response!.data as Map)['message'] != null)
        ? (e.response!.data as Map)['message'].toString()
        : fallback;
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: color));
    }
  }

  Future<void> _setStatus(AdminGame game, String status) async {
    try {
      await _ds.setGameStatus(game.slug, status);
      await _load();
    } on DioException catch (e) {
      _toast(e, 'Could not update the game.');
    }
  }

  Future<void> _addGame() async {
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (_) => const _AddGameDialog(),
    );
    if (result == null) return;
    try {
      // Created with coming_soon on the server unless the engine exists.
      await _ds.upsertGamePlaceholder(result['slug']!, result['name']!);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Game added.'), backgroundColor: AppColors.success),
        );
      }
    } on DioException catch (e) {
      _toast(e, 'Could not add the game.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.electricPurple,
        icon: const Icon(Icons.add),
        label: const Text('Add game'),
        onPressed: _addGame,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.softCyan))
          : RefreshIndicator(
              onRefresh: _load,
              color: AppColors.softCyan,
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
                itemCount: _games.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final game = _games[i];
                  return GlassCard(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(game.name,
                                  style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 15)),
                            ),
                            _StatusChip(status: game.status),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text('${game.slug} · ${game.minPlayers}–${game.maxPlayers} players · bots: ${game.supportsBots ? '✓' : '✗'} · ranked: ${game.rankedEnabled ? '✓' : '✗'}',
                            style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          children: [
                            _StatusBtn(
                              label: 'Enable',
                              color: AppColors.success,
                              active: game.status == 'active',
                              onTap: () => _setStatus(game, 'active'),
                            ),
                            _StatusBtn(
                              label: 'Maintenance',
                              color: AppColors.warning,
                              active: game.status == 'maintenance',
                              onTap: () => _setStatus(game, 'maintenance'),
                            ),
                            _StatusBtn(
                              label: 'Disable',
                              color: AppColors.danger,
                              active: game.status == 'inactive',
                              onTap: () => _setStatus(game, 'inactive'),
                            ),
                            _StatusBtn(
                              label: 'Coming soon',
                              color: AppColors.textMuted,
                              active: game.status == 'coming_soon',
                              onTap: () => _setStatus(game, 'coming_soon'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'active' => AppColors.success,
      'maintenance' => AppColors.warning,
      'inactive' => AppColors.danger,
      _ => AppColors.textMuted,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(8)),
      child: Text(status, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }
}

class _StatusBtn extends StatelessWidget {
  const _StatusBtn({required this.label, required this.color, required this.onTap, required this.active});
  final String label;
  final Color color;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        backgroundColor: active ? color.withValues(alpha: 0.15) : null,
        side: BorderSide(color: color.withValues(alpha: 0.6)),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        minimumSize: const Size(0, 34),
      ),
      onPressed: onTap,
      child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
    );
  }
}

class _AddGameDialog extends StatefulWidget {
  const _AddGameDialog();

  @override
  State<_AddGameDialog> createState() => _AddGameDialogState();
}

class _AddGameDialogState extends State<_AddGameDialog> {
  final _name = TextEditingController();
  final _slug = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _slug.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AppColors.surfaceElevated,
      title: const Text('Add game'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _name,
            style: const TextStyle(color: AppColors.textPrimary),
            decoration: const InputDecoration(hintText: 'Display name (e.g. Blackjack)'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _slug,
            style: const TextStyle(color: AppColors.textPrimary),
            decoration: const InputDecoration(hintText: 'Slug (e.g. blackjack)'),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppColors.electricPurple),
          onPressed: () {
            final name = _name.text.trim();
            final slug = _slug.text.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9_]'), '_');
            if (name.isEmpty || slug.isEmpty) return;
            Navigator.pop(context, {'name': name, 'slug': slug});
          },
          child: const Text('Add'),
        ),
      ],
    );
  }
}
