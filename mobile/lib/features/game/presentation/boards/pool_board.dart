import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Pool 8-Ball: a felt table with 6 pockets. On your turn, drag/tap to aim the
/// cue and fire with a power slider; the server runs the physics. Balls are
/// drawn from the redacted `balls` list (positions are public).
class PoolBoard extends StatefulWidget {
  const PoolBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<PoolBoard> createState() => _PoolBoardState();
}

class _PoolBoardState extends State<PoolBoard> {
  Offset? _aim; // local offset the player is aiming toward
  Size _boardSize = Size.zero;
  double _power = 0.7;

  Map<String, dynamic> get b => widget.session.board;

  List<Map<String, dynamic>> get _balls =>
      ((b['balls'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  bool get _myTurn {
    final turnSeat = (b['turnSeat'] as num?)?.toInt() ?? widget.session.currentSeat;
    return widget.session.isInProgress && turnSeat == widget.mySeat;
  }

  bool get _simulating => (b['phase'] as String?) == 'sim';

  Color _ballColor(Map<String, dynamic> ball) {
    final group = ball['group'] as String? ?? 'cue';
    if (group == 'cue') return Colors.white;
    if (group == 'eight') return Colors.black87;
    if (group == 'stripe') return const Color(0xFFFFD9A6);
    return const Color(0xFFE84B3C);
  }

  void _shoot() {
    if (_aim == null) return;
    final cue = _balls.firstWhere((x) => (x['group'] as String?) == 'cue', orElse: () => <String, dynamic>{});
    if (cue.isEmpty) return;
    final cueCenter = Offset(
      (cue['x'] as num).toDouble() * _boardSize.width,
      (cue['y'] as num).toDouble() * _boardSize.height,
    );
    final angle = math.atan2(_aim!.dy - cueCenter.dy, _aim!.dx - cueCenter.dx);
    GameFeedback.hit();
    widget.onAction('shoot', {'angle': angle, 'power': _power});
    setState(() => _aim = null);
  }

  @override
  Widget build(BuildContext context) {
    final foul = b['foul'] == true;
    final groups = (b['groups'] as List?) ?? const [];
    final myGroup = widget.mySeat < groups.length ? groups[widget.mySeat] : '';
    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress
              ? _simulating
                  ? 'Balls rolling…'
                  : _myTurn
                      ? 'Your shot'
                      : 'Opponent is shooting…'
              : 'Game over',
          highlight: _myTurn && !_simulating,
          icon: Icons.sports_esports,
        ),
        const SizedBox(height: 6),
        if (myGroup != null && myGroup != '')
          Text('You are ${myGroup == 'solid' ? 'solids ●' : 'stripes ◍'}',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
        if (foul)
          const Text('Foul! Ball in hand',
              style: TextStyle(color: AppColors.warning, fontSize: 12, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        TableSurface(
          padding: const EdgeInsets.all(8),
          child: AspectRatio(
            aspectRatio: 1,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final size = constraints.biggest;
                _boardSize = size;
                return GestureDetector(
                  onPanDown: _myTurn && !_simulating ? (d) => setState(() => _aim = d.localPosition) : null,
                  onPanUpdate: _myTurn && !_simulating ? (d) => setState(() => _aim = d.localPosition) : null,
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFF0E5A3C),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: const Color(0xFF5A3A20), width: 10),
                    ),
                    child: Stack(
                      children: [
                        // Pockets.
                        for (final p in const [[0.06, 0.08], [0.5, 0.04], [0.94, 0.08], [0.06, 0.92], [0.5, 0.96], [0.94, 0.92]])
                          Positioned(
                            left: p[0] * size.width - 16,
                            top: p[1] * size.height - 16,
                            child: Container(width: 32, height: 32,
                                decoration: const BoxDecoration(color: Colors.black, shape: BoxShape.circle)),
                          ),
                        // Balls.
                        for (final ball in _balls)
                          if (ball['active'] == true)
                            Positioned(
                              left: (ball['x'] as num).toDouble() * size.width - 10,
                              top: (ball['y'] as num).toDouble() * size.height - 10,
                              child: _BallDot(color: _ballColor(ball), id: (ball['id'] as num).toInt(),
                                  isCue: ball['group'] == 'cue'),
                            ),
                        // Aim line.
                        if (_aim != null && _myTurn && !_simulating)
                          CustomPaint(size: size, painter: _AimPainter(aim: _aim!, balls: _balls, boardSize: size)),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 10),
        if (_myTurn && !_simulating) ...[
          Row(
            children: [
              const Text('Power', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              Expanded(
                child: Slider(
                  value: _power,
                  min: 0.3,
                  max: 1,
                  activeColor: AppColors.softCyan,
                  onChanged: (v) => setState(() => _power = v),
                  onChangeEnd: (_) => GameFeedback.tap(),
                ),
              ),
            ],
          ),
          ActionButton(
            label: 'Shoot',
            icon: Icons.bolt,
            onPressed: _aim == null ? null : _shoot,
          ),
        ],
      ],
    );
  }
}

class _AimPainter extends CustomPainter {
  _AimPainter({required this.aim, required this.balls, required this.boardSize});
  final Offset aim;
  final List<Map<String, dynamic>> balls;
  final Size boardSize;

  @override
  void paint(Canvas canvas, Size size) {
    final cue = balls.firstWhere((x) => (x['group'] as String?) == 'cue', orElse: () => <String, dynamic>{});
    if (cue.isEmpty) return;
    final cueCenter = Offset((cue['x'] as num).toDouble() * size.width, (cue['y'] as num).toDouble() * size.height);
    final paint = Paint()
      ..color = AppColors.softCyan.withOpacity(0.7)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    canvas.drawLine(cueCenter, aim, paint);
  }

  @override
  bool shouldRepaint(_AimPainter old) => old.aim != aim;
}

class _BallDot extends StatelessWidget {
  const _BallDot({required this.color, required this.id, required this.isCue});
  final Color color;
  final int id;
  final bool isCue;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white24, width: 1),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.4), blurRadius: 3)],
      ),
      alignment: Alignment.center,
      child: isCue
          ? null
          : Container(
              width: 9,
              height: 9,
              decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
              child: FittedBox(
                child: Text('$id',
                    style: const TextStyle(color: Colors.black, fontWeight: FontWeight.bold, fontSize: 7)),
              ),
            ),
    );
  }
}
