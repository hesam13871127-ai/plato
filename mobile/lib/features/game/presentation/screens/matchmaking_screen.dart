import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../providers/game_providers.dart';
import '../providers/matchmaking_notifier.dart';

/// Smart-matchmaking screen. Enqueues on open, shows live search progress and
/// the count-down to automatic (invisible-bot) matchmaking, then routes into
/// the table when a match is formed — whether the opponents are human or bots
/// is indistinguishable to the player by design.
class MatchmakingScreen extends ConsumerStatefulWidget {
  const MatchmakingScreen({super.key, required this.gameSlug, this.isRanked = false});

  final String gameSlug;
  final bool isRanked;

  @override
  ConsumerState<MatchmakingScreen> createState() => _MatchmakingScreenState();
}

class _MatchmakingScreenState extends ConsumerState<MatchmakingScreen> {
  bool _navigated = false;
  int _dots = 0;
  Timer? _animTimer;

  @override
  void initState() {
    super.initState();
    _animTimer = Timer.periodic(const Duration(milliseconds: 500), (_) {
      if (mounted) setState(() => _dots = (_dots + 1) % 4);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _enqueue());
  }

  Future<void> _enqueue() async {
    await ref
        .read(matchmakingNotifierProvider.notifier)
        .enqueue(gameSlug: widget.gameSlug, isRanked: widget.isRanked, seats: 2);
  }

  @override
  void dispose() {
    _animTimer?.cancel();
    // Cancel the queue if the player leaves before a match forms.
    final phase = ref.read(matchmakingNotifierProvider).phase;
    if (phase == MatchmakingPhase.queued || phase == MatchmakingPhase.idle) {
      ref.read(matchmakingNotifierProvider.notifier).cancel();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<MatchmakingState>(matchmakingNotifierProvider, (previous, next) {
      if (_navigated || !mounted) return;
      if (next.phase == MatchmakingPhase.found && next.match != null) {
        _navigated = true;
        context.pushReplacement('/game/${next.match!.sessionId}');
      }
    });

    final state = ref.watch(matchmakingNotifierProvider);

    return Scaffold(
      backgroundColor: AppColors.deepNavy,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: GlassCard(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 120,
                    height: 120,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        const SizedBox(
                          width: 120,
                          height: 120,
                          child: CircularProgressIndicator(
                            strokeWidth: 6,
                            valueColor: AlwaysStoppedAnimation(AppColors.softCyan),
                            backgroundColor: AppColors.glassFill,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [AppColors.electricPurple, AppColors.softCyan],
                            ),
                            borderRadius: BorderRadius.circular(40),
                          ),
                          child: const Icon(Icons.groups, color: Colors.white, size: 34),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 28),
                  Text(
                    'Finding an opponent${'.' * _dots}',
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Matching by skill, language and region.\n'
                    '${widget.gameSlug == 'dominoes' ? 'Dominoes' : widget.gameSlug} · '
                    '${widget.isRanked ? 'Ranked' : 'Casual'}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.textSecondary, height: 1.5),
                  ),
                  const SizedBox(height: 22),
                  _StatusRow(state: state),
                  const SizedBox(height: 26),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () {
                        ref.read(matchmakingNotifierProvider.notifier).cancel();
                        context.pop();
                      },
                      icon: const Icon(Icons.close, size: 18),
                      label: const Text('Cancel search'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.danger,
                        side: BorderSide(color: AppColors.danger.withOpacity(0.5)),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({required this.state});
  final MatchmakingState state;

  @override
  Widget build(BuildContext context) {
    final players = state.status?.playersFound ?? 1;
    final fallback = state.status?.fallbackInSeconds ?? 15;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.glassFill,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.glassStroke),
      ),
      child: Row(
        children: [
          const Icon(Icons.person_search, color: AppColors.softCyan),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$players player${players == 1 ? '' : 's'} matched so far',
                    style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600)),
                Text(
                  players > 1
                      ? 'Starting your game…'
                      : 'A table opens automatically in ~${fallback}s — you will never wait alone.',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
