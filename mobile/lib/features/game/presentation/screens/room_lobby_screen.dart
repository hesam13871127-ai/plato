import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../../core/widgets/gradient_button.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../domain/entities/game_entities.dart';
import '../providers/game_providers.dart';

/// Lobby for a single table: shows seats, the private invite code, ready-up and
/// host start. Live seat changes arrive over the socket; the source of truth
/// is the server.
class RoomLobbyScreen extends ConsumerStatefulWidget {
  const RoomLobbyScreen({super.key, required this.roomId});

  final String roomId;

  @override
  ConsumerState<RoomLobbyScreen> createState() => _RoomLobbyScreenState();
}

class _RoomLobbyScreenState extends ConsumerState<RoomLobbyScreen> {
  GameRoom? _room;
  String? _error;
  bool _loading = true;
  final List<StreamSubscription<dynamic>> _subs = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _load();
      final socket = ref.read(gameSocketServiceProvider);
      _subs.add(socket.roomUpdates.listen((room) {
        if (room.id == widget.roomId && mounted) setState(() => _room = room);
      }));
      _subs.add(socket.roomStarted.listen((event) {
        if (event.sessionId.isNotEmpty && mounted) {
          context.pushReplacement('/game/${event.sessionId}');
        }
      }));
    });
  }

  @override
  void dispose() {
    for (final sub in _subs) {
      unawaited(sub.cancel());
    }
    super.dispose();
  }

  Future<void> _load() async {
    final repo = ref.read(gameRepositoryProvider);
    final result = await repo.getRoom(widget.roomId);
    if (!mounted) return;
    result.fold(
      (failure) => setState(() {
        _error = failure.message;
        _loading = false;
      }),
      (room) => setState(() {
        _room = room;
        _loading = false;
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final myId = ref.watch(authNotifierProvider).user.id;
    final room = _room;

    return Scaffold(
      backgroundColor: AppColors.deepNavy,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(room?.name ?? room?.gameName ?? 'Table',
            style: const TextStyle(color: AppColors.textPrimary)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => context.go('/games'),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.softCyan))
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: AppColors.danger)))
              : room == null
                  ? const SizedBox.shrink()
                  : SafeArea(
                      child: ListView(
                        padding: const EdgeInsets.all(20),
                        children: [
                          if (room.isPrivate && room.accessCode != null)
                            _InviteCard(code: room.accessCode!, inviteUrl: room.inviteUrl),
                          const SizedBox(height: 16),
                          GlassCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text('Seats',
                                        style: const TextStyle(
                                            color: AppColors.textPrimary,
                                            fontWeight: FontWeight.bold,
                                            fontSize: 16)),
                                    const Spacer(),
                                    Text('${room.players.length}/${room.maxPlayers}',
                                        style: const TextStyle(color: AppColors.textSecondary)),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                ...room.players.map((p) => _SeatRow(player: p, myId: myId)),
                                for (var i = room.players.length; i < room.maxPlayers; i++)
                                  const _EmptySeat(),
                              ],
                            ),
                          ),
                          const SizedBox(height: 24),
                          if (room.hostId == myId)
                            GradientButton(
                              label: 'Start game',
                              icon: Icons.play_arrow_rounded,
                              onPressed: () => _start(room),
                            )
                          else
                            _ReadyButton(room: room, myId: myId),
                        ],
                      ),
                    ),
    );
  }

  Future<void> _start(GameRoom room) async {
    final repo = ref.read(gameRepositoryProvider);
    final result = await repo.startRoom(room.id);
    if (!mounted) return;
    result.fold(
      (failure) => ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(failure.message))),
      (match) => context.pushReplacement('/game/${match.sessionId}'),
    );
  }
}

class _InviteCard extends StatelessWidget {
  const _InviteCard({required this.code, required this.inviteUrl});
  final String code;
  final String? inviteUrl;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      gradient: LinearGradient(
        colors: [AppColors.electricPurple.withOpacity(0.25), AppColors.softCyan.withOpacity(0.1)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(Icons.link, color: AppColors.softCyan, size: 18),
              SizedBox(width: 8),
              Text('Invite link',
                  style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.deepNavy.withOpacity(0.5),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    inviteUrl != null ? '$inviteUrl' : '/join/$code',
                    style: const TextStyle(color: AppColors.softCyan, fontSize: 14),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.copy, color: AppColors.textSecondary, size: 18),
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: inviteUrl ?? '/join/$code'));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Invite link copied')),
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text('Code: $code',
              style: const TextStyle(color: AppColors.textSecondary, letterSpacing: 2)),
        ],
      ),
    );
  }
}

class _SeatRow extends StatelessWidget {
  const _SeatRow({required this.player, required this.myId});
  final RoomPlayer player;
  final String myId;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: AppColors.electricPurple,
            child: Text(
              player.displayName.isNotEmpty ? player.displayName[0].toUpperCase() : '?',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        player.userId == myId ? '${player.displayName} (You)' : player.displayName,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600),
                      ),
                    ),
                    if (player.isHost)
                      const Padding(
                        padding: EdgeInsets.only(left: 6),
                        child: Icon(Icons.star, color: AppColors.warning, size: 15),
                      ),
                  ],
                ),
                Text('Level ${player.level}',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
              ],
            ),
          ),
          Icon(
            player.isReady ? Icons.check_circle : Icons.radio_button_unchecked,
            color: player.isReady ? AppColors.success : AppColors.textMuted,
            size: 22,
          ),
        ],
      ),
    );
  }
}

class _EmptySeat extends StatelessWidget {
  const _EmptySeat();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.glassStroke),
            ),
            child: const Icon(Icons.add, color: AppColors.textMuted, size: 18),
          ),
          const SizedBox(width: 12),
          const Text('Open seat', style: TextStyle(color: AppColors.textMuted)),
        ],
      ),
    );
  }
}

class _ReadyButton extends ConsumerWidget {
  const _ReadyButton({required this.room, required this.myId});
  final GameRoom room;
  final String myId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = room.players.where((p) => p.userId == myId);
    final isReady = me.isEmpty ? false : me.first.isReady;
    return GradientButton(
      label: isReady ? 'Cancel ready' : 'Ready',
      icon: isReady ? Icons.cancel : Icons.check,
      onPressed: () async {
        final repo = ref.read(gameRepositoryProvider);
        final result = await repo.setReady(roomId: room.id, isReady: !isReady);
        result.fold(
          (failure) => ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(failure.message))),
          (updated) {},
        );
      },
    );
  }
}
