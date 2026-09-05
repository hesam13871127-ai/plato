import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Impostor Light: crew knows the secret location, the impostor does not.
/// Discuss, then vote out a suspect during the voting phase.
class ImpostorLightBoard extends StatefulWidget {
  const ImpostorLightBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<ImpostorLightBoard> createState() => _ImpostorLightBoardState();
}

class _ImpostorLightBoardState extends State<ImpostorLightBoard> {
  Timer? _tick;
  int _now = DateTime.now().millisecondsSinceEpoch;
  bool _voted = false;

  Map<String, dynamic> get b => widget.session.board;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (mounted) setState(() => _now = DateTime.now().millisecondsSinceEpoch);
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final phase = b['phase']?.toString() ?? 'discussion';
    final isVoting = phase == 'voting';
    final isResolution = phase == 'resolution';
    final location = b['location']?.toString();
    final iAmImpostor = b['youAreImpostor'] == true;
    final message = b['message']?.toString() ?? '';
    final players = ((b['players'] as List?) ?? const []);
    final results = ((b['results'] as List?) ?? const []);
    final endsAt = DateTime.tryParse((b['phaseEndsAt'] as String?) ?? '')?.millisecondsSinceEpoch ?? _now;
    final remain = ((endsAt - _now) / 1000).clamp(0, 60).toStringAsFixed(0);

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress
              ? isVoting
                  ? 'Vote for the impostor! ⏳ ${remain}s'
                  : isResolution
                      ? 'Voting closed…'
                      : 'Discussion — blend in! ⏳ ${remain}s'
              : 'Game over',
          highlight: isVoting && !_voted && widget.session.isInProgress,
          icon: Icons.theater_comedy,
        ),
        const SizedBox(height: 10),
        TableSurface(
          child: Column(
            children: [
              // Secret card.
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: iAmImpostor
                        ? [AppColors.danger.withOpacity(0.3), AppColors.surfaceElevated]
                        : [AppColors.electricPurple.withOpacity(0.3), AppColors.softCyan.withOpacity(0.1)],
                  ),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  children: [
                    Icon(iAmImpostor ? Icons.visibility_off : Icons.place,
                        color: iAmImpostor ? AppColors.danger : AppColors.softCyan, size: 30),
                    const SizedBox(height: 8),
                    Text(
                      iAmImpostor ? 'You are the IMPOSTOR' : 'Category: ${b['category'] ?? ''}',
                      style: TextStyle(
                          color: iAmImpostor ? AppColors.danger : AppColors.softCyan,
                          fontWeight: FontWeight.w800,
                          fontSize: 13),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      iAmImpostor
                          ? 'Blend in — you don\'t know the location!'
                          : (location ?? ''),
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              if (message.isNotEmpty)
                Text(message,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w700)),
              const SizedBox(height: 14),
              ...List.generate(players.length, (i) {
                final p = Map<String, dynamic>.from(players[i] as Map);
                final seat = (p['seat'] as num?)?.toInt() ?? i;
                final name = p['name']?.toString() ?? widget.session.seats[seat].displayName;
                final alive = p['alive'] == true;
                final votes = results
                    .whereType<Map>()
                    .where((r) => (r['seat'] as num?)?.toInt() == seat)
                    .map((r) => (r['votes'] as num?)?.toInt() ?? 0)
                    .fold<int>(0, (a, c) => a + c);
                final canVote = isVoting && alive && seat != widget.mySeat && !_voted;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: canVote ? () => _vote(seat) : null,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: canVote ? AppColors.electricPurple.withOpacity(0.15) : AppColors.glassFill,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: canVote ? AppColors.electricPurple : AppColors.glassStroke),
                        ),
                        child: Row(
                          children: [
                            Icon(alive ? Icons.person : Icons.person_off,
                                size: 18, color: alive ? AppColors.textPrimary : AppColors.textMuted),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                seat == widget.mySeat ? '$name (You)' : name,
                                style: TextStyle(
                                    color: alive ? AppColors.textPrimary : AppColors.textMuted,
                                    decoration: alive ? null : TextDecoration.lineThrough,
                                    fontWeight: FontWeight.w600),
                              ),
                            ),
                            if (votes > 0)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AppColors.electricPurple,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text('$votes',
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _vote(int target) async {
    setState(() => _voted = true);
    GameFeedback.move();
    await widget.onAction('vote', {'target': target});
  }
}
