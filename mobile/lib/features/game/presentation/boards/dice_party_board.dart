import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Dice Party: five rounds, everyone rolls three dice, highest sum banks a
/// point. Tap ROLL during the round window; the dice animate on result.
class DicePartyBoard extends StatefulWidget {
  const DicePartyBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<DicePartyBoard> createState() => _DicePartyBoardState();
}

class _DicePartyBoardState extends State<DicePartyBoard> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  Timer? _tick;
  int _now = DateTime.now().millisecondsSinceEpoch;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 650));
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (mounted) setState(() => _now = DateTime.now().millisecondsSinceEpoch);
    });
  }

  @override
  void didUpdateWidget(covariant DicePartyBoard old) {
    super.didUpdateWidget(old);
    // Play the roll animation once when our dice first land for this round.
    final players = widget.session.board['players'] as List?;
    final oldPlayers = old.session.board['players'] as List?;
    if (players != null && widget.mySeat >= 0 && widget.mySeat < players.length) {
      final me = Map<String, dynamic>.from(players[widget.mySeat] as Map);
      final oldMe = (oldPlayers != null && widget.mySeat < oldPlayers.length)
          ? Map<String, dynamic>.from(oldPlayers[widget.mySeat] as Map)
          : const <String, dynamic>{};
      final rolled = me['hasRolled'] == true && ((me['lastRoll'] as List?)?.isNotEmpty ?? false);
      final wasRolled = oldMe['hasRolled'] == true;
      if (rolled && !wasRolled) _ctrl.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  Map<String, dynamic> get b => widget.session.board;
  List<Map<String, dynamic>> get _players =>
      ((b['players'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  @override
  Widget build(BuildContext context) {
    final round = (b['round'] as num?)?.toInt() ?? 1;
    final target = (b['target'] as num?)?.toInt() ?? 5;
    final endsAt = DateTime.tryParse((b['roundEndsAt'] as String?) ?? '')?.millisecondsSinceEpoch;
    final remainMs = (endsAt ?? _now) - _now;
    final remain = (remainMs / 1000).clamp(0, 60).toStringAsFixed(1);
    final players = _players;
    final me = widget.mySeat >= 0 && widget.mySeat < players.length ? players[widget.mySeat] : null;
    final rolled = (me?['hasRolled'] as bool?) ?? false;
    final canRoll = widget.session.isInProgress && !rolled;

    final dice = ((me?['lastRoll'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress
              ? (rolled ? 'Rolled! Waiting for others…' : 'Round $round of $target — roll!')
              : 'Game over',
          highlight: canRoll,
          icon: Icons.casino,
        ),
        const SizedBox(height: 6),
        Text('⏳ $remain s', style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        TableSurface(
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _Die(value: dice.isNotEmpty ? dice[0] : 1, anim: _ctrl),
                  const SizedBox(width: 12),
                  _Die(value: dice.length > 1 ? dice[1] : 1, anim: _ctrl),
                  const SizedBox(width: 12),
                  _Die(value: dice.length > 2 ? dice[2] : 1, anim: _ctrl),
                ],
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: ActionButton(
                  label: rolled ? 'Locked in' : 'ROLL',
                  icon: Icons.casino,
                  color: AppColors.softCyan.withOpacity(0.9),
                  onPressed: canRoll
                      ? () {
                          GameFeedback.roll();
                          _ctrl.forward(from: 0);
                          widget.onAction('roll', {});
                        }
                      : null,
                ),
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 10,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: [
                  for (var i = 0; i < players.length; i++)
                    _ScoreChip(
                      name: i == widget.mySeat ? 'You' : widget.session.seats[i].displayName,
                      points: (players[i]['total'] as num?)?.toInt() ?? 0,
                      done: players[i]['hasRolled'] as bool? ?? false,
                      active: i == widget.mySeat,
                    ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Die extends StatelessWidget {
  const _Die({required this.value, required this.anim});
  final int value;
  final Animation<double> anim;

  static const Map<int, List<List<int>>> _pips = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  };

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: anim,
      builder: (context, _) {
        final wobble = math.sin(anim.value * math.pi * 6) * (1 - anim.value) * 0.6;
        return Transform.rotate(
          angle: wobble,
          child: Container(
            width: 62,
            height: 62,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Colors.white, Color(0xFFD9E2F5)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(14),
              boxShadow: [BoxShadow(color: AppColors.softCyan.withOpacity(0.3), blurRadius: 10)],
            ),
            child: GridView.count(
              crossAxisCount: 3,
              padding: const EdgeInsets.all(8),
              physics: const NeverScrollableScrollPhysics(),
              children: List.generate(9, (i) {
                final r = i ~/ 3, c = i % 3;
                final on = (_pips[value] ?? []).any((p) => p[0] == r && p[1] == c);
                return Center(
                  child: Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      color: on ? AppColors.deepNavy : Colors.transparent,
                      shape: BoxShape.circle,
                    ),
                  ),
                );
              }),
            ),
          ),
        );
      },
    );
  }
}

class _ScoreChip extends StatelessWidget {
  const _ScoreChip({required this.name, required this.points, required this.done, required this.active});
  final String name;
  final int points;
  final bool done;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: active ? AppColors.electricPurple.withOpacity(0.3) : AppColors.glassFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: done ? AppColors.success : AppColors.glassStroke),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(done ? Icons.check_circle : Icons.hourglass_bottom,
              size: 15, color: done ? AppColors.success : AppColors.textMuted),
          const SizedBox(width: 6),
          Text(name, style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(width: 8),
          Text('$points', style: const TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
