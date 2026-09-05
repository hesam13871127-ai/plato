import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Carrom: flick the striker at your coloured coins (and the red queen). On
/// your turn, drag to aim and fire with a power slider; the server runs the
/// physics. Pieces come from the redacted `pieces` list.
class CarromBoard extends StatefulWidget {
  const CarromBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<CarromBoard> createState() => _CarromBoardState();
}

class _CarromBoardState extends State<CarromBoard> {
  Offset? _aim;
  Size _boardSize = Size.zero;
  double _power = 0.75;

  Map<String, dynamic> get b => widget.session.board;

  List<Map<String, dynamic>> get _pieces =>
      ((b['pieces'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  bool get _myTurn {
    final turn = (b['turnSeat'] as num?)?.toInt() ?? widget.session.currentSeat;
    return widget.session.isInProgress && turn == widget.mySeat;
  }

  bool get _simulating => (b['phase'] as String?) == 'sim';

  Color _pieceColor(String c) {
    switch (c) {
      case 'white':
        return const Color(0xFFF4F0E6);
      case 'black':
        return const Color(0xFF2B2B33);
      case 'queen':
        return const Color(0xFFD64545);
      default:
        return AppColors.electricPurple;
    }
  }

  void _strike() {
    if (_aim == null) return;
    final striker = _pieces.firstWhere((x) => x['color'] == 'striker', orElse: () => <String, dynamic>{});
    if (striker.isEmpty) return;
    final center = Offset(
      (striker['x'] as num).toDouble() * _boardSize.width,
      (striker['y'] as num).toDouble() * _boardSize.height,
    );
    final angle = math.atan2(_aim!.dy - center.dy, _aim!.dx - center.dx);
    GameFeedback.hit();
    widget.onAction('strike', {'angle': angle, 'power': _power});
    setState(() => _aim = null);
  }

  @override
  Widget build(BuildContext context) {
    final colors = (b['colors'] as List?) ?? const [];
    final myColor = widget.mySeat < colors.length ? colors[widget.mySeat] : '';
    final foul = b['foul'] == true;
    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress
              ? _simulating
                  ? 'Coins sliding…'
                  : _myTurn
                      ? 'Your flick'
                      : 'Opponent is flicking…'
              : 'Game over',
          highlight: _myTurn && !_simulating,
          icon: Icons.adjust,
        ),
        const SizedBox(height: 6),
        Text('You are $myColor coins',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
        if (b['queenCovered'] == true)
          const Text('Queen covered ♛', style: TextStyle(color: AppColors.warning, fontSize: 12)),
        if (foul)
          const Text('Foul — striker pocketed!',
              style: TextStyle(color: AppColors.danger, fontSize: 12, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        TableSurface(
          padding: const EdgeInsets.all(8),
          child: AspectRatio(
            aspectRatio: 1,
            child: LayoutBuilder(
              builder: (context, constraints) {
                _boardSize = constraints.biggest;
                final size = constraints.biggest;
                return GestureDetector(
                  onPanDown: _myTurn && !_simulating ? (d) => setState(() => _aim = d.localPosition) : null,
                  onPanUpdate: _myTurn && !_simulating ? (d) => setState(() => _aim = d.localPosition) : null,
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFFC9954B),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: const Color(0xFF6E451F), width: 12),
                    ),
                    child: Stack(
                      children: [
                        // centre + pocket circles
                        Center(
                          child: Container(
                            width: 90,
                            height: 90,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: const Color(0xFFB57F3B),
                              border: Border.all(color: const Color(0xFF8A5E26), width: 3),
                            ),
                          ),
                        ),
                        for (final p in const [[0.09, 0.09], [0.91, 0.09], [0.09, 0.91], [0.91, 0.91]])
                          Positioned(
                            left: p[0] * size.width - 20,
                            top: p[1] * size.height - 20,
                            child: Container(width: 40, height: 40,
                                decoration: BoxDecoration(color: Colors.black87, shape: BoxShape.circle,
                                    border: Border.all(color: const Color(0xFF6E451F), width: 4))),
                          ),
                        for (final pc in _pieces)
                          if (pc['active'] == true)
                            Positioned(
                              left: (pc['x'] as num).toDouble() * size.width - (pc['color'] == 'striker' ? 14 : 12),
                              top: (pc['y'] as num).toDouble() * size.height - (pc['color'] == 'striker' ? 14 : 12),
                              child: _Coin(
                                color: _pieceColor(pc['color'] as String? ?? 'white'),
                                size: pc['color'] == 'striker' ? 28 : 24,
                                isStriker: pc['color'] == 'striker',
                              ),
                            ),
                        if (_aim != null && _myTurn && !_simulating)
                          CustomPaint(size: size, painter: _AimLine(aim: _aim!, pieces: _pieces, size: size)),
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
                  min: 0.4,
                  max: 1,
                  activeColor: AppColors.softCyan,
                  onChanged: (v) => setState(() => _power = v),
                  onChangeEnd: (_) => GameFeedback.tap(),
                ),
              ),
            ],
          ),
          ActionButton(label: 'Flick', icon: Icons.touch_app, onPressed: _aim == null ? null : _strike),
        ],
      ],
    );
  }
}

class _AimLine extends CustomPainter {
  _AimLine({required this.aim, required this.pieces, required this.size});
  final Offset aim;
  final List<Map<String, dynamic>> pieces;
  final Size size;

  @override
  void paint(Canvas canvas, Size s) {
    final striker = pieces.firstWhere((x) => x['color'] == 'striker', orElse: () => <String, dynamic>{});
    if (striker.isEmpty) return;
    final c = Offset((striker['x'] as num).toDouble() * s.width, (striker['y'] as num).toDouble() * s.height);
    final paint = Paint()
      ..color = AppColors.softCyan.withOpacity(0.8)
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;
    canvas.drawLine(c, aim, paint);
  }

  @override
  bool shouldRepaint(_AimLine old) => old.aim != aim;
}

class _Coin extends StatelessWidget {
  const _Coin({required this.color, required this.size, required this.isStriker});
  final Color color;
  final double size;
  final bool isStriker;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(
            color: isStriker ? AppColors.softCyan : const Color(0x66000000), width: isStriker ? 2 : 1),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius: 3)],
      ),
    );
  }
}
