import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed darts view.
class _DartsView {
  _DartsView(Map<String, dynamic> b)
      : round = (b['round'] as num?)?.toInt() ?? 1,
        dartsLeft = (b['dartsLeft'] as num?)?.toInt() ?? 3,
        throws = _throws(b['throws']),
        lastThrow = _throw(b['lastThrow']);

  final int round;
  final int dartsLeft;
  final List<_Dart> throws;
  final _Dart? lastThrow;

  static List<_Dart> _throws(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map(_fromMap)
      .toList();

  static _Dart? _throw(Object? raw) {
    if (raw == null) return null;
    return _fromMap(raw as Map);
  }

  static _Dart _fromMap(Map m) {
    final aim = ((m['aim'] as List?) ?? const []).whereType<num>().map((n) => n.toDouble()).toList();
    final landing = ((m['landing'] as List?) ?? const []).whereType<num>().map((n) => n.toDouble()).toList();
    return _Dart(
      (m['seat'] as num?)?.toInt() ?? 0,
      aim.length >= 2 ? Offset(aim[0], aim[1]) : Offset.zero,
      landing.length >= 2 ? Offset(landing[0], landing[1]) : Offset.zero,
      (m['points'] as num?)?.toInt() ?? 0,
      (m['label'] as String?) ?? '',
    );
  }
}

class _Dart {
  const _Dart(this.seat, this.aim, this.landing, this.points, this.label);
  final int seat;
  final Offset aim;
  final Offset landing;
  final int points;
  final String label;
}

/// Darts, wave-5 3D board.
///
/// A regulation clock board — twenty numbered segments, doubles and trebles
/// rings, red-and-green bull. Drag on the board to aim, hold the power
/// slider, and let it fly; darts stick where they land.
class DartsBoard extends StatefulWidget {
  const DartsBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<DartsBoard> createState() => _DartsBoardState();
}

class _DartsBoardState extends State<DartsBoard> {
  String _skin = 'wood';
  Offset _aim = const Offset(0, 0.57);
  double _power = 0.9;

  _DartsView get _view => _DartsView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  static const _segments = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

  Future<void> _throwDart() async {
    if (!_myTurn) return;
    GameFeedback.tap();
    await widget.onAction('throw', {
      'aimX': _aim.dx.toStringAsFixed(3),
      'aimY': _aim.dy.toStringAsFixed(3),
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
          icon: Icons.my_location_rounded,
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
              _scoreRow(),
              const SizedBox(height: 10),
              AspectRatio(
                aspectRatio: 1,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Color.lerp(skin.edge, Colors.white, 0.12)!,
                        skin.edge,
                        Color.lerp(skin.edge, Colors.black, 0.5)!,
                      ],
                    ),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 16, offset: const Offset(0, 8)),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(13),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final size = constraints.biggest;
                        return GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTapUp: (d) {
                            if (!_myTurn) return;
                            GameFeedback.tap();
                            setState(() {
                              _aim = Offset(
                                (d.localPosition.dx / size.width * 2 - 1).clamp(-1.0, 1.0),
                                (d.localPosition.dy / size.height * 2 - 1).clamp(-1.0, 1.0),
                              );
                            });
                          },
                          child: CustomPaint(
                            size: Size.infinite,
                            painter: _DartsPainter(
                              aim: _myTurn ? _aim : null,
                              throws: view.throws,
                              lastThrow: view.lastThrow,
                              mySeat: widget.mySeat,
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

  Widget _controls(_DartsView view) {
    final canThrow = _myTurn;
    return Column(
      children: [
        Row(
          children: [
            const Text('POWER', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.w800)),
            Expanded(
              child: Slider(
                value: _power,
                min: 0.2,
                max: 1,
                activeColor: AppColors.electricPurple,
                onChanged: canThrow ? (v) => setState(() => _power = v) : null,
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
            _dartSlot(3 - view.dartsLeft, 'thrown'),
            const SizedBox(width: 8),
            _dartSlot(view.dartsLeft, 'left'),
            const SizedBox(width: 8),
            Expanded(
              child: ElevatedButton(
                onPressed: canThrow ? _throwDart : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: canThrow ? AppColors.electricPurple : Colors.white.withValues(alpha: 0.08),
                  foregroundColor: Colors.white,
                  disabledForegroundColor: Colors.white38,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: Text(
                  canThrow ? 'THROW' : 'WAITING…',
                  style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.2, fontSize: 13),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _dartSlot(int count, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
          for (var i = 0; i < 3; i++)
            Padding(
              padding: const EdgeInsets.only(right: 3),
              child: Icon(
                i < count ? Icons.colorize_rounded : Icons.colorize_outlined,
                size: 14,
                color: i < count ? AppColors.softCyan : Colors.white24,
              ),
            ),
          const SizedBox(width: 2),
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
        ],
      ),
    );
  }

  Widget _scoreRow() {
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
            'Round ${_view.round}/5',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }

  String _statusText(_DartsView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == null) return 'Dead heat at the oche';
      return widget.session.winnerSeat == widget.mySeat ? 'Game shot — you win!' : 'They out-threw you…';
    }
    if (!_myTurn) return 'Waiting for their darts…';
    final last = view.lastThrow;
    if (last != null && last.seat == widget.mySeat) {
      return last.points > 0 ? '${last.label} — ${last.points} points!' : 'Off the board!';
    }
    return 'Tap the board to aim, then throw';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

// ── painter ─────────────────────────────────────────────────────────────────

class _DartsPainter extends CustomPainter {
  _DartsPainter({
    required this.aim,
    required this.throws,
    required this.lastThrow,
    required this.mySeat,
  });

  final Offset? aim;
  final List<_Dart> throws;
  final _Dart? lastThrow;
  final int mySeat;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final c = Offset(w / 2, h / 2);
    final boardR = math.min(w, h) * 0.47;

    Offset project(Offset p) => Offset(c.dx + p.dx * boardR, c.dy - p.dy * boardR);

    // Surround (the black ring with numbers).
    final surround = Paint()..color = const Color(0xFF14121A);
    canvas.drawCircle(c, boardR * 1.06, surround);
    final rim = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..color = const Color(0xFF3A3444);
    canvas.drawCircle(c, boardR * 1.06, rim);

    // Sisal board.
    canvas.drawCircle(c, boardR, Paint()..color = const Color(0xFF2A2620));

    // Segment slices: wedge ∩ annulus.
    void slice(int segIndex, double r0, double r1, bool inner) {
      final startDeg = segIndex * 18.0 - 99; // 20 at top, 9° offset
      final outer = Path()..addOval(Rect.fromCircle(center: c, radius: r1));
      final innerCircle = Path()..addOval(Rect.fromCircle(center: c, radius: r0));
      final annulus = Path.combine(PathOperation.difference, outer, innerCircle);
      final wedge = Path()..moveTo(c.dx, c.dy);
      wedge.arcTo(Rect.fromCircle(center: c, radius: r1), startDeg * math.pi / 180, 18 * math.pi / 180, false);
      wedge.close();
      final segPath = Path.combine(PathOperation.intersect, annulus, wedge);
      final seg = _segments[segIndex % 20];
      final even = segIndex % 2 == 0;
      final color = inner
          ? (even ? const Color(0xFF1E3A8A) : const Color(0xFFEDE3D2))
          : (even ? const Color(0xFFDC2626) : const Color(0xFFEDE3D2));
      canvas.drawPath(segPath, Paint()..color = color);
    }

    for (var i = 0; i < 20; i++) {
      slice(i, boardR * 0.12, boardR * 0.52, true); // inner singles
      slice(i, boardR * 0.52, boardR * 0.62, false); // trebles
      slice(i, boardR * 0.62, boardR * 0.88, true); // outer singles
      slice(i, boardR * 0.88, boardR * 1.0, false); // doubles
    }

    // Bulls.
    canvas.drawCircle(c, boardR * 0.12, Paint()..color = const Color(0xFF1E7A34));
    canvas.drawCircle(c, boardR * 0.06, Paint()..color = const Color(0xFFDC2626));

    // Numbers around the board.
    for (var i = 0; i < 20; i++) {
      final angle = (i * 18.0 - 90) * math.pi / 180;
      final np = Offset(
        c.dx + math.cos(angle) * boardR * 1.03,
        c.dy + math.sin(angle) * boardR * 1.03,
      );
      final tp = TextPainter(
        text: TextSpan(
          text: '${_segments[i]}',
          style: const TextStyle(color: Color(0xFFE8E2D6), fontSize: 11, fontWeight: FontWeight.w800),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, np - Offset(tp.width / 2, tp.height / 2));
    }

    // Wire lines between segments (subtle).
    final wire = Paint()
      ..color = Colors.white.withValues(alpha: 0.10)
      ..strokeWidth = 0.7
      ..style = PaintingStyle.stroke;
    for (var i = 0; i < 20; i++) {
      final angle = (i * 18.0 - 99) * math.pi / 180;
      canvas.drawLine(
        c + Offset(math.cos(angle) * boardR * 0.12, math.sin(angle) * boardR * 0.12),
        c + Offset(math.cos(angle) * boardR, math.sin(angle) * boardR),
        wire,
      );
    }
    for (final r in [0.12, 0.52, 0.62, 0.88, 1.0]) {
      canvas.drawCircle(c, boardR * r, wire);
    }

    // Aim reticle.
    final a = aim;
    if (a != null) {
      final ap = project(a);
      final reticle = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..color = AppColors.softCyan;
      canvas.drawCircle(ap, 8, reticle);
      canvas.drawLine(ap - const Offset(12, 0), ap + const Offset(12, 0), reticle);
      canvas.drawLine(ap - const Offset(0, 12), ap + const Offset(0, 12), reticle);
    }

    // Stuck darts.
    for (final t in throws) {
      final p = project(t.landing);
      final mine = t.seat == mySeat;
      final flight = Paint()..color = mine ? AppColors.softCyan : const Color(0xFFFACC15);
      canvas.drawLine(
        p,
        p + const Offset(4, -12),
        Paint()
          ..color = Colors.white70
          ..strokeWidth = 1.5,
      );
      canvas.drawCircle(p, 2.6, Paint()..color = const Color(0xFFDC2626));
      canvas.drawCircle(p + const Offset(4, -12), 3.2, flight);
    }
  }

  @override
  bool shouldRepaint(covariant _DartsPainter old) =>
      old.aim != aim || old.throws.length != throws.length || old.lastThrow != lastThrow;
}
