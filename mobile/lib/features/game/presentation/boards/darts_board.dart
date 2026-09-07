import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Darts — 301 double-out. A real sisal-style board painted with the standard
/// segment order. On your visit a reticle drifts across the board; tap (or
/// press the throw button) to release. The reticle slows down when you hold,
/// so timing beats luck. Darts stick where they land and every visit total
/// animates on the scoreboard.
class DartsBoard extends StatefulWidget {
  const DartsBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<DartsBoard> createState() => _DartsBoardState();
}

class _DartsBoardState extends State<DartsBoard> with SingleTickerProviderStateMixin {
  late final AnimationController _drift;
  Offset _aim = Offset.zero; // board coordinates, bull at 0,0, +y up
  Offset _target = const Offset(0, 0.62);
  bool _holding = false;
  bool _throwing = false;
  final math.Random _rnd = math.Random();

  Map<String, dynamic> get b => widget.session.board;

  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  @override
  void initState() {
    super.initState();
    _drift = AnimationController(vsync: this, duration: const Duration(seconds: 1))..addListener(_step);
    _drift.repeat();
  }

  @override
  void dispose() {
    _drift.dispose();
    super.dispose();
  }

  /// Wandering reticle: eases toward a random waypoint, slower while holding.
  void _step() {
    if (!_myTurn || _throwing) return;
    final speed = _holding ? 0.012 : 0.05;
    final d = _target - _aim;
    if (d.distance < 0.03) {
      // Keep the reticle biased toward the upper half where the 20 lives.
      final r = 0.25 + _rnd.nextDouble() * 0.7;
      final a = _rnd.nextDouble() * math.pi * 2;
      _target = Offset(math.sin(a) * r, math.cos(a) * r * 0.9 + 0.15);
    }
    final wobble = Offset(_rnd.nextDouble() - 0.5, _rnd.nextDouble() - 0.5) * (_holding ? 0.004 : 0.012);
    setState(() => _aim = _aim + d * speed + wobble);
  }

  /// Aim-assist so a tap lands near where the reticle points; the server owns scoring.
  Future<void> _throw() async {
    if (!_myTurn || _throwing) return;
    setState(() => _throwing = true);
    GameFeedback.hit();
    final point = _aim;
    await widget.onAction('throw', {'x': double.parse(point.dx.toStringAsFixed(4)), 'y': double.parse(point.dy.toStringAsFixed(4))});
    if (mounted) setState(() => _throwing = false);
  }

  @override
  Widget build(BuildContext context) {
    final players = ((b['players'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final segments = ((b['segments'] as List?) ?? const []).map((e) => (e as num).toInt()).toList();
    final rings = Map<String, dynamic>.from((b['rings'] as Map?) ?? const {});
    final dartsLeft = (b['dartsLeft'] as num?)?.toInt() ?? 3;
    final hint = b['hint'] as String?;
    final lastVisit = b['lastVisit'] is Map ? Map<String, dynamic>.from(b['lastVisit'] as Map) : null;
    final current = widget.session.currentSeat;
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final target = (b['target'] as num?)?.toInt() ?? 301;

    // Darts of the visit in progress stay on the board; between visits the
    // previous player's three darts remain stuck until the next throw.
    final currentDarts = current >= 0 && current < players.length
        ? ((players[current]['darts'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
        : <Map<String, dynamic>>[];
    final showLast = currentDarts.isEmpty && lastVisit != null;
    final shownSeat = showLast ? ((lastVisit['seat'] as num?)?.toInt() ?? -1) : current;
    final visitDarts = currentDarts;
    final displayDarts = showLast
        ? ((lastVisit['darts'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
        : currentDarts;

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (_myTurn) {
      status = 'Your visit — tap the board to throw ($dartsLeft left)';
    } else {
      final name = current >= 0 && current < widget.session.seats.length ? widget.session.seats[current].displayName : 'Opponent';
      status = '$name is throwing… ($dartsLeft left)';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn, icon: Icons.gps_fixed),
        const SizedBox(height: 8),
        _Scoreboard(session: widget.session, players: players, mySeat: widget.mySeat, current: current, target: target),
        const SizedBox(height: 8),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(10),
          child: AspectRatio(
            aspectRatio: 1,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final size = constraints.biggest;
                final radius = math.min(size.width, size.height) / 2 * 0.94;
                final center = Offset(size.width / 2, size.height / 2);
                Offset toPx(Offset boardPoint) => center + Offset(boardPoint.dx * radius, -boardPoint.dy * radius);
                return GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTapDown: _myTurn ? (_) => setState(() => _holding = true) : null,
                  onTapUp: _myTurn
                      ? (_) {
                          setState(() => _holding = false);
                          _throw();
                        }
                      : null,
                  onTapCancel: _myTurn ? () => setState(() => _holding = false) : null,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Positioned.fill(
                        child: CustomPaint(
                          painter: _DartboardPainter(segments: segments, rings: rings, accent: playground.accent, glow: playground.glow),
                        ),
                      ),
                      // Darts stuck in the board.
                      for (var i = 0; i < displayDarts.length; i++)
                        _StuckDart(
                          key: ValueKey('dart-$shownSeat-$i-${displayDarts[i]['r']}-${displayDarts[i]['theta']}'),
                          position: toPx(_fromPolar(displayDarts[i])),
                          color: shownSeat >= 0 ? TableSkins.paletteFor(widget.session, shownSeat).base : playground.accent,
                          score: (displayDarts[i]['score'] as num?)?.toInt() ?? 0,
                          label: _bedLabel(displayDarts[i]),
                        ),
                      // Drifting reticle.
                      if (_myTurn && !_throwing)
                        Positioned(
                          left: toPx(_aim).dx - 22,
                          top: toPx(_aim).dy - 22,
                          child: IgnorePointer(child: _Reticle(holding: _holding, color: playground.accent)),
                        ),
                      // Checkout hint.
                      if (_myTurn && hint != null)
                        Positioned(
                          right: 6,
                          top: 6,
                          child: _Chip(text: 'Aim $hint', color: AppColors.gold),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 8),
        _VisitStrip(session: widget.session, lastVisit: lastVisit, dartsLeft: dartsLeft, visitDarts: visitDarts, active: widget.session.isInProgress),
        if (_myTurn)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    _holding ? 'Steady… release to throw' : 'Hold to steady the reticle, release to throw',
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                  ),
                ),
                ActionButton(
                  label: 'Throw',
                  icon: Icons.sports_esports,
                  expanded: false,
                  onPressed: _throwing ? null : _throw,
                ),
              ],
            ),
          ),
      ],
    );
  }

  Offset _fromPolar(Map<String, dynamic> dart) {
    final r = (dart['r'] as num?)?.toDouble() ?? 0;
    final theta = (dart['theta'] as num?)?.toDouble() ?? 0;
    return Offset(math.sin(theta) * r, math.cos(theta) * r);
  }

  String _bedLabel(Map<String, dynamic> dart) {
    final seg = (dart['segment'] as num?)?.toInt() ?? 0;
    final mult = (dart['multiplier'] as num?)?.toInt() ?? 0;
    if (seg == 0) return 'Miss';
    if (seg == 25) return mult == 2 ? 'Bull' : '25';
    final prefix = mult == 3 ? 'T' : (mult == 2 ? 'D' : '');
    return '$prefix$seg';
  }
}

// ── Scoreboard ────────────────────────────────────────────────────────────────

class _Scoreboard extends StatelessWidget {
  const _Scoreboard({required this.session, required this.players, required this.mySeat, required this.current, required this.target});
  final GameSessionView session;
  final List<Map<String, dynamic>> players;
  final int mySeat;
  final int current;
  final int target;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          for (var i = 0; i < players.length && i < session.seats.length; i++)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: _PlayerTile(
                  name: i == mySeat ? 'You' : session.seats[i].displayName,
                  remaining: (players[i]['remaining'] as num?)?.toInt() ?? target,
                  target: target,
                  best: (players[i]['best'] as num?)?.toInt() ?? 0,
                  palette: TableSkins.paletteFor(session, i),
                  active: session.isInProgress && current == i,
                  winner: session.winnerSeat == i,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PlayerTile extends StatelessWidget {
  const _PlayerTile({
    required this.name,
    required this.remaining,
    required this.target,
    required this.best,
    required this.palette,
    required this.active,
    required this.winner,
  });
  final String name;
  final int remaining;
  final int target;
  final int best;
  final PiecePalette palette;
  final bool active;
  final bool winner;

  @override
  Widget build(BuildContext context) {
    final progress = (1 - remaining / target).clamp(0.0, 1.0);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: active ? palette.base.withValues(alpha: 0.18) : AppColors.glassFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: active ? palette.light : AppColors.glassStroke, width: active ? 1.6 : 1),
        boxShadow: active ? [BoxShadow(color: palette.glow.withValues(alpha: 0.35), blurRadius: 12)] : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: palette.base)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
              ),
              if (winner) const Text('🏆', style: TextStyle(fontSize: 12)),
            ],
          ),
          const SizedBox(height: 4),
          TweenAnimationBuilder<double>(
            tween: Tween(begin: remaining.toDouble(), end: remaining.toDouble()),
            duration: const Duration(milliseconds: 400),
            builder: (context, value, _) => Text(
              '${value.round()}',
              style: TextStyle(color: remaining <= 50 ? AppColors.gold : AppColors.textPrimary, fontSize: 24, fontWeight: FontWeight.w800, height: 1),
            ),
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 4,
              backgroundColor: Colors.white.withValues(alpha: 0.08),
              valueColor: AlwaysStoppedAnimation<Color>(palette.light),
            ),
          ),
          if (best > 0)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('Best visit $best', style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
            ),
        ],
      ),
    );
  }
}

// ── Visit strip (three dart slots) ───────────────────────────────────────────

class _VisitStrip extends StatelessWidget {
  const _VisitStrip({required this.session, required this.lastVisit, required this.dartsLeft, required this.visitDarts, required this.active});
  final GameSessionView session;
  final Map<String, dynamic>? lastVisit;
  final int dartsLeft;
  final List<Map<String, dynamic>> visitDarts;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final slots = <Widget>[];
    for (var i = 0; i < 3; i++) {
      final dart = i < visitDarts.length ? visitDarts[i] : null;
      slots.add(_DartSlot(score: dart == null ? null : (dart['score'] as num?)?.toInt(), pending: dart == null && active));
    }
    final total = visitDarts.fold<int>(0, (s, d) => s + ((d['score'] as num?)?.toInt() ?? 0));
    String? lastText;
    Color lastColor = AppColors.textSecondary;
    if (lastVisit != null) {
      final seat = (lastVisit!['seat'] as num?)?.toInt() ?? -1;
      final name = seat >= 0 && seat < session.seats.length ? session.seats[seat].displayName : 'Player';
      final bust = lastVisit!['bust'] == true;
      final checkout = lastVisit!['checkout'] == true;
      final t = (lastVisit!['total'] as num?)?.toInt() ?? 0;
      if (checkout) {
        lastText = '🎯 $name checked out!';
        lastColor = AppColors.gold;
      } else if (bust) {
        lastText = '💥 $name bust — visit voided';
        lastColor = AppColors.coral;
      } else {
        lastText = '$name scored $t${t >= 100 ? ' — ton!' : ''}';
        lastColor = t >= 100 ? AppColors.softCyan : AppColors.textSecondary;
      }
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          ...slots,
          const SizedBox(width: 10),
          Text('= $total', style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 16)),
          const Spacer(),
          if (lastText != null)
            Flexible(
              child: Text(lastText, maxLines: 2, textAlign: TextAlign.right, style: TextStyle(color: lastColor, fontSize: 11, fontWeight: FontWeight.w600)),
            ),
        ],
      ),
    );
  }
}

class _DartSlot extends StatelessWidget {
  const _DartSlot({required this.score, required this.pending});
  final int? score;
  final bool pending;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 40,
      height: 34,
      margin: const EdgeInsets.only(right: 6),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: score == null ? AppColors.glassFill : AppColors.electricPurple.withValues(alpha: 0.25),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: score == null ? AppColors.glassStroke : AppColors.electricPurple),
      ),
      child: score == null
          ? Icon(Icons.push_pin_outlined, size: 14, color: pending ? AppColors.textSecondary : AppColors.textMuted)
          : Text('$score', style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800)),
    );
  }
}

// ── Board painting ────────────────────────────────────────────────────────────

class _DartboardPainter extends CustomPainter {
  _DartboardPainter({required this.segments, required this.rings, required this.accent, required this.glow});
  final List<int> segments;
  final Map<String, dynamic> rings;
  final Color accent;
  final Color glow;

  double _ring(String key, double fallback) => (rings[key] as num?)?.toDouble() ?? fallback;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.min(size.width, size.height) / 2 * 0.94;
    final segs = segments.length == 20 ? segments : const [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
    final bull = _ring('bull', 0.037) * radius;
    final outerBull = _ring('outerBull', 0.094) * radius;
    final trebleIn = _ring('trebleIn', 0.582) * radius;
    final trebleOut = _ring('trebleOut', 0.629) * radius;
    final doubleIn = _ring('doubleIn', 0.953) * radius;
    final doubleOut = radius;

    // Surround (the black frame with numbers) + glow.
    canvas.drawCircle(center, radius * 1.06, Paint()..color = glow.withValues(alpha: 0.18)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 18));
    canvas.drawCircle(center, radius * 1.06, Paint()..color = const Color(0xFF15161F));
    canvas.drawCircle(center, radius * 1.06, Paint()..style = PaintingStyle.stroke..strokeWidth = 2..color = accent.withValues(alpha: 0.5));

    const cream = Color(0xFFEDE3C8);
    const black = Color(0xFF1B1B21);
    const red = Color(0xFFD8323C);
    const green = Color(0xFF1E9E5E);
    final slice = math.pi * 2 / 20;

    for (var i = 0; i < 20; i++) {
      // Segment i is centred at angle i*slice measured clockwise from straight up.
      final start = -math.pi / 2 + i * slice - slice / 2;
      final dark = i.isEven;
      _wedge(canvas, center, outerBull, trebleIn, start, slice, dark ? black : cream);
      _wedge(canvas, center, trebleIn, trebleOut, start, slice, dark ? red : green);
      _wedge(canvas, center, trebleOut, doubleIn, start, slice, dark ? black : cream);
      _wedge(canvas, center, doubleIn, doubleOut, start, slice, dark ? red : green);
    }
    // Bulls.
    canvas.drawCircle(center, outerBull, Paint()..color = green);
    canvas.drawCircle(center, bull, Paint()..color = red);

    // Wire.
    final wire = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = const Color(0xFFB8BCC8).withValues(alpha: 0.85);
    for (final r in [outerBull, trebleIn, trebleOut, doubleIn, doubleOut]) {
      canvas.drawCircle(center, r, wire);
    }
    for (var i = 0; i < 20; i++) {
      final a = -math.pi / 2 + i * slice - slice / 2;
      canvas.drawLine(center + Offset(math.cos(a), math.sin(a)) * outerBull, center + Offset(math.cos(a), math.sin(a)) * doubleOut, wire);
    }

    // Numbers.
    final textStyle = TextStyle(color: cream.withValues(alpha: 0.95), fontSize: radius * 0.085, fontWeight: FontWeight.w700);
    for (var i = 0; i < 20; i++) {
      final a = -math.pi / 2 + i * slice;
      final pos = center + Offset(math.cos(a), math.sin(a)) * (radius * 1.0 + radius * 0.035 + textStyle.fontSize! * 0.45);
      final tp = TextPainter(text: TextSpan(text: '${segs[i]}', style: textStyle), textDirection: TextDirection.ltr)..layout();
      tp.paint(canvas, pos - Offset(tp.width / 2, tp.height / 2));
    }

    // Soft spotlight.
    canvas.drawCircle(
      center + Offset(-radius * 0.3, -radius * 0.35),
      radius * 0.9,
      Paint()
        ..shader = RadialGradient(colors: [Colors.white.withValues(alpha: 0.10), Colors.transparent]).createShader(
          Rect.fromCircle(center: center + Offset(-radius * 0.3, -radius * 0.35), radius: radius * 0.9),
        ),
    );
  }

  void _wedge(Canvas canvas, Offset c, double rIn, double rOut, double start, double sweep, Color color) {
    final path = Path()
      ..arcTo(Rect.fromCircle(center: c, radius: rOut), start, sweep, true)
      ..arcTo(Rect.fromCircle(center: c, radius: rIn), start + sweep, -sweep, false)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _DartboardPainter old) => old.segments != segments || old.accent != accent || old.rings != rings;
}

// ── Reticle & darts ───────────────────────────────────────────────────────────

class _Reticle extends StatelessWidget {
  const _Reticle({required this.holding, required this.color});
  final bool holding;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: holding ? AppColors.gold : color, width: holding ? 2.5 : 1.8),
        boxShadow: [BoxShadow(color: (holding ? AppColors.gold : color).withValues(alpha: 0.5), blurRadius: 10)],
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(width: 6, height: 6, decoration: BoxDecoration(shape: BoxShape.circle, color: holding ? AppColors.gold : color)),
          Container(width: 1.2, height: 44, color: (holding ? AppColors.gold : color).withValues(alpha: 0.5)),
          Container(width: 44, height: 1.2, color: (holding ? AppColors.gold : color).withValues(alpha: 0.5)),
        ],
      ),
    );
  }
}

class _StuckDart extends StatefulWidget {
  const _StuckDart({super.key, required this.position, required this.color, required this.score, required this.label});
  final Offset position;
  final Color color;
  final int score;
  final String label;

  @override
  State<_StuckDart> createState() => _StuckDartState();
}

class _StuckDartState extends State<_StuckDart> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 420))..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final t = Curves.easeOutBack.transform(_c.value);
        final scale = 2.2 - 1.2 * t; // flies in from the viewer
        return Positioned(
          left: widget.position.dx - 6,
          top: widget.position.dy - 6,
          child: Transform.scale(
            scale: scale,
            child: Opacity(
              opacity: (0.3 + 0.7 * _c.value).clamp(0.0, 1.0),
              child: SizedBox(
                width: 12,
                height: 12,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    // Flight.
                    Positioned(
                      left: 4,
                      top: -26,
                      child: Transform.rotate(
                        angle: -0.35,
                        child: Container(
                          width: 5,
                          height: 30,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [widget.color, Colors.white.withValues(alpha: 0.9)]),
                            borderRadius: BorderRadius.circular(3),
                            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 3, offset: const Offset(1, 1))],
                          ),
                        ),
                      ),
                    ),
                    // Point.
                    Center(
                      child: Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white, boxShadow: [BoxShadow(color: widget.color, blurRadius: 6)]),
                      ),
                    ),
                    if (_c.value > 0.6)
                      Positioned(
                        left: 12,
                        top: 2,
                        child: _Chip(text: widget.label, color: widget.score >= 40 ? AppColors.gold : Colors.white),
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.7)),
      ),
      child: Text(text, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }
}
