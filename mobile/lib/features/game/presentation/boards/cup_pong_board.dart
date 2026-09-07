import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Cup Pong — a long table in perspective, red cups racked at the far end.
/// Drag back from the ball to load a throw (the guide shows the landing
/// zone), release to lob; the ball flies on a parabola with a shadow, splashes
/// into a cup on a make (the cup shrinks away) or bounces off the table on a
/// miss. Bounce shots are toggled with a chip. 2 players or 2v2.
class CupPongBoard extends StatefulWidget {
  const CupPongBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<CupPongBoard> createState() => _CupPongBoardState();
}

class _Cup {
  _Cup({required this.id, required this.x, required this.y, required this.alive});
  final int id;
  final double x;
  final double y;
  final bool alive;
}

class _CupPongBoardState extends State<CupPongBoard> with SingleTickerProviderStateMixin {
  late final AnimationController _flight = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
  Offset? _drag; // drag vector from the ball (down = pull back)
  bool _bounce = false;
  bool _busy = false;
  Map<String, dynamic>? _animShot; // shot being animated
  String? _lastShotKey;
  final Set<int> _hiddenCups = {}; // cups already animated away

  Map<String, dynamic> get b => widget.session.board;
  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;
  bool get _teams => b['teams'] == true;
  List<int> get _targetRack => ((b['targetRack'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  List<_Cup> _rack(int idx) {
    final racks = (b['racks'] as List?) ?? const [];
    if (idx < 0 || idx >= racks.length) return const [];
    return ((racks[idx] as List?) ?? const [])
        .whereType<Map>()
        .map((m) => _Cup(id: (m['id'] as num?)?.toInt() ?? 0, x: (m['x'] as num?)?.toDouble() ?? 0.5, y: (m['y'] as num?)?.toDouble() ?? 0.9, alive: m['alive'] != false))
        .toList();
  }

  /// The rack shown at the far end = whatever the *viewing* seat shoots at.
  int get _viewRackIndex {
    final tr = _targetRack;
    final seat = widget.mySeat >= 0 ? widget.mySeat : math.max(0, widget.session.currentSeat);
    if (tr.isEmpty) return 0;
    // While an opponent shoots at *my* rack, still show my target rack (the
    // one I'm attacking) — but replay their shot on the near side as a badge.
    return seat < tr.length ? tr[seat] : 0;
  }

  @override
  void initState() {
    super.initState();
    _flight.addStatusListener((s) {
      if (s == AnimationStatus.completed) {
        final shot = _animShot;
        if (shot != null && shot['hitCup'] != null) {
          GameFeedback.hit();
          setState(() => _hiddenCups.add((shot['hitCup'] as num).toInt()));
        } else {
          GameFeedback.tap();
        }
        setState(() => _animShot = null);
      }
    });
  }

  @override
  void dispose() {
    _flight.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant CupPongBoard old) {
    super.didUpdateWidget(old);
    final shot = b['lastShot'];
    if (shot is Map) {
      final key = '${shot['seat']}-${shot['x']}-${shot['y']}-${widget.session.board['turnLog']}';
      if (key != _lastShotKey) {
        _lastShotKey = key;
        final s = Map<String, dynamic>.from(shot);
        // Animate only shots aimed at the rack we're displaying.
        final shooter = (s['seat'] as num?)?.toInt() ?? -1;
        final tr = _targetRack;
        if (shooter >= 0 && shooter < tr.length && tr[shooter] == _viewRackIndex) {
          _animShot = s;
          _flight.forward(from: 0);
        } else if (s['hitCup'] != null) {
          GameFeedback.roll();
        }
      }
    }
    // Server-side racks are authoritative; drop hidden ids that no longer exist (re-rack).
    final ids = _rack(_viewRackIndex).map((c) => c.id).toSet();
    _hiddenCups.removeWhere((id) => !ids.contains(id));
  }

  Future<void> _throw() async {
    final d = _drag;
    if (d == null || !_myTurn || _busy) return;
    final power = (d.distance / 170).clamp(0.2, 1.0);
    final angle = (-d.dx / 220).clamp(-0.6, 0.6);
    setState(() {
      _busy = true;
      _drag = null;
    });
    GameFeedback.move();
    await widget.onAction('throw', {'power': power, 'angle': angle, 'bounce': _bounce});
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _rerack() async {
    if (!_myTurn || _busy) return;
    setState(() => _busy = true);
    GameFeedback.tap();
    await widget.onAction('rerack', {});
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final seats = widget.session.seats;
    final players = ((b['players'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final ballsLeft = (b['ballsLeft'] as num?)?.toInt() ?? 2;
    final log = ((b['turnLog'] as List?) ?? const []).map((e) => e.toString()).toList();
    final rackIdx = _viewRackIndex;
    final cups = _rack(rackIdx);
    final alive = cups.where((c) => c.alive && !_hiddenCups.contains(c.id)).length;
    final rerackAvail = ((b['rerackAvailable'] as List?) ?? const []).map((e) => e == true).toList();
    final canRerack = _myTurn && alive >= 2 && alive <= 3 && rackIdx < rerackAvail.length && rerackAvail[rackIdx];
    final current = widget.session.currentSeat;
    final power = _drag == null ? 0.0 : (_drag!.distance / 170).clamp(0.2, 1.0);
    final angle = _drag == null ? 0.0 : (-_drag!.dx / 220).clamp(-0.6, 0.6);

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (_myTurn) {
      status = _drag == null ? 'Your throw · $ballsLeft ball${ballsLeft == 1 ? '' : 's'} — drag back and release' : 'Power ${(power * 100).round()}% — release to throw';
    } else {
      final name = current >= 0 && current < seats.length ? seats[current].displayName : 'Opponent';
      status = '$name is throwing…';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn, icon: Icons.sports_bar_rounded),
        const SizedBox(height: 6),
        // Score strip.
        Row(
          children: [
            for (var i = 0; i < seats.length; i++)
              Expanded(
                child: _PlayerChip(
                  session: widget.session,
                  seat: i,
                  cupsLeft: i < players.length ? (players[i]['cupsLeft'] as num?)?.toInt() ?? 10 : 10,
                  made: i < players.length ? (players[i]['made'] as num?)?.toInt() ?? 0 : 0,
                  active: widget.session.isInProgress && current == i,
                  team: _teams ? (i % 2 == 0 ? 'A' : 'B') : null,
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(6),
          child: Column(
            children: [
              AspectRatio(
                aspectRatio: 0.78,
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final size = Size(constraints.maxWidth, constraints.maxHeight);
                    final geo = _TableGeo(size);
                    return GestureDetector(
                      onPanStart: _myTurn && !_busy ? (d) => setState(() => _drag = Offset.zero) : null,
                      onPanUpdate: _myTurn && !_busy ? (d) => setState(() => _drag = (_drag ?? Offset.zero) + d.delta) : null,
                      onPanEnd: _myTurn && !_busy ? (_) => _throw() : null,
                      onPanCancel: () => setState(() => _drag = null),
                      child: Stack(
                        children: [
                          Positioned.fill(child: CustomPaint(painter: _TablePainter(geo: geo, accent: playground.accent))),
                          // Cups.
                          for (final c in cups)
                            if (c.alive)
                              Builder(
                                builder: (context) {
                                  final p = geo.project(c.x, c.y);
                                  final s = geo.cupSize(c.y);
                                  final hidden = _hiddenCups.contains(c.id);
                                  return AnimatedPositioned(
                                    duration: const Duration(milliseconds: 260),
                                    left: p.dx - s / 2,
                                    top: p.dy - s * 0.85,
                                    child: AnimatedScale(
                                      duration: const Duration(milliseconds: 260),
                                      scale: hidden ? 0 : 1,
                                      child: _CupWidget(size: s),
                                    ),
                                  );
                                },
                              ),
                          // Landing guide while aiming.
                          if (_drag != null && _myTurn)
                            Positioned.fill(
                              child: IgnorePointer(
                                child: CustomPaint(painter: _GuidePainter(geo: geo, power: power, angle: angle, bounce: _bounce, accent: playground.accent)),
                              ),
                            ),
                          // Ball in flight.
                          if (_animShot != null)
                            AnimatedBuilder(
                              animation: _flight,
                              builder: (context, _) {
                                final t = Curves.easeOut.transform(_flight.value);
                                final s = _animShot!;
                                final lx = (s['x'] as num?)?.toDouble() ?? 0.5;
                                final ly = (s['y'] as num?)?.toDouble() ?? 0.9;
                                final arc = (s['arc'] as num?)?.toDouble() ?? 0.5;
                                final bounce = s['bounce'] == true;
                                // Ground path from the near tee (0.5, 0.05) to the landing point.
                                final gx = 0.5 + (lx - 0.5) * t;
                                final gy = 0.05 + (ly - 0.05) * t;
                                final ground = geo.project(gx, gy);
                                double h;
                                if (bounce) {
                                  h = t < 0.6 ? math.sin(t / 0.6 * math.pi) * arc * 0.7 : math.sin((t - 0.6) / 0.4 * math.pi) * arc * 0.25;
                                } else {
                                  h = math.sin(t * math.pi) * arc;
                                }
                                final ball = ground - Offset(0, h * size.height * 0.55);
                                final r = 7.0 + (1 - gy) * 5;
                                return Stack(
                                  children: [
                                    Positioned(left: ground.dx - r * 0.8, top: ground.dy - r * 0.3, child: Container(width: r * 1.6, height: r * 0.6, decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.35 * (1 - h)), borderRadius: BorderRadius.all(Radius.elliptical(r, r * 0.4))))),
                                    Positioned(left: ball.dx - r, top: ball.dy - r, child: _Ball(size: r * 2)),
                                  ],
                                );
                              },
                            ),
                          // Resting ball at the tee when it's my turn.
                          if (_myTurn && _animShot == null)
                            Positioned(
                              left: geo.project(0.5, 0.05).dx - 9 + (_drag?.dx ?? 0) * 0.15,
                              top: geo.project(0.5, 0.05).dy - 9 + (_drag?.dy ?? 0) * 0.15,
                              child: const _Ball(size: 18),
                            ),
                          // Cups-left badge.
                          Positioned(
                            top: 6,
                            left: 6,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(8)),
                              child: Text('$alive cup${alive == 1 ? '' : 's'} to go', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                            ),
                          ),
                          // Balls left.
                          Positioned(
                            top: 6,
                            right: 6,
                            child: Row(
                              children: [
                                for (var i = 0; i < 2; i++)
                                  Padding(
                                    padding: const EdgeInsets.only(left: 3),
                                    child: Opacity(opacity: i < ballsLeft ? 1 : 0.25, child: const _Ball(size: 12)),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  _Chip(
                    label: 'Bounce ×2',
                    icon: Icons.sports_volleyball_rounded,
                    active: _bounce,
                    onTap: _myTurn ? () => setState(() => _bounce = !_bounce) : null,
                  ),
                  const SizedBox(width: 8),
                  if (canRerack) _Chip(label: 'Re-rack', icon: Icons.change_history_rounded, active: false, onTap: _busy ? null : _rerack),
                  const Spacer(),
                  SizedBox(
                    width: 120,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(value: _drag == null ? 0 : power, minHeight: 8, backgroundColor: Colors.white12, color: power > 0.85 ? AppColors.coral : AppColors.gold),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              // Commentary.
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.glassStroke)),
                child: Text(
                  log.isEmpty ? 'Sink both balls in a turn to get them back. Re-rack at 2–3 cups.' : log.first,
                  style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Geometry ──────────────────────────────────────────────────────────────────

/// Simple perspective: table y (0 near … 1 far) maps to screen rows with the
/// far end narrower and higher on screen.
class _TableGeo {
  _TableGeo(this.size);
  final Size size;

  double get nearW => size.width * 0.96;
  double get farW => size.width * 0.58;
  double get topY => size.height * 0.08;
  double get bottomY => size.height * 0.97;

  Offset project(double x, double y) {
    // Non-linear depth so the far cups compress a little.
    final d = math.pow(y.clamp(0.0, 1.1), 0.85).toDouble();
    final sy = bottomY - (bottomY - topY) * d;
    final w = nearW + (farW - nearW) * d;
    final sx = size.width / 2 + (x - 0.5) * w;
    return Offset(sx, sy);
  }

  double cupSize(double y) => 46 - 20 * y.clamp(0.0, 1.0);
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _CupWidget extends StatelessWidget {
  const _CupWidget({required this.size});
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size * 1.05,
      child: Stack(
        alignment: Alignment.topCenter,
        children: [
          // Body (trapezoid-ish via rounded rect + gradient).
          Positioned(
            top: size * 0.1,
            child: Container(
              width: size * 0.86,
              height: size * 0.95,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.vertical(top: Radius.circular(size * 0.1), bottom: Radius.circular(size * 0.22)),
                gradient: const LinearGradient(begin: Alignment.centerLeft, end: Alignment.centerRight, colors: [Color(0xFFB4121B), Color(0xFFE6323C), Color(0xFFFF6B6B), Color(0xFFD62828), Color(0xFF9E0E15)]),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: size * 0.15, offset: Offset(0, size * 0.12))],
              ),
            ),
          ),
          // Rim / mouth.
          Container(
            width: size,
            height: size * 0.34,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.all(Radius.elliptical(size / 2, size * 0.17)),
              gradient: const RadialGradient(colors: [Color(0xFFFFE0A8), Color(0xFFB37A3C)]),
              border: Border.all(color: const Color(0xFFFF8A8A), width: size * 0.06),
            ),
          ),
        ],
      ),
    );
  }
}

class _Ball extends StatelessWidget {
  const _Ball({required this.size});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const RadialGradient(center: Alignment(-0.35, -0.4), colors: [Colors.white, Color(0xFFFFF3C4), Color(0xFFE0A838)], stops: [0, 0.55, 1]),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: size * 0.3, offset: Offset(0, size * 0.15))],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.icon, required this.active, required this.onTap});
  final String label;
  final IconData icon;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Opacity(
        opacity: onTap == null ? 0.5 : 1,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: active ? AppColors.coral.withValues(alpha: 0.3) : Colors.black.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: active ? AppColors.coral : AppColors.glassStroke, width: active ? 1.6 : 1),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: active ? Colors.white : AppColors.textSecondary),
              const SizedBox(width: 6),
              Text(label, style: TextStyle(color: active ? Colors.white : AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ),
    );
  }
}

class _PlayerChip extends StatelessWidget {
  const _PlayerChip({required this.session, required this.seat, required this.cupsLeft, required this.made, required this.active, required this.team});
  final GameSessionView session;
  final int seat;
  final int cupsLeft;
  final int made;
  final bool active;
  final String? team;

  @override
  Widget build(BuildContext context) {
    final palette = TableSkins.paletteFor(session, seat);
    final name = seat < session.seats.length ? session.seats[seat].displayName : 'Seat $seat';
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      margin: const EdgeInsets.symmetric(horizontal: 3),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: active ? palette.base.withValues(alpha: 0.22) : AppColors.glassFill,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: active ? palette.light : AppColors.glassStroke, width: active ? 1.6 : 1),
        boxShadow: active ? [BoxShadow(color: palette.glow.withValues(alpha: 0.35), blurRadius: 10)] : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (team != null)
                Container(
                  margin: const EdgeInsets.only(right: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(color: palette.base, borderRadius: BorderRadius.circular(4)),
                  child: Text(team!, style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w900)),
                ),
              Expanded(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.textPrimary, fontSize: 11, fontWeight: FontWeight.w800))),
            ],
          ),
          Text('$cupsLeft left · $made sunk', style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
        ],
      ),
    );
  }
}

// ── Painters ──────────────────────────────────────────────────────────────────

class _TablePainter extends CustomPainter {
  _TablePainter({required this.geo, required this.accent});
  final _TableGeo geo;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    // Room backdrop.
    canvas.drawRect(Offset.zero & size, Paint()..shader = const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF14163A), Color(0xFF0A0B1E)]).createShader(Offset.zero & size));
    // Table top (trapezoid).
    final nl = geo.project(0, 0);
    final nr = geo.project(1, 0);
    final fl = geo.project(0, 1.06);
    final fr = geo.project(1, 1.06);
    final top = Path()
      ..moveTo(nl.dx, nl.dy)
      ..lineTo(nr.dx, nr.dy)
      ..lineTo(fr.dx, fr.dy)
      ..lineTo(fl.dx, fl.dy)
      ..close();
    canvas.drawPath(top, Paint()..shader = const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF6E4A2A), Color(0xFF8E6238), Color(0xFF5A3A20)]).createShader(Offset.zero & size));
    // Wood grain.
    final grain = Paint()
      ..color = Colors.black.withValues(alpha: 0.08)
      ..strokeWidth = 1;
    for (var i = 1; i < 9; i++) {
      final a = geo.project(i / 9, 0);
      final bb = geo.project(i / 9, 1.06);
      canvas.drawLine(a, bb, grain);
    }
    // Table edge highlight.
    canvas.drawPath(
      top,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = accent.withValues(alpha: 0.5),
    );
    // Front apron.
    final apron = Path()
      ..moveTo(nl.dx, nl.dy)
      ..lineTo(nr.dx, nr.dy)
      ..lineTo(nr.dx, size.height)
      ..lineTo(nl.dx, size.height)
      ..close();
    canvas.drawPath(apron, Paint()..color = const Color(0xFF3B2614));
    // Centre line & tee dot.
    canvas.drawLine(geo.project(0.5, 0.12), geo.project(0.5, 0.55), Paint()..color = Colors.white.withValues(alpha: 0.08)..strokeWidth = 1.5);
    canvas.drawCircle(geo.project(0.5, 0.05), 5, Paint()..color = Colors.black.withValues(alpha: 0.25));
  }

  @override
  bool shouldRepaint(covariant _TablePainter old) => old.geo.size != geo.size || old.accent != accent;
}

class _GuidePainter extends CustomPainter {
  _GuidePainter({required this.geo, required this.power, required this.angle, required this.bounce, required this.accent});
  final _TableGeo geo;
  final double power;
  final double angle;
  final bool bounce;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final ideal = 0.42 + power * 0.66;
    final lx = 0.5 + math.sin(angle) * ideal * 0.95;
    final land = geo.project(lx, ideal);
    final spread = 0.012 + power * 0.03 + (bounce ? 0.015 : 0);
    final rx = spread * 2.2 * geo.nearW;
    final ry = spread * 3.2 * (geo.bottomY - geo.topY) * 0.5;
    canvas.drawOval(Rect.fromCenter(center: land, width: rx * 2, height: ry * 2), Paint()..color = accent.withValues(alpha: 0.22));
    canvas.drawOval(
      Rect.fromCenter(center: land, width: rx * 2, height: ry * 2),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..color = accent,
    );
    // Dotted arc from the tee to the landing zone.
    final tee = geo.project(0.5, 0.05);
    final dot = Paint()..color = Colors.white.withValues(alpha: 0.8);
    for (var t = 0.08; t < 1; t += 0.08) {
      final gx = 0.5 + (lx - 0.5) * t;
      final gy = 0.05 + (ideal - 0.05) * t;
      final g = geo.project(gx, gy);
      final h = bounce ? (t < 0.6 ? math.sin(t / 0.6 * math.pi) * 0.5 : math.sin((t - 0.6) / 0.4 * math.pi) * 0.18) : math.sin(t * math.pi) * (0.35 + power * 0.5);
      canvas.drawCircle(g - Offset(0, h * size.height * 0.55), 2.2, dot);
    }
    canvas.drawCircle(tee, 4, Paint()..color = accent.withValues(alpha: 0.5));
  }

  @override
  bool shouldRepaint(covariant _GuidePainter old) => old.power != power || old.angle != angle || old.bounce != bounce;
}
