import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Ludo: four tokens per seat race around a 52-cell track into the home
/// centre. The engine uses an abstract linear track, so each seat's tokens are
/// drawn on a circular path coloured by owner. Roll, then tap a movable token.
class LudoBoard extends StatelessWidget {
  const LudoBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  static const _seatColors = [AppColors.softCyan, AppColors.danger, AppColors.success, AppColors.warning];
  static const double _ring = 128;

  Map<String, dynamic> get b => session.board;

  List<List<int>> get _tokens {
    final raw = (b['tokens'] as List?) ?? const [];
    return raw.map<List<int>>((seat) {
      final list = (seat as List?) ?? const [];
      return list
          .map<int>((t) => ((t is Map ? t['progress'] : null) as num?)?.toInt() ?? -1)
          .toList();
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = _tokens;
    final die = (b['die'] as num?)?.toInt();
    final hasRolled = (b['hasRolled'] as bool?) ?? false;
    final myTurn = session.isInProgress && session.currentSeat == mySeat;
    final captures =
        ((b['captures'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

    return Column(
      children: [
        TurnIndicator(
          text: session.isInProgress
              ? (!myTurn
                  ? 'Waiting for opponents…'
                  : hasRolled
                      ? 'Tap a glowing token to move'
                      : 'Roll the die!')
              : 'Game over',
          highlight: myTurn,
          icon: Icons.casino,
        ),
        const SizedBox(height: 8),
        TableSurface(
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  for (var i = 0; i < session.seats.length; i++)
                    Row(
                      children: [
                        Container(
                            width: 12,
                            height: 12,
                            decoration:
                                BoxDecoration(color: _seatColors[i % 4], shape: BoxShape.circle)),
                        const SizedBox(width: 4),
                        Text(
                            '${tokens.length > i ? tokens[i].where((p) => p >= 57).length : 0}/4',
                            style: const TextStyle(
                                color: AppColors.textPrimary, fontWeight: FontWeight.w700)),
                        if (i < captures.length && captures[i] > 0)
                          Text('  ⚔${captures[i]}',
                              style: const TextStyle(color: AppColors.warning, fontSize: 11)),
                      ],
                    ),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 300,
                width: 300,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Container(
                      width: 300,
                      height: 300,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.glassStroke, width: 6),
                        gradient: const RadialGradient(
                            colors: [AppColors.surfaceElevated, AppColors.deepNavy]),
                      ),
                    ),
                    Container(
                      width: 66,
                      height: 66,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: AppColors.brandGradient,
                        boxShadow: [
                          BoxShadow(color: AppColors.electricPurple.withOpacity(0.5), blurRadius: 16)
                        ],
                      ),
                      child: const Icon(Icons.home, color: Colors.white, size: 28),
                    ),
                    for (var seat = 0; seat < tokens.length; seat++)
                      for (var ti = 0; ti < tokens[seat].length; ti++)
                        _tokenPosition(seat, ti, tokens[seat][ti], myTurn && hasRolled, tokens.length),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Text(die != null ? 'Die: $die' : 'Die: –',
                  style: TextStyle(
                      color: die != null ? AppColors.softCyan : AppColors.textMuted,
                      fontSize: 22,
                      fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              Row(
                children: [
                  ActionButton(
                    label: 'Roll',
                    icon: Icons.casino,
                    color: AppColors.softCyan.withOpacity(0.9),
                    onPressed: myTurn && !hasRolled
                        ? () {
                            GameFeedback.roll();
                            onAction('roll', {});
                          }
                        : null,
                  ),
                  const SizedBox(width: 10),
                  ActionButton(
                    label: 'Pass',
                    icon: Icons.skip_next,
                    color: AppColors.surfaceElevated,
                    onPressed: myTurn && hasRolled
                        ? () {
                            GameFeedback.tap();
                            onAction('pass', {});
                          }
                        : null,
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _tokenPosition(int seat, int token, int progress, bool canMove, int seatCount) {
    final color = _seatColors[seat % 4];
    Offset pos;
    if (progress < 0) {
      // Home base: cluster in the seat's corner.
      const baseAngles = [-math.pi / 4, -3 * math.pi / 4, math.pi / 4, 3 * math.pi / 4];
      final a = baseAngles[seat % 4];
      final radius = 118.0;
      final spread = (token - 1.5) * 12.0;
      pos = Offset((radius + spread) * math.cos(a), (radius + spread) * math.sin(a));
    } else if (progress >= 57) {
      // Finished: cluster near the centre.
      pos = Offset((token - 1.5) * 12, (seat - 1) * 10);
    } else {
      // On the shared ring: seat start offset then relative progress.
      final seatStart = (seat * (52 / seatCount));
      final cell = (seatStart + progress) % 52;
      final angle = (cell / 52) * 2 * math.pi - math.pi / 2;
      pos = Offset(_ring * math.cos(angle), _ring * math.sin(angle));
    }
    return Transform.translate(
      offset: pos,
      child: GestureDetector(
        onTap: canMove
            ? () {
                GameFeedback.move();
                onAction('move', {'token': token});
              }
            : null,
        child: Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: canMove
                ? [BoxShadow(color: AppColors.softCyan.withOpacity(0.8), blurRadius: 12)]
                : [BoxShadow(color: Colors.black.withOpacity(0.4), blurRadius: 4)],
          ),
          child: canMove ? const Icon(Icons.ads_click, size: 12, color: Colors.white) : null,
        ),
      ),
    );
  }
}
