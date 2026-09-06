import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../game/domain/repositories/game_repository.dart';
import '../../domain/entities/social_entities.dart';
import '../providers/social_providers.dart';

/// Wraps the app and surfaces real-time `game:invite` events as a dialog with
/// Accept / Decline. Accepting joins the room (by invite code when private) and
/// navigates to the lobby.
class GameInviteListener extends ConsumerStatefulWidget {
  const GameInviteListener({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<GameInviteListener> createState() => _GameInviteListenerState();
}

class _GameInviteListenerState extends ConsumerState<GameInviteListener> {
  StreamSubscription<GameInvite>? _sub;
  bool _showing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final stream = ref.read(socialSocketServiceProvider).gameInvite;
      _sub = stream.listen(_onInvite);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _onInvite(GameInvite invite) async {
    if (_showing || !mounted) return;
    _showing = true;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.surfaceElevated,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            const Icon(Icons.sports_esports, color: AppColors.softCyan),
            const SizedBox(width: 10),
            Expanded(child: Text('${invite.inviterName} invites you')),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              invite.roomName != null && invite.roomName!.isNotEmpty
                  ? 'Table “${invite.roomName}” — ${invite.gameName}'
                  : 'Join a game of ${invite.gameName}',
              style: const TextStyle(color: AppColors.textSecondary),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Decline', style: TextStyle(color: AppColors.textMuted)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.electricPurple),
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              await _accept(invite);
            },
            child: const Text('Accept'),
          ),
        ],
      ),
    );
    _showing = false;
  }

  Future<void> _accept(GameInvite invite) async {
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    final repo = ref.read(gameRepositoryProvider);
    final result = await repo.joinRoom(
      roomId: invite.roomId,
      accessCode: invite.accessCode,
    );
    result.fold(
      (failure) => messenger.showSnackBar(SnackBar(content: Text(failure.message))),
      (room) => router.push('/rooms/${room.id}'),
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
