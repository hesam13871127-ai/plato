import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../domain/entities/game_entities.dart';
import '../providers/game_providers.dart';

/// Lists open public tables and offers invite-code entry for private ones.
class OpenRoomsScreen extends ConsumerWidget {
  const OpenRoomsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final roomsAsync = ref.watch(openRoomsProvider);
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Open tables', style: TextStyle(color: AppColors.textPrimary)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.softCyan,
          onRefresh: () async => ref.invalidate(openRoomsProvider),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const _JoinByCodeCard(),
              const SizedBox(height: 20),
              roomsAsync.when(
                loading: () => const Padding(
                  padding: EdgeInsets.all(40),
                  child: Center(child: CircularProgressIndicator(color: AppColors.softCyan)),
                ),
                error: (e, _) => GlassCard(
                  child: Text('Could not load tables.\n$e',
                      style: const TextStyle(color: AppColors.textSecondary)),
                ),
                data: (rooms) {
                  if (rooms.isEmpty) {
                    return const GlassCard(
                      child: Text(
                        'No open tables yet. Create one from the game hub — '
                        'empty seats fill automatically.',
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                    );
                  }
                  return Column(
                    children: rooms
                        .map((r) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: _RoomCard(room: r),
                            ))
                        .toList(),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _JoinByCodeCard extends ConsumerStatefulWidget {
  const _JoinByCodeCard();

  @override
  ConsumerState<_JoinByCodeCard> createState() => _JoinByCodeCardState();
}

class _JoinByCodeCardState extends ConsumerState<_JoinByCodeCard> {
  final _controller = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _join() async {
    final code = _controller.text.trim();
    if (code.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final result = await ref.read(gameRepositoryProvider).joinRoom(accessCode: code.toUpperCase());
    if (!mounted) return;
    result.fold(
      (failure) => setState(() {
        _busy = false;
        _error = failure.message;
      }),
      (room) => context.pushReplacement('/rooms/${room.id}'),
    );
  }

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.vpn_key, color: AppColors.softCyan, size: 18),
              SizedBox(width: 8),
              Text('Have an invite code?',
                  style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            textCapitalization: TextCapitalization.characters,
            style: const TextStyle(color: AppColors.textPrimary, letterSpacing: 3),
            decoration: InputDecoration(
              hintText: 'ABC123',
              hintStyle: const TextStyle(color: AppColors.textMuted, letterSpacing: 3),
              filled: true,
              fillColor: AppColors.glassFill,
              suffixIcon: _busy
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.softCyan)),
                    )
                  : IconButton(
                      icon: const Icon(Icons.arrow_forward, color: AppColors.softCyan),
                      onPressed: _join,
                    ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
            onSubmitted: (_) => _join(),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
          ],
        ],
      ),
    );
  }
}

class _RoomCard extends ConsumerWidget {
  const _RoomCard({required this.room});
  final GameRoom room;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GlassCard(
      onTap: () async {
        final result = await ref.read(gameRepositoryProvider).joinRoom(roomId: room.id);
        if (!context.mounted) return;
        result.fold(
          (failure) => ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(failure.message))),
          (_) => context.push('/rooms/${room.id}'),
        );
      },
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.softCyan.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.extension, color: AppColors.softCyan),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(room.name ?? room.gameName,
                    style: const TextStyle(
                        color: AppColors.textPrimary, fontWeight: FontWeight.w600)),
                Text('${room.gameName} · ${room.humanCount}/${room.maxPlayers} players',
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AppColors.textMuted),
        ],
      ),
    );
  }
}
