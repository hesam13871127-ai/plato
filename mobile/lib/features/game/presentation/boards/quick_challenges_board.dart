import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Quick Challenges: rapid rounds — rapid tapping, reaction test, target-number
/// taps and arrow-direction reflexes.
class QuickChallengesBoard extends StatefulWidget {
  const QuickChallengesBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<QuickChallengesBoard> createState() => _QuickChallengesBoardState();
}

class _QuickChallengesBoardState extends State<QuickChallengesBoard> {
  Timer? _tick;
  int _now = DateTime.now().millisecondsSinceEpoch;
  int _taps = 0;

  Map<String, dynamic> get b => widget.session.board;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (mounted) setState(() => _now = DateTime.now().millisecondsSinceEpoch);
    });
  }

  @override
  void didUpdateWidget(covariant QuickChallengesBoard old) {
    super.didUpdateWidget(old);
    // Reset local tap counter at the start of each new tap round.
    final oldType = old.session.board['type'];
    final newType = widget.session.board['type'];
    if (oldType != newType || widget.session.board['round'] != old.session.board['round']) {
      _taps = 0;
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final type = b['type']?.toString() ?? 'tap';
    final phase = b['phase']?.toString() ?? 'ready';
    final round = (b['round'] as num?)?.toInt() ?? 1;
    final target = (b['target'] as num?)?.toInt() ?? 6;
    final instruction = b['instruction']?.toString() ?? '';
    final players = ((b['players'] as List?) ?? const []);
    final active = phase == 'active' && widget.session.isInProgress;

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress ? 'Round $round of $target' : 'Game over',
          highlight: active,
          icon: Icons.bolt,
        ),
        const SizedBox(height: 6),
        Text(instruction, textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 16)),
        const SizedBox(height: 12),
        TableSurface(
          child: Column(
            children: [
              SizedBox(height: 150, child: _challengeArea(type, phase, active)),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                alignment: WrapAlignment.center,
                children: List.generate(players.length, (i) {
                  final p = Map<String, dynamic>.from(players[i] as Map);
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: i == widget.mySeat ? AppColors.electricPurple.withOpacity(0.3) : AppColors.glassFill,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.glassStroke),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(i == widget.mySeat ? 'You' : widget.session.seats[i].displayName,
                            style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
                        const SizedBox(width: 8),
                        Text('${(p['score'] as num?)?.toInt() ?? 0}',
                            style: const TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  );
                }),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _challengeArea(String type, String phase, bool active) {
    if (phase == 'ready') {
      return const Center(child: Icon(Icons.hourglass_top, color: AppColors.warning, size: 44));
    }
    if (phase == 'reveal') {
      return const Center(child: Icon(Icons.check_circle, color: AppColors.success, size: 44));
    }
    switch (type) {
      case 'reaction':
        return _reactionArea(active);
      case 'target_number':
        return _targetNumberArea(active);
      case 'direction':
        return _directionArea(active);
      case 'tap':
      default:
        return _tapArea(active);
    }
  }

  Widget _tapArea(bool active) {
    final goal = (b['tapGoal'] as num?)?.toInt() ?? 20;
    final players = ((b['players'] as List?) ?? const []);
    final me = widget.mySeat >= 0 && widget.mySeat < players.length
        ? Map<String, dynamic>.from(players[widget.mySeat] as Map)
        : null;
    final serverTaps = (me?['value'] as num?)?.toInt() ?? 0;
    final shown = serverTaps > _taps ? serverTaps : _taps;
    return GestureDetector(
      onTapDown: active ? (_) => _tap() : null,
      child: Container(
        width: double.infinity,
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [AppColors.electricPurple, AppColors.softCyan]),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('$shown',
                style: const TextStyle(fontSize: 56, fontWeight: FontWeight.w900, color: Colors.white)),
            Text('TAP! goal $goal',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }

  Widget _reactionArea(bool active) {
    final goAt = DateTime.tryParse((b['reactStartAt'] as String?) ?? '')?.millisecondsSinceEpoch ?? 0;
    final go = _now >= goAt;
    return GestureDetector(
      onTapDown: active
          ? (_) {
              GameFeedback.move();
              widget.onAction('react', {});
            }
          : null,
      child: Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: go ? AppColors.success : AppColors.danger,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Center(
          child: Text(
            go ? 'GO! TAP!' : 'Wait for green…',
            style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Colors.white),
          ),
        ),
      ),
    );
  }

  Widget _targetNumberArea(bool active) {
    final items = ((b['items'] as List?) ?? const []).map((e) => (e as num).toInt()).toList();
    final target = (b['targetNumber'] as num?)?.toInt() ?? 0;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text('Target: $target',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: AppColors.softCyan)),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: items.map((n) {
            final isTarget = n == target;
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: SizedBox(
                width: 64,
                height: 64,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: isTarget ? AppColors.electricPurple : AppColors.surfaceElevated,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  onPressed: active
                      ? () {
                          GameFeedback.tap();
                          widget.onAction('order_tap', {'number': n});
                        }
                      : null,
                  child: Text('$n', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _directionArea(bool active) {
    final pointer = b['pointer']?.toString() ?? 'up';
    final dirs = {
      'up': {'icon': Icons.arrow_upward, 'label': 'UP'},
      'down': {'icon': Icons.arrow_downward, 'label': 'DOWN'},
      'left': {'icon': Icons.arrow_back, 'label': 'LEFT'},
      'right': {'icon': Icons.arrow_forward, 'label': 'RIGHT'},
    };
    final target = dirs[pointer] ?? dirs['up']!;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(target['icon'] as IconData, size: 56, color: AppColors.softCyan),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          children: dirs.entries.map((e) {
            return FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: e.key == pointer ? AppColors.electricPurple : AppColors.surfaceElevated,
                shape: const CircleBorder(),
                padding: const EdgeInsets.all(16),
              ),
              onPressed: active
                  ? () {
                      GameFeedback.tap();
                      widget.onAction('direction_tap', {'dir': e.key});
                    }
                  : null,
              child: Icon(e.value['icon'] as IconData),
            );
          }).toList(),
        ),
      ],
    );
  }

  void _tap() {
    setState(() => _taps++);
    GameFeedback.tap();
    widget.onAction('tap', {});
  }
}
