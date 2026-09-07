import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Pool 8-Ball. A square table (server coordinates are 0..1 on both axes)
/// with six pockets, diamond sights, rendered solids/stripes and a cue stick.
/// Drag anywhere on the felt to aim — the cue and a guide line follow — then
/// set power and shoot. The server runs the physics and streams positions.
class PoolBoard extends StatefulWidget {
  const PoolBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<PoolBoard> createState() => _PoolBoardState();
}

class _PoolBoardState extends State<PoolBoard> {
  double? _angle; // radians, aim direction from the cue ball
  double _power = 0.65;
  Size _boardSize = Size.zero;

  Map<String, dynamic> get b => widget.session.board;

  List<Map<String, dynamic>> get _balls =>
      ((b['balls'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  bool get _myTurn {
    final turnSeat = (b['turnSeat'] as num?)?.toInt() ?? widget.session.currentSeat;
    return widget.session.isInProgress && turnSeat == widget.mySeat;
  }

  bool get _simulating => (b['phase'] as String?) == 'sim';
  bool get _canAim => _myTurn && !_simulating;

  Offset? _cueCenter(Size size) {
    final cue = _balls.firstWhere((x) => (x['group'] as String?) == 'cue', orElse: () => <String, dynamic>{});
    if (cue.isEmpty) return null;
    return Offset((cue['x'] as num).toDouble() * size.width, (cue['y'] as num).toDouble() * size.height);
  }

  void _aimAt(Offset local) {
    final cue = _cueCenter(_boardSize);
    if (cue == null) return;
    final d = local - cue;
    if (d.distance < 4) return;
    setState(() => _angle = math.atan2(d.dy, d.dx));
  }

  void _shoot() {
    if (_angle == null) return;
    GameFeedback.hit();
    widget.onAction('shoot', {'angle': _angle, 'power': _power});
    setState(() => _angle = null);
  }

  @override
  Widget build(BuildContext context) {
    final foul = b['foul'] == true;
    final scratch = b['scratch'] == true;
    final groups = (b['groups'] as List?) ?? const [];
    final turnSeat = (b['turnSeat'] as num?)?.toInt() ?? widget.session.currentSeat;
    final myGroup = widget.mySeat >= 0 && widget.mySeat < groups.length ? (groups[widget.mySeat] as String? ?? '') : '';
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final balls = _balls;
    final solidsLeft = balls.where((x) => x['group'] == 'solid' && x['active'] == true).length;
    final stripesLeft = balls.where((x) => x['group'] == 'stripe' && x['active'] == true).length;

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (_simulating) {
      status = 'Balls rolling…';
    } else if (_myTurn) {
      status = scratch ? 'Scratch! Your shot' : (foul ? 'Foul by opponent — your shot' : 'Your shot — drag to aim');
    } else {
      final name = turnSeat >= 0 && turnSeat < widget.session.seats.length ? widget.session.seats[turnSeat].displayName : 'Opponent';
      status = '$name is shooting…';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _canAim, icon: Icons.sports_esports),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (var i = 0; i < 2 && i < widget.session.seats.length; i++)
                _PlayerGroup(
                  session: widget.session,
                  seat: i,
                  isMe: i == widget.mySeat,
                  group: i < groups.length ? (groups[i] as String? ?? '') : '',
                  left: i < groups.length && groups[i] == 'solid' ? solidsLeft : (i < groups.length && groups[i] == 'stripe' ? stripesLeft : null),
                  active: turnSeat == i && widget.session.isInProgress,
                ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(6),
          child: AspectRatio(
            aspectRatio: 1,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final size = constraints.biggest;
                _boardSize = size;
                return GestureDetector(
                  onPanDown: _canAim ? (d) => _aimAt(d.localPosition) : null,
                  onPanUpdate: _canAim ? (d) => _aimAt(d.localPosition) : null,
                  child: CustomPaint(
                    painter: _TablePainter(playground: playground),
                    foregroundPainter: _canAim && _angle != null
                        ? _CuePainter(angle: _angle!, cue: _cueCenter(size), power: _power, accent: playground.accent, balls: balls, size: size)
                        : null,
                    child: Stack(
                      children: [
                        for (final ball in balls)
                          if (ball['active'] == true)
                            AnimatedPositioned(
                              key: ValueKey('ball-${ball['id']}'),
                              duration: const Duration(milliseconds: 90),
                              curve: Curves.linear,
                              left: (ball['x'] as num).toDouble() * size.width - size.width * 0.028,
                              top: (ball['y'] as num).toDouble() * size.height - size.width * 0.028,
                              child: _Ball(
                                id: (ball['id'] as num).toInt(),
                                group: ball['group'] as String? ?? 'cue',
                                size: size.width * 0.056,
                              ),
                            ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 8),
        if (_canAim) ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                const Icon(Icons.bolt_rounded, size: 16, color: AppColors.gold),
                const SizedBox(width: 4),
                const Text('Power', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                Expanded(
                  child: SliderTheme(
                    data: SliderTheme.of(context).copyWith(
                      trackHeight: 6,
                      activeTrackColor: playground.accent,
                      inactiveTrackColor: Colors.white.withValues(alpha: 0.12),
                      thumbColor: Colors.white,
                      overlayColor: playground.accent.withValues(alpha: 0.2),
                    ),
                    child: Slider(
                      value: _power,
                      min: 0.2,
                      max: 1,
                      onChanged: (v) => setState(() => _power = v),
                      onChangeEnd: (_) => GameFeedback.tap(),
                    ),
                  ),
                ),
                SizedBox(width: 34, child: Text('${(_power * 100).round()}%', style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w800))),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ActionButton(
              label: _angle == null ? 'Drag on the table to aim' : 'Shoot',
              icon: Icons.sports_esports_rounded,
              onPressed: _angle == null ? null : _shoot,
              expanded: true,
            ),
          ),
        ] else if (myGroup.isNotEmpty)
          Text(
            'You are ${myGroup == 'solid' ? 'solids ●' : 'stripes ◍'} — pocket them all, then the 8.',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
          ),
      ],
    );
  }
}

class _PlayerGroup extends StatelessWidget {
  const _PlayerGroup({required this.session, required this.seat, required this.isMe, required this.group, required this.left, required this.active});
  final GameSessionView session;
  final int seat;
  final bool isMe;
  final String group;
  final int? left;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final name = isMe ? 'You' : session.seats[seat].displayName;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: active ? AppColors.electricPurple.withValues(alpha: 0.28) : AppColors.glassFill,
        border: Border.all(color: active ? AppColors.softCyan : AppColors.glassStroke),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (group.isEmpty)
            SkinnedPiece(skin: TableSkins.pieceSkin(session.cosmeticsOf(seat).piece), seat: seat, size: 16)
          else
            _Ball(id: group == 'solid' ? 1 : 9, group: group, size: 18),
          const SizedBox(width: 6),
          Text(name, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 12)),
          if (left != null) ...[
            const SizedBox(width: 6),
            Text('$left left', style: TextStyle(color: active ? AppColors.softCyan : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)),
          ] else ...[
            const SizedBox(width: 6),
            const Text('open', style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
          ],
        ],
      ),
    );
  }
}

/// A rendered pool ball: solid colour, stripe band or the black 8, with a
/// numbered white spot and a glossy highlight.
class _Ball extends StatelessWidget {
  const _Ball({required this.id, required this.group, required this.size});
  final int id;
  final String group;
  final double size;

  static const _colors = {
    1: Color(0xFFFFC857), // yellow
    2: Color(0xFF3D7BFF), // blue
    3: Color(0xFFFF4D4D), // red
    4: Color(0xFF8A3DFF), // purple
    5: Color(0xFFFF8A3D), // orange
    6: Color(0xFF2ECC71), // green
    7: Color(0xFF8B1E3F), // maroon
  };

  @override
  Widget build(BuildContext context) {
    final isCue = group == 'cue';
    final isEight = group == 'eight' || id == 8;
    final base = isCue ? Colors.white : (isEight ? const Color(0xFF14141C) : _colors[id > 8 ? id - 8 : id] ?? AppColors.coral);
    final striped = group == 'stripe';
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: striped ? Colors.white : base,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.55), blurRadius: size * 0.2, offset: Offset(0, size * 0.1))],
      ),
      child: ClipOval(
        child: Stack(
          alignment: Alignment.center,
          children: [
            if (striped)
              Container(
                height: size * 0.56,
                width: size,
                color: base,
              ),
            if (!isCue)
              Container(
                width: size * 0.46,
                height: size * 0.46,
                decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
                alignment: Alignment.center,
                child: Text(
                  '$id',
                  style: TextStyle(color: const Color(0xFF14141C), fontSize: size * 0.3, fontWeight: FontWeight.w900, height: 1),
                ),
              ),
            // Gloss.
            Positioned(
              left: size * 0.18,
              top: size * 0.12,
              child: Container(
                width: size * 0.32,
                height: size * 0.2,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.all(Radius.elliptical(size * 0.16, size * 0.1)),
                  gradient: LinearGradient(colors: [Colors.white.withValues(alpha: 0.9), Colors.white.withValues(alpha: 0)]),
                ),
              ),
            ),
            // Shade.
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    center: const Alignment(-0.3, -0.4),
                    radius: 1.1,
                    colors: [Colors.transparent, Colors.black.withValues(alpha: 0.35)],
                    stops: const [0.55, 1],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Felt, cushions, pockets and diamond sights.
class _TablePainter extends CustomPainter {
  _TablePainter({required this.playground});
  final PlaygroundSkin playground;

  static const pockets = [[0.04, 0.06], [0.5, 0.03], [0.96, 0.06], [0.04, 0.94], [0.5, 0.97], [0.96, 0.94]];

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final rail = RRect.fromRectAndRadius(rect, const Radius.circular(22));
    // Wooden rail.
    canvas.drawRRect(
      rail,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color.lerp(playground.rail, Colors.white, 0.2)!, playground.rail, Color.lerp(playground.rail, Colors.black, 0.4)!],
        ).createShader(rect),
    );
    // Felt.
    final inset = size.width * 0.075;
    final felt = RRect.fromRectAndRadius(rect.deflate(inset), const Radius.circular(10));
    final feltColor = Color.lerp(playground.feltTop, playground.feltBottom, 0.35)!;
    canvas.drawRRect(
      felt,
      Paint()
        ..shader = RadialGradient(
          radius: 0.9,
          colors: [Color.lerp(feltColor, Colors.white, 0.12)!, feltColor, Color.lerp(feltColor, Colors.black, 0.25)!],
        ).createShader(rect),
    );
    // Cushion edge shadow.
    canvas.drawRRect(
      felt,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5
        ..color = Colors.black.withValues(alpha: 0.35)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
    );
    // Head string + foot spot.
    final line = Paint()
      ..color = Colors.white.withValues(alpha: 0.12)
      ..strokeWidth = 1;
    canvas.drawLine(Offset(inset, size.height * 0.75), Offset(size.width - inset, size.height * 0.75), line);
    canvas.drawCircle(Offset(size.width / 2, size.height * 0.25), 2.5, Paint()..color = Colors.white.withValues(alpha: 0.25));
    // Diamond sights on the rail.
    final diamond = Paint()..color = Colors.white.withValues(alpha: 0.7);
    for (var i = 1; i < 8; i++) {
      if (i == 4) continue;
      final t = i / 8;
      _diamond(canvas, Offset(inset + (size.width - 2 * inset) * t, inset * 0.45), 3, diamond);
      _diamond(canvas, Offset(inset + (size.width - 2 * inset) * t, size.height - inset * 0.45), 3, diamond);
      _diamond(canvas, Offset(inset * 0.45, inset + (size.height - 2 * inset) * t), 3, diamond);
      _diamond(canvas, Offset(size.width - inset * 0.45, inset + (size.height - 2 * inset) * t), 3, diamond);
    }
    // Pockets.
    for (final p in pockets) {
      final c = Offset(p[0] * size.width, p[1] * size.height);
      canvas.drawCircle(c, size.width * 0.052, Paint()..color = Colors.black.withValues(alpha: 0.55)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3));
      canvas.drawCircle(
        c,
        size.width * 0.046,
        Paint()
          ..shader = RadialGradient(colors: [const Color(0xFF05060A), Colors.black.withValues(alpha: 0.9)]).createShader(Rect.fromCircle(center: c, radius: size.width * 0.05)),
      );
      canvas.drawCircle(c, size.width * 0.046, Paint()..style = PaintingStyle.stroke..strokeWidth = 1.5..color = playground.glow.withValues(alpha: 0.35));
    }
  }

  void _diamond(Canvas canvas, Offset c, double r, Paint p) {
    final path = Path()
      ..moveTo(c.dx, c.dy - r)
      ..lineTo(c.dx + r, c.dy)
      ..lineTo(c.dx, c.dy + r)
      ..lineTo(c.dx - r, c.dy)
      ..close();
    canvas.drawPath(path, p);
  }

  @override
  bool shouldRepaint(covariant _TablePainter old) => old.playground.id != playground.id;
}

/// Aim guide: cue stick behind the cue ball, dotted guide line to the first
/// obstruction and a ghost ball at the contact point.
class _CuePainter extends CustomPainter {
  _CuePainter({required this.angle, required this.cue, required this.power, required this.accent, required this.balls, required this.size});
  final double angle;
  final Offset? cue;
  final double power;
  final Color accent;
  final List<Map<String, dynamic>> balls;
  final Size size;

  @override
  void paint(Canvas canvas, Size s) {
    final c = cue;
    if (c == null) return;
    final dir = Offset(math.cos(angle), math.sin(angle));
    final ballR = s.width * 0.028;

    // Find first ball along the line (ghost ball position).
    double hitDist = double.infinity;
    for (final b in balls) {
      if (b['group'] == 'cue' || b['active'] != true) continue;
      final p = Offset((b['x'] as num).toDouble() * s.width, (b['y'] as num).toDouble() * s.height);
      final rel = p - c;
      final along = rel.dx * dir.dx + rel.dy * dir.dy;
      if (along <= 0) continue;
      final perp = (rel - dir * along).distance;
      if (perp < ballR * 2) {
        final back = math.sqrt(math.max(0, (ballR * 2) * (ballR * 2) - perp * perp));
        final d = along - back;
        if (d < hitDist) hitDist = d;
      }
    }
    final maxLen = hitDist.isFinite ? hitDist : s.width * 0.9;
    final end = c + dir * maxLen;

    // Dotted guide.
    final guide = Paint()
      ..color = accent.withValues(alpha: 0.85)
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    final total = (end - c).distance;
    for (double d = ballR + 4; d < total; d += 10) {
      canvas.drawCircle(c + dir * d, 1.5, guide);
    }
    if (hitDist.isFinite) {
      canvas.drawCircle(end, ballR, Paint()..style = PaintingStyle.stroke..strokeWidth = 1.5..color = Colors.white.withValues(alpha: 0.8));
    }

    // Cue stick behind the ball; pulls back with power.
    final pull = ballR * 1.6 + power * s.width * 0.06;
    final butt = c - dir * (pull + s.width * 0.42);
    final tip = c - dir * pull;
    final stick = Paint()
      ..strokeWidth = s.width * 0.012
      ..strokeCap = StrokeCap.round
      ..shader = LinearGradient(colors: const [Color(0xFF3A2314), Color(0xFFD9A46A), Color(0xFFF2D9B0)]).createShader(Rect.fromPoints(butt, tip));
    canvas.drawLine(butt, tip, Paint()..strokeWidth = s.width * 0.016..strokeCap = StrokeCap.round..color = Colors.black.withValues(alpha: 0.35));
    canvas.drawLine(butt, tip, stick);
    canvas.drawCircle(tip, s.width * 0.007, Paint()..color = const Color(0xFF5DB8FF));
  }

  @override
  bool shouldRepaint(covariant _CuePainter old) => old.angle != angle || old.power != power || old.cue != cue || old.balls != balls;
}
