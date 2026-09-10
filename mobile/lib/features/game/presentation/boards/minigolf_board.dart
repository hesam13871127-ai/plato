import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

class _Box {
  const _Box(this.x, this.y, this.w, this.h);
  final double x;
  final double y;
  final double w;
  final double h;
}

class _Hole {
  const _Hole(this.name, this.tee, this.cup, this.walls);
  final String name;
  final Offset tee;
  final Offset cup;
  final List<_Box> walls;
}

const _kHoles = [
  _Hole('The Opener', Offset(12, 30), Offset(88, 30), []),
  _Hole('The Wall', Offset(10, 30), Offset(90, 30), [_Box(45, 18, 10, 24)]),
  _Hole('Dogleg', Offset(10, 52), Offset(90, 10), [_Box(30, 0, 14, 40)]),
  _Hole('Double Gate', Offset(10, 30), Offset(90, 30), [_Box(45, 0, 8, 22), _Box(45, 38, 8, 22)]),
  _Hole('The S', Offset(10, 30), Offset(90, 10), [_Box(35, 0, 30, 14), _Box(55, 46, 30, 14)]),
  _Hole('Pinball', Offset(12, 30), Offset(88, 30), [_Box(40, 20, 20, 20)]),
  _Hole('Long Corner', Offset(12, 12), Offset(88, 48), [_Box(50, 0, 14, 38), _Box(50, 44, 14, 16)]),
  _Hole('The Island', Offset(10, 30), Offset(70, 30),
      [_Box(63, 12, 14, 8), _Box(63, 40, 14, 8), _Box(60, 20, 5, 20), _Box(78, 20, 5, 20)]),
  _Hole('The Gauntlet', Offset(8, 30), Offset(92, 30), [
    _Box(28, 0, 8, 38),
    _Box(28, 44, 8, 16),
    _Box(55, 22, 8, 16),
    _Box(75, 0, 8, 38),
    _Box(75, 44, 8, 16),
  ]),
];

/// Parsed mini-golf view.
class _GolfView {
  _GolfView(Map<String, dynamic> b)
      : hole = ((b['hole'] as num?)?.toInt() ?? 0).clamp(0, 8),
        ball = _offset(b['ball']),
        strokes = _strokes(b['strokes']),
        holeStrokes = (b['holeStrokes'] as num?)?.toInt() ?? 0,
        lastShot = _shot(b['lastShot']);

  final int hole;
  final Offset ball;
  final List<List<int>> strokes;
  final int holeStrokes;
  final _Shot? lastShot;

  static Offset _offset(Object? raw) {
    final m = raw as Map?;
    if (m == null) return _kHoles[0].tee;
    return Offset((m['x'] as num?)?.toDouble() ?? 0, (m['y'] as num?)?.toDouble() ?? 0);
  }

  static List<List<int>> _strokes(Object? raw) => ((raw as List?) ?? const [])
      .whereType<List>()
      .map((h) => h.whereType<num>().map((n) => n.toInt()).toList())
      .toList();

  static _Shot? _shot(Object? raw) {
    if (raw == null) return null;
    final m = raw as Map;
    final frames = ((m['frames'] as List?) ?? const [])
        .whereType<List>()
        .map((f) {
          final nums = f.whereType<num>().toList();
          return Offset(
            nums.isNotEmpty ? nums.first.toDouble() : 0,
            nums.length > 1 ? nums[1].toDouble() : 0,
          );
        })
        .toList();
    return _Shot(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['hole'] as num?)?.toInt() ?? 0,
      (m['holed'] as bool?) ?? false,
      frames,
    );
  }
}

class _Shot {
  const _Shot(this.seat, this.hole, this.holed, this.frames);
  final int seat;
  final int hole;
  final bool holed;
  final List<Offset> frames;
}

/// Mini Golf, wave-5 board.
///
/// A top-down green with walls, blocks and the flag. Tap ahead of the ball to
/// set the line, hold the power slider, and watch the roll replay.
class MinigolfBoard extends StatefulWidget {
  const MinigolfBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<MinigolfBoard> createState() => _MinigolfBoardState();
}

class _MinigolfBoardState extends State<MinigolfBoard> {
  String _skin = 'wood';
  double _angle = 0;
  double _power = 0.6;

  _GolfView get _view => _GolfView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  Future<void> _stroke() async {
    if (!_myTurn) return;
    GameFeedback.tap();
    await widget.onAction('stroke', {
      'angle': _angle.toStringAsFixed(4),
      'power': _power.toStringAsFixed(3),
    });
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view),
          highlight: _myTurn,
          icon: Icons.sports_golf_rounded,
        ),
        const SizedBox(height: 8),
        BoardSkinRow(
          selected: _skin,
          onPick: (id) {
            GameFeedback.tap();
            setState(() => _skin = id);
          },
        ),
        const SizedBox(height: 10),
        TableSurface(
          skin: skin,
          child: Column(
            children: [
              _scoreRow(view),
              const SizedBox(height: 10),
              AspectRatio(
                aspectRatio: 100 / 60,
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Color.lerp(skin.edge, Colors.white, 0.1)!,
                        skin.edge,
                        Color.lerp(skin.edge, Colors.black, 0.5)!,
                      ],
                    ),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 14, offset: const Offset(0, 6)),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final size = constraints.biggest;
                        return GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTapUp: (d) {
                            if (!_myTurn) return;
                            GameFeedback.tap();
                            final p = Offset(
                              d.localPosition.dx / size.width * 100,
                              d.localPosition.dy / size.height * 60,
                            );
                            final dx = p.dx - view.ball.dx;
                            final dy = p.dy - view.ball.dy;
                            if (dx.abs() + dy.abs() < 1) return;
                            setState(() {
                              _angle = math.atan2(dy, dx);
                            });
                          },
                          child: CustomPaint(
                            size: Size.infinite,
                            painter: _GolfPainter(
                              hole: _kHoles[view.hole],
                              ball: view.ball,
                              aim: _myTurn ? _angle : null,
                              trail: view.lastShot?.frames ?? const <Offset>[],
                              lastHoled: view.lastShot?.holed ?? false,
                              mySeat: widget.mySeat,
                              activeSeat: widget.session.currentSeat,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              _controls(view),
            ],
          ),
        ),
      ],
    );
  }

  Widget _controls(_GolfView view) {
    final canStroke = _myTurn;
    return Column(
      children: [
        Row(
          children: [
            const Text('POWER', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.w800)),
            Expanded(
              child: Slider(
                value: _power,
                min: 0.15,
                max: 1,
                activeColor: AppColors.electricPurple,
                onChanged: canStroke ? (v) => setState(() => _power = v) : null,
              ),
            ),
            Text(
              '${(_power * 100).round()}%',
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
              ),
              child: Text(
                'Stroke ${view.holeStrokes + (canStroke ? 1 : 0)}/6',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ElevatedButton(
                onPressed: canStroke ? _stroke : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: canStroke ? AppColors.electricPurple : Colors.white.withValues(alpha: 0.08),
                  foregroundColor: Colors.white,
                  disabledForegroundColor: Colors.white38,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: Text(
                  canStroke ? 'STROKE' : 'WAITING…',
                  style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.2, fontSize: 13),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _scoreRow(_GolfView view) {
    return Wrap(
      spacing: 8,
      runSpacing: 6,
      alignment: WrapAlignment.center,
      children: [
        for (var seat = 0; seat < widget.session.seats.length; seat++)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: widget.session.currentSeat == seat && widget.session.isInProgress
                  ? AppColors.electricPurple.withValues(alpha: 0.3)
                  : Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: widget.session.currentSeat == seat && widget.session.isInProgress
                    ? AppColors.softCyan
                    : Colors.white.withValues(alpha: 0.12),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _seatLabel(seat),
                  style: TextStyle(
                    color: seat == widget.mySeat ? AppColors.softCyan : AppColors.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '${widget.session.scores.length > seat ? widget.session.scores[seat] : 0}',
                  style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900),
                ),
              ],
            ),
          ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            'Hole ${view.hole + 1}/9 · ${_kHoles[view.hole].name}',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }

  String _statusText(_GolfView view) {
    if (!widget.session.isInProgress) {
      final winners = widget.session.winnerSeats ?? const <int>[];
      final won = widget.session.winnerSeat == widget.mySeat || winners.contains(widget.mySeat);
      if (winners.length > 1) return 'Halved — a perfect match';
      return won ? 'Club champion — fewest strokes!' : 'They out-putted you…';
    }
    if (!_myTurn) return 'Watching their round…';
    final last = view.lastShot;
    if (last != null && last.seat == widget.mySeat) {
      if (last.holed) return 'In the cup! 🏌️';
      return 'Roll on — set up the next stroke';
    }
    return 'Tap ahead of the ball to aim';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

// ── painter ─────────────────────────────────────────────────────────────────

class _GolfPainter extends CustomPainter {
  _GolfPainter({
    required this.hole,
    required this.ball,
    required this.aim,
    required this.trail,
    required this.lastHoled,
    required this.mySeat,
    required this.activeSeat,
  });

  final _Hole hole;
  final Offset ball;
  final double? aim;
  final List<Offset> trail;
  final bool lastHoled;
  final int mySeat;
  final int activeSeat;

  @override
  void paint(Canvas canvas, Size size) {
    final sx = size.width / 100;
    final sy = size.height / 60;
    Offset project(Offset p) => Offset(p.dx * sx, p.dy * sy);

    // Felt.
    final felt = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [const Color(0xFF2E7D46), const Color(0xFF1B5E33), const Color(0xFF144527)],
      ).createShader(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, felt);

    // Mow stripes.
    final stripe = Paint()..color = Colors.white.withValues(alpha: 0.03);
    for (var i = 0; i < 10; i++) {
      if (i.isEven) canvas.drawRect(Rect.fromLTWH(i * size.width / 10, 0, size.width / 10, size.height), stripe);
    }

    // Course border.
    final border = Paint()
      ..color = const Color(0xFF5D4037)
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke;
    canvas.drawRect(Rect.fromLTWH(2, 2, size.width - 4, size.height - 4), border);

    // Blocks.
    for (final w in hole.walls) {
      final r = Rect.fromLTWH(w.x * sx, w.y * sy, w.w * sx, w.h * sy);
      canvas.drawRRect(
        RRect.fromRectAndRadius(r.deflate(1), const Radius.circular(2)),
        Paint()..color = const Color(0xFF8D6E63),
      );
      canvas.drawRRect(
        RRect.fromRectAndRadius(r.deflate(3), const Radius.circular(2)),
        Paint()..color = const Color(0xFF6D4C41),
      );
    }

    // Cup + flag.
    final cup = project(hole.cup);
    canvas.drawCircle(cup, 5, Paint()..color = const Color(0xFF0B1F12));
    canvas.drawCircle(cup, 5, Paint()..color = Colors.white.withValues(alpha: 0.2)..strokeWidth = 1..style = PaintingStyle.stroke);
    canvas.drawLine(cup, cup + const Offset(0, -22), Paint()..color = Colors.white70..strokeWidth = 1.5);
    final flag = Path()
      ..moveTo(cup.dx, cup.dy - 22)
      ..lineTo(cup.dx + 12, cup.dy - 18)
      ..lineTo(cup.dx, cup.dy - 14)
      ..close();
    canvas.drawPath(flag, Paint()..color = AppColors.danger);

    // Tee marker.
    final tee = project(hole.tee);
    canvas.drawCircle(tee, 3.5, Paint()..color = Colors.white.withValues(alpha: 0.25));

    // Last shot trail.
    if (trail.length > 1) {
      final trailPaint = Paint()
        ..color = (activeSeat == mySeat ? AppColors.softCyan : const Color(0xFFFACC15)).withValues(alpha: 0.55)
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round;
      for (var i = 1; i < trail.length; i++) {
        canvas.drawLine(project(trail[i - 1]), project(trail[i]), trailPaint);
      }
    }

    // Aim line.
    final a = aim;
    if (a != null) {
      final from = project(ball);
      final len = 24.0;
      final to = from + Offset(math.cos(a) * len * sx, math.sin(a) * len * sy);
      final aimPaint = Paint()
        ..color = AppColors.softCyan.withValues(alpha: 0.8)
        ..strokeWidth = 1.6;
      canvas.drawLine(from, to, aimPaint);
      canvas.drawCircle(to, 3, Paint()..color = AppColors.softCyan.withValues(alpha: 0.35));
    }

    // Ball.
    final bp = project(ball);
    canvas.drawCircle(bp + const Offset(1, 1.5), 4, Paint()..color = Colors.black.withValues(alpha: 0.4));
    final ballPaint = Paint()..shader = RadialGradient(
      colors: [Colors.white, const Color(0xFFD7D7D7)],
    ).createShader(Rect.fromCircle(center: bp, radius: 4));
    canvas.drawCircle(bp, 4, ballPaint);
    if (lastHoled) {
      final tp = TextPainter(
        text: const TextSpan(text: 'IN!  🏌️', style: TextStyle(color: Color(0xFF9BE8B0), fontSize: 12, fontWeight: FontWeight.w900)),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, project(hole.cup) + const Offset(6, -40));
    }
  }

  @override
  bool shouldRepaint(covariant _GolfPainter old) =>
      old.ball != ball || old.aim != aim || old.trail.length != trail.length || old.hole != hole;
}
