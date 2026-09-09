import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/game_logo.dart';
import '../../domain/entities/game_entities.dart';
import '../boards/game_board_dispatcher.dart';
import '../providers/game_table_notifier.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';
import '../widgets/tutorial_sheet.dart';

/// The live, game-agnostic table. It renders the shared shell (seat strip,
/// in-table chat, finish banner) and dispatches to the per-game board widget
/// based on the engine slug. Every interaction is a request to the
/// authoritative server; redacted state streams back over the socket.
class GameTableScreen extends ConsumerStatefulWidget {
  const GameTableScreen({super.key, required this.sessionId});

  final String sessionId;

  @override
  ConsumerState<GameTableScreen> createState() => _GameTableScreenState();
}

class _GameTableScreenState extends ConsumerState<GameTableScreen> {
  bool _muted = false;

  /// Per-slug display titles. Games register their title as they are rebuilt
  /// wave by wave; unknown slugs get a prettified name as fallback.
  static const _titles = <String, String>{
    'dominoes': 'Dominoes',
    'ludo': 'Ludo',
    'ocho': 'Ocho',
  };

  static String _titleFor(String slug) {
    final known = _titles[slug];
    if (known != null) return known;
    if (slug.isEmpty) return 'Game';
    return slug
        .split('_')
        .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
        .join(' ');
  }

  @override
  Widget build(BuildContext context) {
    final table = ref.watch(gameTableProvider(widget.sessionId));
    final notifier = ref.read(gameTableProvider(widget.sessionId).notifier);
    final session = table.session;
    final slug = session?.gameSlug ?? '';

    final gameName = _titles[slug] ?? 'Game';

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (slug.isNotEmpty) GameLogo(slug: slug, size: 34, radius: 10),
            if (slug.isNotEmpty) const SizedBox(width: 10),
            Flexible(
              child: Text(
                gameName,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => context.go('/games'),
        ),
        actions: [
          IconButton(
            tooltip: context.l10n.t('how_to_play'),
            icon: const Icon(Icons.help_outline_rounded, color: AppColors.softCyan),
            onPressed: () => TutorialSheet.show(context, slug: slug, name: gameName),
          ),
          IconButton(
            tooltip: _muted ? 'Unmute' : 'Mute',
            icon: Icon(_muted ? Icons.volume_off : Icons.volume_up,
                color: _muted ? AppColors.textMuted : AppColors.softCyan),
            onPressed: () => setState(() => _muted = GameFeedback.toggleMute()),
          ),
        ],
      ),
      body: session == null
          ? _LoadingOrError(phase: table.phase, error: table.error)
          : Column(
              children: [
                SeatStrip(
                  session: session,
                  mySeat: table.mySeat,
                  activeSeats: _activeSeats(session),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: GameBoardDispatcher(
                      session: session,
                      mySeat: table.mySeat,
                      onAction: notifier.sendAction,
                    ),
                  ),
                ),
                GameChatPanel(sessionId: widget.sessionId, mySeat: table.mySeat),
                if (table.error != null && session.isInProgress)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8, left: 16, right: 16),
                    child: Text(table.error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: AppColors.danger, fontSize: 13)),
                  ),
                if (session.isCompleted) FinishBanner(session: session, mySeat: table.mySeat),
              ],
            ),
    );
  }

  /// Live games often allow several seats to act at once; turn-based games
  /// highlight only the active seat. Defaults to the session's current seat.
  Set<int> _activeSeats(GameSessionView session) {
    return {session.currentSeat};
  }
}

class _LoadingOrError extends StatelessWidget {
  const _LoadingOrError({required this.phase, required this.error});
  final TablePhase phase;
  final String? error;

  @override
  Widget build(BuildContext context) {
    if (phase == TablePhase.error) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppColors.danger, size: 48),
              const SizedBox(height: 16),
              Text(error ?? 'Could not join the table.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: 20),
              TextButton(
                onPressed: () => context.go('/games'),
                child: const Text('Back to games', style: TextStyle(color: AppColors.softCyan)),
              ),
            ],
          ),
        ),
      );
    }
    return const Center(child: CircularProgressIndicator(color: AppColors.softCyan));
  }
}
