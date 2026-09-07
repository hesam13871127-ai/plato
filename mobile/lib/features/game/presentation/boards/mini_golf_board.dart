import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Mini Golf — a top-down putting green drawn from the hole layout (walls,
/// sand traps, round bumpers, the cup with its flag). Drag back from your ball
/// to aim and load power (an arrow shows the line), release to putt. The ball
/// rolls along the path the server simulated, thumping on walls and dropping
/// into the cup with a flag wiggle. A nine-hole scorecard tracks everyone.
class MiniGolfBoard extends StatefulWidget {
  const MiniGolfBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<MiniGolfBoard> createState() => _MiniGolfBoardState();
}

class _MiniGolfBoardState extends State<MiniGolfBoard> with SingleTickerProviderStateMixin {
  late final AnimationController _roll = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));
  Offset? _drag;
  bool _busy = false;
  Map<String, dynamic>? _anim; // shot being replayed
  List<Offset> _path = const [];
  String? _lastShotKey;
  int _lastHole = -1;

  Map<String, dynamic> get b => widget.session.board;
  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;
  Map<String, dynamic> get _layout => b['layout'] is Map ? Map<String, dynamic>.from(b['layout'] as Map) : const {};
  double get _courseW => ((b['course'] as Map?)?['width'] as num?)?.toDouble() ?? 1.0;
  double get _courseH => ((b['course'] as Map?)?['height'] as num?)?.toDouble() ?? 1.5;
  List<Map<String, dynamic>> get _players => ((b['players'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  @override
  void initState() {
    super.initState();
    _roll.addStatusListener((s) {
      if (s == AnimationStatus.completed) {
        if (_anim?['holed'] == true) GameFeedback.hit();
        setState(() => _anim = null);
      }
    });
  }

  @override
  void dispose() {
    _roll.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant MiniGolfBoard old) {
    super.didUpdateWidget(old);
    final hole = (b['hole'] as num?)?.toInt() ?? 0;
    if (hole != _lastHole) {
      _lastHole = hole;
      _anim = null;
      if (hole > 0) GameFeedback.roll();
    }
    final shot = b['lastShot'];
    if (shot is Map) {
      final key = '$hole-${shot['seat']}-${shot['strokes']}-${(shot['path'] as List?)?.length}';
      if (key != _lastShotKey) {
        _lastShotKey = key;
        final s = Map<String, dynamic>.from(shot);
        final pts = ((s['path'] as List?) ?? const []).whereType<List>().where((p) => p.length >= 2).map((p) => Offset((p[0] as num).toDouble(), (p[1] as num).toDouble())).toList();
        if (pts.length >= 2) {
          _anim = s;
          _path = pts;
          _roll.duration = Duration(milliseconds: (500 + pts.length * 9).clamp(600, 2400));
          _roll.forward(from: 0);
          if ((s['bumps'] as num?) != null && (s['bumps'] as num) > 0) GameFeedback.tap();
        }
      }
    }
  }

  Future<void> _putt() async {
    final d = _drag;
    if (d == null || !_myTurn || _busy) return;
    if (d.distance < 8) {
      setState(() => _drag = null);
      return;
    }
    final power = (d.distance / 150).clamp(0.05, 1.0);
    // Ball travels opposite to the drag; screen +y is course +y (top-down).
    final angle = math.atan2(-d.dy, -d.dx);
    setState(() {
      _busy = true;
      _drag = null;
    });
    GameFeedback.move();
    await widget.onAction('putt', {'angle': angle, 'power': power});
    if (mounted) setState(() => _busy = false);
  }

  Offset _ballPosAt(double t) {
    if (_path.length < 2) return _path.isEmpty ? Offset.zero : _path.first;
    final eased = Curves.easeOutCubic.transform(t);
    final f = eased * (_path.length - 1);
    final i = f.floor().clamp(0, _path.length - 2);
    final frac = f - i;
    return Offset.lerp(_path[i], _path[i + 1], frac)!;
  }

  @override
  Widget build(BuildContext context) {
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final seats = widget.session.seats;
    final players = _players;
    final layout = _layout;
    final hole = (b['hole'] as num?)?.toInt() ?? 0;
    final holeCount = (b['holeCount'] as num?)?.toInt() ?? 9;
    final par = (layout['par'] as num?)?.toInt() ?? 3;
    final pars = ((b['pars'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    final log = ((b['log'] as List?) ?? const []).map((e) => e.toString()).toList();
    final current = widget.session.currentSeat;
    final me = widget.mySeat >= 0 && widget.mySeat < players.length ? players[widget.mySeat] : null;
    final myStrokes = (me?['strokes'] as num?)?.toInt() ?? 0;
    final maxStrokes = (b['maxStrokes'] as num?)?.toInt() ?? 7;

    String status;
    if (!widget.session.isInProgress) {
      status = 'Round complete';
    } else if (_myTurn) {
      status = _drag == null ? 'Hole ${hole + 1} · par $par · stroke ${myStrokes + 1} — drag back to putt' : 'Release to putt';
    } else {
      final name = current >= 0 && current < seats.length ? seats[current].displayName : 'Opponent';
      status = '$name is putting…';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn, icon: Icons.golf_course_rounded),
        const SizedBox(height: 6),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(8),
          child: Column(
            children: [
              // Hole header.
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(color: AppColors.gold, borderRadius: BorderRadius.circular(10)),
                    child: Text('HOLE ${hole + 1}/$holeCount', style: const TextStyle(color: Color(0xFF1B1B2F), fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1)),
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: Text((layout['name'] as String?) ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w900))),
                  Text('PAR $par', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w800)),
                ],
              ),
              const SizedBox(height: 8),
              AspectRatio(
                aspectRatio: _courseW / _courseH,
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final size = Size(constraints.maxWidth, constraints.maxHeight);
                    Offset toScreen(double x, double y) => Offset(x / _courseW * size.width, y / _courseH * size.height);
                    final ballR = (((b['course'] as Map?)?['ballR'] as num?)?.toDouble() ?? 0.018) / _courseW * size.width;
                    final animSeat = (_anim?['seat'] as num?)?.toInt();
                    return GestureDetector(
                      onPanStart: _myTurn && !_busy && _anim == null ? (d) => setState(() => _drag = Offset.zero) : null,
                      onPanUpdate: _myTurn && !_busy && _anim == null ? (d) => setState(() => _drag = (_drag ?? Offset.zero) + d.delta) : null,
                      onPanEnd: _myTurn && !_busy ? (_) => _putt() : null,
                      onPanCancel: () => setState(() => _drag = null),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Stack(
                          children: [
                            Positioned.fill(child: CustomPaint(painter: _CoursePainter(layout: layout, courseW: _courseW, courseH: _courseH, cupR: (((b['course'] as Map?)?['cupR'] as num?)?.toDouble() ?? 0.036), holedFlag: _anim?['holed'] == true && _roll.value > 0.95))),
                            // Balls (other players faded; the animating ball follows the path).
                            for (var i = 0; i < players.length; i++)
                              if (players[i]['holed'] != true || i == animSeat)
                                AnimatedBuilder(
                                  animation: _roll,
                                  builder: (context, _) {
                                    Offset pos;
                                    if (i == animSeat && _anim != null) {
                                      pos = _ballPosAt(_roll.value);
                                    } else {
                                      pos = Offset((players[i]['x'] as num?)?.toDouble() ?? 0.5, (players[i]['y'] as num?)?.toDouble() ?? 1.3);
                                    }
                                    final sp = toScreen(pos.dx, pos.dy);
                                    final mine = i == widget.mySeat;
                                    final active = i == current || i == animSeat;
                                    final scale = (i == animSeat && _anim?['holed'] == true) ? (1 - Curves.easeIn.transform(((_roll.value - 0.9) / 0.1).clamp(0.0, 1.0))) : 1.0;
                                    return Positioned(
                                      left: sp.dx - ballR * 1.3,
                                      top: sp.dy - ballR * 1.3,
                                      child: Transform.scale(
                                        scale: scale,
                                        child: _GolfBall(size: ballR * 2.6, palette: TableSkins.paletteFor(widget.session, i), dim: !active && !mine, glow: active),
                                      ),
                                    );
                                  },
                                ),
                            // Aim arrow.
                            if (_drag != null && _myTurn && me != null)
                              Positioned.fill(
                                child: IgnorePointer(
                                  child: CustomPaint(
                                    painter: _AimPainter(
                                      ball: toScreen((me['x'] as num?)?.toDouble() ?? 0.5, (me['y'] as num?)?.toDouble() ?? 1.3),
                                      drag: _drag!,
                                      accent: playground.accent,
                                    ),
                                  ),
                                ),
                              ),
                            // Stroke badge.
                            if (me != null && widget.session.isInProgress)
                              Positioned(
                                right: 8,
                                top: 8,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(8)),
                                  child: Text(me['holed'] == true ? 'In!' : 'Strokes $myStrokes / $maxStrokes', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                                ),
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 8),
              // Log line.
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.glassStroke)),
                child: Text(log.isEmpty ? 'Lowest total after nine holes wins.' : log.first, style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        // Scorecard.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: _Scorecard(session: widget.session, players: players, pars: pars, hole: hole, current: current, mySeat: widget.mySeat),
        ),
      ],
    );
  }
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _GolfBall extends StatelessWidget {
  const _GolfBall({required this.size, required this.palette, required this.dim, required this.glow});
  final double size;
  final PiecePalette palette;
  final bool dim;
  final bool glow;

  @override
  Widget build(BuildContext context) {
    final Color tint = palette.base;
    return Opacity(
      opacity: dim ? 0.55 : 1,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(center: const Alignment(-0.35, -0.4), colors: [Colors.white, Color.lerp(Colors.white, tint, 0.35)!, Color.lerp(tint, Colors.black, 0.25)!], stops: const [0, 0.6, 1]),
          border: Border.all(color: Colors.white.withValues(alpha: 0.9), width: 1),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: size * 0.3, offset: Offset(0, size * 0.15)),
            if (glow) BoxShadow(color: tint.withValues(alpha: 0.7), blurRadius: size * 0.6),
          ],
        ),
      ),
    );
  }
}

class _Scorecard extends StatelessWidget {
  const _Scorecard({required this.session, required this.players, required this.pars, required this.hole, required this.current, required this.mySeat});
  final GameSessionView session;
  final List<Map<String, dynamic>> players;
  final List<int> pars;
  final int hole;
  final int current;
  final int mySeat;

  @override
  Widget build(BuildContext context) {
    final holes = pars.length;
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.glassStroke)),
      child: Column(
        children: [
          Row(
            children: [
              const SizedBox(width: 70, child: Text('PAR', style: TextStyle(color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1))),
              for (var h = 0; h < holes; h++)
                Expanded(
                  child: Center(
                    child: Text('${pars[h]}', style: TextStyle(color: h == hole ? AppColors.gold : AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w800)),
                  ),
                ),
              const SizedBox(width: 34, child: Text('TOT', textAlign: TextAlign.right, style: TextStyle(color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1))),
            ],
          ),
          const Divider(height: 10, color: Colors.white12),
          for (var i = 0; i < players.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  SizedBox(
                    width: 70,
                    child: Row(
                      children: [
                        Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: TableSkins.paletteFor(session, i).base)),
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(
                            i == mySeat ? 'You' : (i < session.seats.length ? session.seats[i].displayName : 'Seat $i'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: i == current ? AppColors.gold : AppColors.textPrimary, fontSize: 11, fontWeight: FontWeight.w800),
                          ),
                        ),
                      ],
                    ),
                  ),
                  for (var h = 0; h < holes; h++)
                    Expanded(
                      child: Center(
                        child: _CardCell(
                          strokes: (() {
                            final card = ((players[i]['card'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
                            if (h < card.length) return card[h];
                            if (h == hole && players[i]['holed'] != true) {
                              final s = (players[i]['strokes'] as num?)?.toInt() ?? 0;
                              return s == 0 ? null : -s; // in-progress marker
                            }
                            return null;
                          })(),
                          par: pars[h],
                        ),
                      ),
                    ),
                  SizedBox(
                    width: 34,
                    child: Text('${players[i]['total'] ?? 0}', textAlign: TextAlign.right, style: const TextStyle(color: AppColors.gold, fontSize: 12, fontWeight: FontWeight.w900)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _CardCell extends StatelessWidget {
  const _CardCell({required this.strokes, required this.par});
  final int? strokes; // negative = in progress
  final int par;

  @override
  Widget build(BuildContext context) {
    if (strokes == null) return const Text('·', style: TextStyle(color: AppColors.textMuted, fontSize: 11));
    if (strokes! < 0) return Text('${-strokes!}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700));
    final d = strokes! - par;
    final Color color = d < 0 ? AppColors.success : (d == 0 ? AppColors.textPrimary : (d == 1 ? AppColors.warning : AppColors.coral));
    return Container(
      width: 20,
      height: 20,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: d < 0 ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: d < 0 ? null : BorderRadius.circular(4),
        border: Border.all(color: d == 0 ? Colors.transparent : color, width: 1.2),
      ),
      child: Text('$strokes', style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }
}

// ── Painters ──────────────────────────────────────────────────────────────────

class _CoursePainter extends CustomPainter {
  _CoursePainter({required this.layout, required this.courseW, required this.courseH, required this.cupR, required this.holedFlag});
  final Map<String, dynamic> layout;
  final double courseW;
  final double courseH;
  final double cupR;
  final bool holedFlag;

  @override
  void paint(Canvas canvas, Size size) {
    final sx = size.width / courseW;
    final sy = size.height / courseH;
    // Grass with mown stripes.
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFF2E9B4F));
    final stripe = Paint()..color = Colors.white.withValues(alpha: 0.05);
    final stripeH = size.height / 12;
    for (var i = 0; i < 12; i += 2) {
      canvas.drawRect(Rect.fromLTWH(0, i * stripeH, size.width, stripeH), stripe);
    }
    // Border rail.
    canvas.drawRect(
      Offset.zero & size,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 8
        ..color = const Color(0xFF6B4A2A),
    );
    // Sand.
    for (final s in (layout['sand'] as List?) ?? const []) {
      if (s is! Map) continue;
      final r = Rect.fromLTWH((s['x'] as num).toDouble() * sx, (s['y'] as num).toDouble() * sy, (s['w'] as num).toDouble() * sx, (s['h'] as num).toDouble() * sy);
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(14)), Paint()..color = const Color(0xFFE9D28B));
      canvas.drawRRect(RRect.fromRectAndRadius(r.deflate(3), const Radius.circular(12)), Paint()..color = const Color(0xFFF3E2A6));
      // Rake marks.
      final rake = Paint()
        ..color = const Color(0xFFD9BE72)
        ..strokeWidth = 1;
      for (var y = r.top + 8; y < r.bottom - 4; y += 7) {
        canvas.drawLine(Offset(r.left + 8, y), Offset(r.right - 8, y), rake);
      }
    }
    // Start tee mat.
    final start = layout['start'];
    if (start is List && start.length >= 2) {
      final c = Offset((start[0] as num).toDouble() * sx, (start[1] as num).toDouble() * sy);
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c, width: 34, height: 22), const Radius.circular(5)), Paint()..color = const Color(0xFF1F6B36));
    }
    // Walls.
    for (final w in (layout['walls'] as List?) ?? const []) {
      if (w is! Map) continue;
      final r = Rect.fromLTWH((w['x'] as num).toDouble() * sx, (w['y'] as num).toDouble() * sy, (w['w'] as num).toDouble() * sx, (w['h'] as num).toDouble() * sy);
      canvas.drawRRect(RRect.fromRectAndRadius(r.shift(const Offset(2, 3)), const Radius.circular(4)), Paint()..color = Colors.black.withValues(alpha: 0.3));
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(4)), Paint()..shader = const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF9C6B3C), Color(0xFF5E3C1E)]).createShader(r));
    }
    // Bumpers.
    for (final bm in (layout['bumpers'] as List?) ?? const []) {
      if (bm is! Map) continue;
      final c = Offset((bm['x'] as num).toDouble() * sx, (bm['y'] as num).toDouble() * sy);
      final r = (bm['r'] as num).toDouble() * sx;
      canvas.drawCircle(c + const Offset(2, 3), r, Paint()..color = Colors.black.withValues(alpha: 0.3));
      canvas.drawCircle(c, r, Paint()..shader = const RadialGradient(center: Alignment(-0.3, -0.3), colors: [Color(0xFFFF8FAB), Color(0xFFE63946), Color(0xFF8B1E2B)]).createShader(Rect.fromCircle(center: c, radius: r)));
      canvas.drawCircle(c, r * 0.4, Paint()..color = Colors.white.withValues(alpha: 0.35));
    }
    // Cup + flag.
    final cup = layout['cup'];
    if (cup is List && cup.length >= 2) {
      final c = Offset((cup[0] as num).toDouble() * sx, (cup[1] as num).toDouble() * sy);
      final r = cupR * sx;
      canvas.drawCircle(c, r * 1.25, Paint()..color = Colors.black.withValues(alpha: 0.18));
      canvas.drawCircle(c, r, Paint()..shader = const RadialGradient(colors: [Color(0xFF05070F), Color(0xFF1B2A1F)]).createShader(Rect.fromCircle(center: c, radius: r)));
      canvas.drawCircle(c, r, Paint()..style = PaintingStyle.stroke..strokeWidth = 1.5..color = Colors.white.withValues(alpha: 0.6));
      // Flag pole.
      final pole = Paint()
        ..color = const Color(0xFFEDEDED)
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round;
      final top = c - Offset(0, r * 3.2);
      canvas.drawLine(c, top, pole);
      final wobble = holedFlag ? 6.0 : 0.0;
      final flag = Path()
        ..moveTo(top.dx, top.dy)
        ..lineTo(top.dx + r * 2.2 + wobble, top.dy + r * 0.7)
        ..lineTo(top.dx, top.dy + r * 1.4)
        ..close();
      canvas.drawPath(flag, Paint()..color = const Color(0xFFFF4D6D));
    }
  }

  @override
  bool shouldRepaint(covariant _CoursePainter old) => old.layout != layout || old.holedFlag != holedFlag;
}

class _AimPainter extends CustomPainter {
  _AimPainter({required this.ball, required this.drag, required this.accent});
  final Offset ball;
  final Offset drag;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final power = (drag.distance / 150).clamp(0.05, 1.0);
    final dir = drag.distance == 0 ? Offset.zero : -drag / drag.distance;
    final len = 30 + power * 110;
    final end = ball + dir * len;
    // Pull-back band.
    canvas.drawLine(ball, ball + drag * 0.5, Paint()..color = Colors.white.withValues(alpha: 0.35)..strokeWidth = 3..strokeCap = StrokeCap.round);
    // Arrow.
    final paint = Paint()
      ..color = power > 0.85 ? AppColors.coral : accent
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(ball, end, paint);
    final a = math.atan2(dir.dy, dir.dx);
    final head = Path()
      ..moveTo(end.dx, end.dy)
      ..lineTo(end.dx - math.cos(a - 0.5) * 12, end.dy - math.sin(a - 0.5) * 12)
      ..lineTo(end.dx - math.cos(a + 0.5) * 12, end.dy - math.sin(a + 0.5) * 12)
      ..close();
    canvas.drawPath(head, Paint()..color = paint.color);
    // Power label.
    final tp = TextPainter(text: TextSpan(text: '${(power * 100).round()}%', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900)), textDirection: TextDirection.ltr)..layout();
    tp.paint(canvas, ball + drag * 0.5 + const Offset(8, -6));
  }

  @override
  bool shouldRepaint(covariant _AimPainter old) => old.ball != ball || old.drag != drag;
}
