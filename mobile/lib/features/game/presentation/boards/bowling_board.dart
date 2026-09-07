import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Bowling — five frames, strikes, spares and a proper score sheet. A
/// perspective lane with gutters and a ten-pin rack; drag the ball left or
/// right on the approach, then swipe up to release. A sideways swipe adds
/// hook, swipe length sets power. The ball animates down the lane and the
/// knocked pins fall as the server's result arrives.
class BowlingBoard extends StatefulWidget {
  const BowlingBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<BowlingBoard> createState() => _BowlingBoardState();
}

class _BowlingBoardState extends State<BowlingBoard> with SingleTickerProviderStateMixin {
  double _ballX = 0; // -1..1 across the approach
  Offset? _swipeStart;
  Offset _swipeDelta = Offset.zero;
  bool _rolling = false;
  late final AnimationController _roll = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
  Map<String, dynamic>? _animatingRoll; // the roll being animated (from server)
  Map<String, dynamic>? _seenRoll;

  Map<String, dynamic> get b => widget.session.board;

  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  @override
  void initState() {
    super.initState();
    _roll.addStatusListener((status) {
      if (status == AnimationStatus.completed && mounted) {
        final r = _animatingRoll;
        if (r != null) {
          final count = (r['count'] as num?)?.toInt() ?? 0;
          if (count > 0) GameFeedback.hit();
        }
        setState(() => _animatingRoll = null);
      }
    });
    _seenRoll = _lastRoll;
  }

  @override
  void didUpdateWidget(covariant BowlingBoard old) {
    super.didUpdateWidget(old);
    final r = _lastRoll;
    if (r != null && !_sameRoll(r, _seenRoll)) {
      _seenRoll = r;
      _animatingRoll = r;
      _roll.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _roll.dispose();
    super.dispose();
  }

  Map<String, dynamic>? get _lastRoll => b['lastRoll'] is Map ? Map<String, dynamic>.from(b['lastRoll'] as Map) : null;

  bool _sameRoll(Map<String, dynamic>? a, Map<String, dynamic>? c) {
    if (a == null || c == null) return a == c;
    return a['seat'] == c['seat'] && a['frame'] == c['frame'] && a['ball'] == c['ball'] && a['arrival'] == c['arrival'];
  }

  Future<void> _release() async {
    if (!_myTurn || _rolling) return;
    final d = _swipeDelta;
    if (d.dy > -30) {
      setState(() => _swipeDelta = Offset.zero);
      return; // too short — not a throw
    }
    final power = (d.distance / 220).clamp(0.3, 1.0);
    final curve = (d.dx / 140).clamp(-1.0, 1.0);
    setState(() {
      _rolling = true;
      _swipeDelta = Offset.zero;
    });
    GameFeedback.move();
    await widget.onAction('bowl', {
      'x': double.parse(_ballX.toStringAsFixed(3)),
      'curve': double.parse(curve.toStringAsFixed(3)),
      'power': double.parse(power.toStringAsFixed(3)),
    });
    if (mounted) setState(() => _rolling = false);
  }

  @override
  Widget build(BuildContext context) {
    final players = ((b['players'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final frameCount = (b['frameCount'] as num?)?.toInt() ?? 5;
    final pins = ((b['pins'] as List?) ?? const []).map((e) => (e as num).toInt()).toSet();
    final current = widget.session.currentSeat;
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final last = _lastRoll;
    final animating = _animatingRoll;

    // While animating, show the rack as it was before the roll (standing after + knocked), then let them fall.
    final knocked = animating == null ? <int>{} : ((animating['knocked'] as List?) ?? const []).map((e) => (e as num).toInt()).toSet();
    final standingAfter = animating == null ? pins : ((animating['standing'] as List?) ?? const []).map((e) => (e as num).toInt()).toSet();
    final rackShown = animating == null ? pins : {...standingAfter, ...knocked};

    final me = widget.mySeat >= 0 && widget.mySeat < players.length ? players[widget.mySeat] : null;
    final curPlayer = current >= 0 && current < players.length ? players[current] : null;
    final ball = (curPlayer?['ball'] as num?)?.toInt() ?? 1;
    final frame = ((curPlayer?['frame'] as num?)?.toInt() ?? 0) + 1;

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (_myTurn) {
      status = 'Frame $frame · ball $ball — drag to aim, swipe up to bowl';
    } else {
      final name = current >= 0 && current < widget.session.seats.length ? widget.session.seats[current].displayName : 'Opponent';
      status = '$name is bowling frame $frame…';
    }

    String? banner;
    Color bannerColor = AppColors.softCyan;
    if (last != null && animating == null) {
      final seat = (last['seat'] as num?)?.toInt() ?? -1;
      final name = seat == widget.mySeat ? 'You' : (seat >= 0 && seat < widget.session.seats.length ? widget.session.seats[seat].displayName : 'Player');
      if (last['strike'] == true) {
        banner = '❌ STRIKE! $name';
        bannerColor = AppColors.gold;
      } else if (last['spare'] == true) {
        banner = '／ Spare — $name';
        bannerColor = AppColors.softCyan;
      } else if (last['gutter'] == true) {
        banner = '😬 Gutter ball — $name';
        bannerColor = AppColors.coral;
      } else {
        banner = '$name knocked ${last['count']} pin${last['count'] == 1 ? '' : 's'}';
        bannerColor = AppColors.textSecondary;
      }
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn, icon: Icons.sports_baseball),
        const SizedBox(height: 8),
        _ScoreSheet(session: widget.session, players: players, frameCount: frameCount, mySeat: widget.mySeat, current: current),
        const SizedBox(height: 8),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(8),
          child: AspectRatio(
            aspectRatio: 0.78,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final size = constraints.biggest;
                final geo = _LaneGeometry(size);
                final arrival = (animating?['arrival'] as num?)?.toDouble() ?? 0;
                final startX = (animating?['x'] as num?)?.toDouble() ?? _ballX;
                final curve = (animating?['curve'] as num?)?.toDouble() ?? 0;
                return GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onHorizontalDragUpdate: _myTurn && !_rolling && animating == null
                      ? (d) => setState(() => _ballX = (_ballX + d.delta.dx / (geo.approachHalfWidth)).clamp(-1.0, 1.0))
                      : null,
                  onVerticalDragStart: _myTurn && !_rolling && animating == null ? (d) => _swipeStart = d.localPosition : null,
                  onVerticalDragUpdate: _myTurn && !_rolling && animating == null
                      ? (d) {
                          final s = _swipeStart;
                          if (s == null) return;
                          setState(() => _swipeDelta = d.localPosition - s);
                        }
                      : null,
                  onVerticalDragEnd: _myTurn && !_rolling && animating == null ? (_) => _release() : null,
                  child: AnimatedBuilder(
                    animation: _roll,
                    builder: (context, _) {
                      // Read the controller inside the builder so every frame repaints.
                      final animT = animating == null ? null : Curves.easeIn.transform(_roll.value);
                      return Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Positioned.fill(child: CustomPaint(painter: _LanePainter(geo: geo, skin: playground))),
                          // Pins.
                          for (final pin in const [7, 8, 9, 10, 4, 5, 6, 2, 3, 1])
                            if (rackShown.contains(pin))
                              _Pin(
                                key: ValueKey('pin-$pin'),
                                center: geo.pinCenter(pin),
                                size: geo.pinSize(pin),
                                falling: knocked.contains(pin) && animT != null && animT > 0.82,
                                fallDirection: pin.isEven ? -1 : 1,
                              ),
                          // Ball: rolling animation or resting on the approach.
                          if (animT != null)
                            _Ball(
                              center: geo.ballAlong(animT, startX, arrival, curve),
                              radius: geo.ballRadius(animT),
                              palette: TableSkins.paletteFor(widget.session, (animating?['seat'] as num?)?.toInt() ?? current),
                              spin: animT * 12 * (curve.abs() + 0.4),
                            )
                          else if (widget.session.isInProgress)
                            _Ball(
                              center: geo.ballAlong(0, _myTurn ? _ballX : 0, 0, 0) + (_myTurn ? Offset(_swipeDelta.dx * 0.15, _swipeDelta.dy * 0.15) : Offset.zero),
                              radius: geo.ballRadius(0),
                              palette: TableSkins.paletteFor(widget.session, _myTurn ? widget.mySeat : current),
                              spin: 0,
                            ),
                          // Swipe guide.
                          if (_myTurn && animating == null && _swipeDelta.dy < -12)
                            Positioned.fill(
                              child: IgnorePointer(
                                child: CustomPaint(
                                  painter: _GuidePainter(
                                    from: geo.ballAlong(0, _ballX, 0, 0),
                                    to: geo.ballAlong(1, _ballX, (_ballX + (_swipeDelta.dx / 140).clamp(-1.0, 1.0) * 0.7).clamp(-1.3, 1.3), (_swipeDelta.dx / 140).clamp(-1.0, 1.0)),
                                    curve: (_swipeDelta.dx / 140).clamp(-1.0, 1.0),
                                    power: (_swipeDelta.distance / 220).clamp(0.3, 1.0),
                                    color: playground.accent,
                                    geo: geo,
                                    startX: _ballX,
                                  ),
                                ),
                              ),
                            ),
                          if (banner != null)
                            Positioned(
                              top: 8,
                              left: 0,
                              right: 0,
                              child: Center(
                                child: AnimatedSwitcher(
                                  duration: const Duration(milliseconds: 250),
                                  child: Container(
                                    key: ValueKey(banner),
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: Colors.black.withValues(alpha: 0.55),
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: bannerColor.withValues(alpha: 0.7)),
                                    ),
                                    child: Text(banner, style: TextStyle(color: bannerColor, fontWeight: FontWeight.w800, fontSize: 13)),
                                  ),
                                ),
                              ),
                            ),
                          if (_myTurn && animating == null)
                            Positioned(
                              bottom: 6,
                              left: 0,
                              right: 0,
                              child: Center(
                                child: Text(
                                  _swipeDelta.dy < -12
                                      ? 'Power ${((_swipeDelta.distance / 220).clamp(0.3, 1.0) * 100).round()}%  ·  Hook ${(_swipeDelta.dx / 140).clamp(-1.0, 1.0) > 0.15 ? '→' : ((_swipeDelta.dx / 140).clamp(-1.0, 1.0) < -0.15 ? '←' : '—')}'
                                      : '◀ drag to line up ▶   ·   swipe ↑ to bowl',
                                  style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 11, fontWeight: FontWeight.w600),
                                ),
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ),
        if (me != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Row(
              children: [
                _Stat(label: 'Strikes', value: '${me['strikes'] ?? 0}', color: AppColors.gold),
                const SizedBox(width: 8),
                _Stat(label: 'Spares', value: '${me['spares'] ?? 0}', color: AppColors.softCyan),
                const Spacer(),
                Text('Pins standing: ${pins.length}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ],
            ),
          ),
      ],
    );
  }
}

// ── Score sheet ───────────────────────────────────────────────────────────────

class _ScoreSheet extends StatelessWidget {
  const _ScoreSheet({required this.session, required this.players, required this.frameCount, required this.mySeat, required this.current});
  final GameSessionView session;
  final List<Map<String, dynamic>> players;
  final int frameCount;
  final int mySeat;
  final int current;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Column(
        children: [
          for (var i = 0; i < players.length && i < session.seats.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: _SheetRow(
                name: i == mySeat ? 'You' : session.seats[i].displayName,
                player: players[i],
                frameCount: frameCount,
                palette: TableSkins.paletteFor(session, i),
                active: session.isInProgress && current == i,
                winner: session.winnerSeat == i,
              ),
            ),
        ],
      ),
    );
  }
}

class _SheetRow extends StatelessWidget {
  const _SheetRow({required this.name, required this.player, required this.frameCount, required this.palette, required this.active, required this.winner});
  final String name;
  final Map<String, dynamic> player;
  final int frameCount;
  final PiecePalette palette;
  final bool active;
  final bool winner;

  @override
  Widget build(BuildContext context) {
    final frames = ((player['frames'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final total = (player['total'] as num?)?.toInt() ?? 0;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: active ? palette.base.withValues(alpha: 0.16) : AppColors.glassFill,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: active ? palette.light : AppColors.glassStroke, width: active ? 1.5 : 1),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 64,
            child: Row(
              children: [
                Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: palette.base)),
                const SizedBox(width: 5),
                Expanded(
                  child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.textPrimary, fontSize: 11, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
          ),
          for (var f = 0; f < frameCount; f++)
            Expanded(child: _FrameCell(frame: f < frames.length ? frames[f] : null, isLast: f == frameCount - 1, live: active && f == ((player['frame'] as num?)?.toInt() ?? -1))),
          const SizedBox(width: 6),
          SizedBox(
            width: 34,
            child: Text(
              winner ? '🏆$total' : '$total',
              textAlign: TextAlign.right,
              style: TextStyle(color: winner ? AppColors.gold : AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }
}

class _FrameCell extends StatelessWidget {
  const _FrameCell({required this.frame, required this.isLast, required this.live});
  final Map<String, dynamic>? frame;
  final bool isLast;
  final bool live;

  @override
  Widget build(BuildContext context) {
    final rolls = ((frame?['rolls'] as List?) ?? const []).map((e) => (e as num).toInt()).toList();
    final score = (frame?['score'] as num?)?.toInt();
    final marks = <String>[];
    for (var i = 0; i < rolls.length; i++) {
      final r = rolls[i];
      final prev = i > 0 ? rolls[i - 1] : null;
      if (r == 10 && (i == 0 || isLast && (prev == 10 || (i == 2 && rolls[0] + rolls[1] == 10)))) {
        marks.add('X');
      } else if (prev != null && prev != 10 && prev + r == 10) {
        marks.add('/');
      } else {
        marks.add(r == 0 ? '-' : '$r');
      }
    }
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 1.5),
      padding: const EdgeInsets.symmetric(vertical: 3),
      decoration: BoxDecoration(
        color: live ? AppColors.electricPurple.withValues(alpha: 0.25) : Colors.black.withValues(alpha: 0.25),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: live ? AppColors.electricPurple : Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        children: [
          Text(
            marks.isEmpty ? ' ' : marks.join(' '),
            style: TextStyle(
              color: marks.contains('X') ? AppColors.gold : (marks.contains('/') ? AppColors.softCyan : AppColors.textSecondary),
              fontSize: 10,
              fontWeight: FontWeight.w800,
              height: 1.1,
            ),
          ),
          Text(score == null ? ' ' : '$score', style: const TextStyle(color: AppColors.textPrimary, fontSize: 11, fontWeight: FontWeight.w700, height: 1.1)),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.glassStroke)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
          const SizedBox(width: 6),
          Text(value, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12)),
        ],
      ),
    );
  }
}

// ── Lane geometry & painting ─────────────────────────────────────────────────

/// Perspective lane: wide at the bottom (approach), narrow at the top (pin deck).
class _LaneGeometry {
  _LaneGeometry(this.size);
  final Size size;

  double get topY => size.height * 0.08;
  double get bottomY => size.height * 0.98;
  double get topHalf => size.width * 0.20;
  double get bottomHalf => size.width * 0.44;
  double get centerX => size.width / 2;
  double get approachHalfWidth => bottomHalf * 0.75;

  /// Half lane width at a given depth t (0 = approach, 1 = pin deck).
  double halfAt(double t) => bottomHalf + (topHalf - bottomHalf) * t;
  double yAt(double t) => bottomY - (bottomY - topY) * t;

  /// Lane-relative x (-1..1 across lane boards) to pixels at depth t.
  Offset point(double laneX, double t) => Offset(centerX + laneX * halfAt(t), yAt(t));

  /// Pin deck: pins live between depths 0.86 and 1.0 with spacing in lane units.
  static const Map<int, Offset> _pinLayout = {
    1: Offset(0, 0), 2: Offset(-0.5, 1), 3: Offset(0.5, 1), 4: Offset(-1, 2), 5: Offset(0, 2), 6: Offset(1, 2),
    7: Offset(-1.5, 3), 8: Offset(-0.5, 3), 9: Offset(0.5, 3), 10: Offset(1.5, 3),
  };

  Offset pinCenter(int pin) {
    final p = _pinLayout[pin]!;
    final t = 0.84 + p.dy * 0.045;
    return point(p.dx / 1.75 * 0.78, t);
  }

  Size pinSize(int pin) {
    final p = _pinLayout[pin]!;
    final scale = 1 - p.dy * 0.06;
    return Size(size.width * 0.05 * scale, size.height * 0.085 * scale);
  }

  double ballRadius(double t) => size.width * (0.055 - 0.03 * t);

  /// Ball position: from approach x to arrival x, bending along the way.
  Offset ballAlong(double t, double startX, double arrival, double curve) {
    final bend = math.sin(t * math.pi / 2) * (arrival - startX) * 0.35 + (arrival - startX) * t * t * 0.65;
    final laneX = (startX * 0.75 + bend * 0.75).clamp(-1.35, 1.35);
    final depth = t * 0.9;
    return point(laneX, depth) + Offset(0, -ballRadius(t) * 0.2);
  }
}

class _LanePainter extends CustomPainter {
  _LanePainter({required this.geo, required this.skin});
  final _LaneGeometry geo;
  final PlaygroundSkin skin;

  @override
  void paint(Canvas canvas, Size size) {
    // Back wall / pin deck shadow.
    final wall = Rect.fromLTWH(0, 0, size.width, geo.topY + size.height * 0.05);
    canvas.drawRect(wall, Paint()..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.black.withValues(alpha: 0.6), Colors.black.withValues(alpha: 0.15)]).createShader(wall));

    // Gutters (wide trapezoid, darker).
    final gutter = Path()
      ..moveTo(geo.centerX - geo.bottomHalf * 1.12, geo.bottomY)
      ..lineTo(geo.centerX - geo.topHalf * 1.15, geo.topY)
      ..lineTo(geo.centerX + geo.topHalf * 1.15, geo.topY)
      ..lineTo(geo.centerX + geo.bottomHalf * 1.12, geo.bottomY)
      ..close();
    canvas.drawPath(gutter, Paint()..color = const Color(0xFF0E1018));

    // Lane boards (warm maple gradient tinted by the playground felt colours).
    final lane = Path()
      ..moveTo(geo.centerX - geo.bottomHalf, geo.bottomY)
      ..lineTo(geo.centerX - geo.topHalf, geo.topY)
      ..lineTo(geo.centerX + geo.topHalf, geo.topY)
      ..lineTo(geo.centerX + geo.bottomHalf, geo.bottomY)
      ..close();
    const maple = Color(0xFFD9A868);
    const mapleDark = Color(0xFF8C5F2E);
    canvas.drawPath(
      lane,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color.lerp(mapleDark, skin.feltBottom, 0.25)!, maple, Color.lerp(maple, Colors.white, 0.12)!],
        ).createShader(lane.getBounds()),
    );
    // Board seams.
    final seam = Paint()
      ..color = Colors.black.withValues(alpha: 0.10)
      ..strokeWidth = 1;
    for (var i = -6; i <= 6; i++) {
      final x = i / 6;
      canvas.drawLine(geo.point(x, 0), geo.point(x, 1), seam);
    }
    // Arrows (aiming marks) and foul line.
    final arrow = Paint()..color = Colors.black.withValues(alpha: 0.35);
    for (var i = -3; i <= 3; i++) {
      final base = geo.point(i / 4, 0.33 + (3 - i.abs()) * 0.03);
      final path = Path()
        ..moveTo(base.dx, base.dy - 8)
        ..lineTo(base.dx - 4, base.dy + 2)
        ..lineTo(base.dx + 4, base.dy + 2)
        ..close();
      canvas.drawPath(path, arrow);
    }
    canvas.drawLine(geo.point(-1, 0.1), geo.point(1, 0.1), Paint()..color = Colors.black.withValues(alpha: 0.35)..strokeWidth = 2);
    // Oil sheen.
    canvas.drawPath(
      lane,
      Paint()
        ..shader = LinearGradient(begin: Alignment.centerLeft, end: Alignment.centerRight, colors: [Colors.transparent, Colors.white.withValues(alpha: 0.18), Colors.transparent]).createShader(lane.getBounds()),
    );
    // Lane edges.
    canvas.drawPath(lane, Paint()..style = PaintingStyle.stroke..strokeWidth = 1.5..color = skin.accent.withValues(alpha: 0.5));
  }

  @override
  bool shouldRepaint(covariant _LanePainter old) => old.skin != skin || old.geo.size != geo.size;
}

class _GuidePainter extends CustomPainter {
  _GuidePainter({required this.from, required this.to, required this.curve, required this.power, required this.color, required this.geo, required this.startX});
  final Offset from;
  final Offset to;
  final double curve;
  final double power;
  final Color color;
  final _LaneGeometry geo;
  final double startX;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: 0.7)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    final arrival = (startX + curve * 0.7).clamp(-1.3, 1.3);
    var prev = geo.ballAlong(0, startX, arrival, curve);
    for (var i = 1; i <= 16; i++) {
      final t = i / 16;
      final p = geo.ballAlong(t, startX, arrival, curve);
      if (i.isOdd) canvas.drawLine(prev, p, paint);
      prev = p;
    }
    // Power bar next to the ball.
    final barRect = Rect.fromLTWH(from.dx + geo.ballRadius(0) + 10, from.dy - 30, 6, 60);
    canvas.drawRRect(RRect.fromRectAndRadius(barRect, const Radius.circular(3)), Paint()..color = Colors.black.withValues(alpha: 0.4));
    final fill = Rect.fromLTWH(barRect.left, barRect.bottom - barRect.height * power, barRect.width, barRect.height * power);
    canvas.drawRRect(
      RRect.fromRectAndRadius(fill, const Radius.circular(3)),
      Paint()..shader = LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [AppColors.softCyan, AppColors.gold, AppColors.coral]).createShader(barRect),
    );
  }

  @override
  bool shouldRepaint(covariant _GuidePainter old) => old.to != to || old.power != power || old.curve != curve || old.startX != startX;
}

// ── Pins & ball ───────────────────────────────────────────────────────────────

class _Pin extends StatelessWidget {
  const _Pin({super.key, required this.center, required this.size, required this.falling, required this.fallDirection});
  final Offset center;
  final Size size;
  final bool falling;
  final int fallDirection;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: center.dx - size.width / 2,
      top: center.dy - size.height * 0.8,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 260),
        opacity: falling ? 0 : 1,
        child: AnimatedRotation(
          duration: const Duration(milliseconds: 260),
          turns: falling ? 0.3 * fallDirection : 0,
          alignment: Alignment.bottomCenter,
          child: CustomPaint(size: size, painter: _PinPainter()),
        ),
      ),
    );
  }
}

class _PinPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final body = Path()
      ..moveTo(w * 0.5, 0)
      ..cubicTo(w * 0.78, 0, w * 0.72, h * 0.28, w * 0.62, h * 0.4)
      ..cubicTo(w * 0.95, h * 0.55, w * 0.95, h * 0.9, w * 0.72, h)
      ..lineTo(w * 0.28, h)
      ..cubicTo(w * 0.05, h * 0.9, w * 0.05, h * 0.55, w * 0.38, h * 0.4)
      ..cubicTo(w * 0.28, h * 0.28, w * 0.22, 0, w * 0.5, 0)
      ..close();
    canvas.drawPath(body.shift(Offset(w * 0.08, h * 0.04)), Paint()..color = Colors.black.withValues(alpha: 0.35)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2));
    canvas.drawPath(
      body,
      Paint()
        ..shader = const LinearGradient(begin: Alignment.centerLeft, end: Alignment.centerRight, colors: [Color(0xFFBFC4CF), Colors.white, Color(0xFFF2F4F8), Color(0xFF9EA4B2)]).createShader(Rect.fromLTWH(0, 0, w, h)),
    );
    // Neck stripes.
    final stripe = Paint()..color = const Color(0xFFE23D4A);
    canvas.save();
    canvas.clipPath(body);
    canvas.drawRect(Rect.fromLTWH(0, h * 0.3, w, h * 0.05), stripe);
    canvas.drawRect(Rect.fromLTWH(0, h * 0.4, w, h * 0.05), stripe);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _PinPainter old) => false;
}

class _Ball extends StatelessWidget {
  const _Ball({required this.center, required this.radius, required this.palette, required this.spin});
  final Offset center;
  final double radius;
  final PiecePalette palette;
  final double spin;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: center.dx - radius,
      top: center.dy - radius,
      child: Transform.rotate(
        angle: spin,
        child: Container(
          width: radius * 2,
          height: radius * 2,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(center: const Alignment(-0.4, -0.45), colors: [palette.light, palette.base, palette.dark], stops: const [0, 0.55, 1]),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: radius * 0.6, offset: Offset(0, radius * 0.35)),
              BoxShadow(color: palette.glow.withValues(alpha: 0.4), blurRadius: radius),
            ],
          ),
          child: Stack(
            children: [
              // Finger holes.
              Positioned(left: radius * 0.75, top: radius * 0.55, child: _hole(radius * 0.22)),
              Positioned(left: radius * 1.1, top: radius * 0.6, child: _hole(radius * 0.22)),
              Positioned(left: radius * 0.92, top: radius * 1.0, child: _hole(radius * 0.26)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _hole(double d) => Container(width: d, height: d, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.black.withValues(alpha: 0.55)));
}
