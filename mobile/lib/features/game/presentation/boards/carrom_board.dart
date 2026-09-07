import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Carrom — a lacquered plywood board framed in dark wood, four net pockets,
/// the classic centre rosette and baselines. The board is always shown from
/// your side (seat 1 sees it flipped). Slide the striker along your baseline,
/// drag anywhere on the board to aim (a dotted guide with a ghost striker),
/// pick the power and flick. The server simulates the physics and streams the
/// piece positions, so the coins glide in real time for both players.
class CarromBoard extends StatefulWidget {
  const CarromBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<CarromBoard> createState() => _CarromBoardState();
}

class _Piece {
  _Piece({required this.id, required this.x, required this.y, required this.active, required this.color});
  final int id;
  final double x;
  final double y;
  final bool active;
  final String color;
}

class _CarromBoardState extends State<CarromBoard> {
  double? _angle; // radians in *engine* coordinates
  double _power = 0.6;
  double _strikerX = 0.5;
  String? _lastPhase;
  int _lastActive = -1;

  Map<String, dynamic> get b => widget.session.board;
  String get _phase => (b['phase'] as String?) ?? 'aim';
  int get _turnSeat => (b['turnSeat'] as num?)?.toInt() ?? widget.session.currentSeat;
  bool get _flip => widget.mySeat == 1;
  bool get _canAim => widget.session.isInProgress && _turnSeat == widget.mySeat && _phase == 'aim';

  List<_Piece> get _pieces => ((b['pieces'] as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _Piece(
            id: (m['id'] as num?)?.toInt() ?? 0,
            x: (m['x'] as num?)?.toDouble() ?? 0.5,
            y: (m['y'] as num?)?.toDouble() ?? 0.5,
            active: m['active'] != false,
            color: (m['color'] as String?) ?? 'white',
          ))
      .toList();

  List<String> get _colors => ((b['colors'] as List?) ?? const ['white', 'black']).map((e) => e.toString()).toList();

  @override
  void didUpdateWidget(covariant CarromBoard old) {
    super.didUpdateWidget(old);
    final active = _pieces.where((p) => p.active && p.color != 'striker').length;
    if (_lastActive >= 0 && active < _lastActive) GameFeedback.hit();
    _lastActive = active;
    if (_lastPhase == 'sim' && _phase == 'aim') {
      _angle = null;
      if (b['foul'] == true) GameFeedback.roll();
    }
    _lastPhase = _phase;
  }

  // Engine → view mapping (flip for seat 1 so my baseline is at the bottom).
  Offset _toView(double x, double y, double size) => Offset(x * size, (_flip ? 1 - y : y) * size);

  void _aimAt(Offset local, double size) {
    if (!_canAim) return;
    final strikerView = _toView(_strikerX, widget.mySeat == 0 ? 0.85 : 0.15, size);
    final d = local - strikerView;
    if (d.distance < 6) return;
    var a = math.atan2(d.dy, d.dx);
    if (_flip) a = -a; // undo the vertical flip for engine coordinates
    setState(() => _angle = a);
  }

  Future<void> _strike() async {
    final angle = _angle;
    if (angle == null || !_canAim) return;
    GameFeedback.hit();
    setState(() => _angle = null);
    await widget.onAction('strike', {'angle': angle, 'power': _power, 'x': _strikerX});
  }

  @override
  Widget build(BuildContext context) {
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final pieces = _pieces;
    final colors = _colors;
    final seats = widget.session.seats;
    final myColor = widget.mySeat >= 0 && widget.mySeat < colors.length ? colors[widget.mySeat] : 'white';
    final queen = pieces.where((p) => p.color == 'queen');
    final queenOnBoard = queen.isNotEmpty && queen.first.active;
    final queenBy = (b['queenClaimedBy'] as num?)?.toInt();
    final foul = b['foul'] == true;

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (_phase == 'sim') {
      status = 'Coins in motion…';
    } else if (_canAim) {
      status = _angle == null ? 'Your strike — slide, aim and flick' : 'Set the power and strike';
    } else {
      final name = _turnSeat >= 0 && _turnSeat < seats.length ? seats[_turnSeat].displayName : 'Opponent';
      status = '$name is striking…';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _canAim, icon: Icons.adjust_rounded),
        const SizedBox(height: 6),
        Row(
          children: [
            for (var seat = 0; seat < seats.length && seat < 2; seat++)
              Expanded(
                child: _SideCard(
                  session: widget.session,
                  seat: seat,
                  color: seat < colors.length ? colors[seat] : 'white',
                  remaining: pieces.where((p) => p.active && p.color == (seat < colors.length ? colors[seat] : 'white')).length,
                  hasQueen: queenBy == seat,
                  active: widget.session.isInProgress && _turnSeat == seat,
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(8),
          child: Column(
            children: [
              AspectRatio(
                aspectRatio: 1,
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final size = constraints.maxWidth;
                    return GestureDetector(
                      onPanDown: _canAim ? (d) => _aimAt(d.localPosition, size) : null,
                      onPanUpdate: _canAim ? (d) => _aimAt(d.localPosition, size) : null,
                      child: CustomPaint(
                        painter: _BoardPainter(accent: playground.accent),
                        foregroundPainter: _canAim && _angle != null
                            ? _GuidePainter(
                                angleView: _flip ? -_angle! : _angle!,
                                striker: _toView(_strikerX, widget.mySeat == 0 ? 0.85 : 0.15, size),
                                power: _power,
                                accent: playground.accent,
                              )
                            : null,
                        child: Stack(
                          children: [
                            for (final p in pieces)
                              if (p.active && p.color != 'striker' && (p.color != 'queen' || queenOnBoard))
                                AnimatedPositioned(
                                  key: ValueKey(p.id),
                                  duration: const Duration(milliseconds: 90),
                                  left: _toView(p.x, p.y, size).dx - size * 0.032,
                                  top: _toView(p.x, p.y, size).dy - size * 0.032,
                                  child: _Coin(kind: p.color, size: size * 0.064, mine: p.color == myColor),
                                ),
                            // Striker: at rest we draw it where the player is placing it.
                            Builder(
                              builder: (context) {
                                final strikers = pieces.where((p) => p.color == 'striker');
                                if (strikers.isEmpty) return const SizedBox.shrink();
                                final s = strikers.first;
                                final resting = _phase == 'aim';
                                final baseY = _turnSeat == 0 ? 0.85 : 0.15;
                                final px = resting ? (_canAim ? _strikerX : 0.5) : s.x;
                                final py = resting ? baseY : s.y;
                                if (!resting && !s.active) return const SizedBox.shrink();
                                final v = _toView(px, py, size);
                                return AnimatedPositioned(
                                  duration: Duration(milliseconds: resting ? 120 : 90),
                                  left: v.dx - size * 0.045,
                                  top: v.dy - size * 0.045,
                                  child: _Striker(size: size * 0.09, glow: _canAim ? playground.accent : null),
                                );
                              },
                            ),
                            if (foul && _phase == 'aim')
                              Positioned(
                                top: 8,
                                left: 0,
                                right: 0,
                                child: Center(
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                                    decoration: BoxDecoration(color: AppColors.coral.withValues(alpha: 0.85), borderRadius: BorderRadius.circular(10)),
                                    child: const Text('FOUL · striker pocketed, a coin returns', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                                  ),
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
              // Controls.
              Row(
                children: [
                  const Icon(Icons.swap_horiz_rounded, color: AppColors.textSecondary, size: 18),
                  Expanded(
                    child: SliderTheme(
                      data: SliderTheme.of(context).copyWith(activeTrackColor: playground.accent, thumbColor: playground.accent, inactiveTrackColor: Colors.white24, trackHeight: 3),
                      child: Slider(
                        value: _strikerX,
                        min: 0.15,
                        max: 0.85,
                        onChanged: _canAim ? (v) => setState(() => _strikerX = v) : null,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Icon(Icons.bolt_rounded, color: AppColors.gold, size: 18),
                  Expanded(
                    child: SliderTheme(
                      data: SliderTheme.of(context).copyWith(activeTrackColor: AppColors.gold, thumbColor: AppColors.gold, inactiveTrackColor: Colors.white24, trackHeight: 3),
                      child: Slider(
                        value: _power,
                        min: 0.1,
                        max: 1,
                        onChanged: _canAim ? (v) => setState(() => _power = v) : null,
                      ),
                    ),
                  ),
                  SizedBox(width: 34, child: Text('${(_power * 100).round()}%', style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w800))),
                ],
              ),
              ActionButton(
                label: !_canAim ? (_phase == 'sim' ? 'Coins rolling…' : 'Waiting') : (_angle == null ? 'Drag on the board to aim' : 'Strike!'),
                icon: Icons.sports_handball_rounded,
                color: AppColors.gold,
                onPressed: _canAim && _angle != null ? _strike : null,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Pieces ────────────────────────────────────────────────────────────────────

class _Coin extends StatelessWidget {
  const _Coin({required this.kind, required this.size, required this.mine});
  final String kind;
  final double size;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final Color base;
    final Color rim;
    switch (kind) {
      case 'black':
        base = const Color(0xFF2B2622);
        rim = const Color(0xFF6B5A4A);
        break;
      case 'queen':
        base = const Color(0xFFD62839);
        rim = const Color(0xFFFFB3B3);
        break;
      default:
        base = const Color(0xFFF3E7C9);
        rim = const Color(0xFFB99B63);
    }
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(center: const Alignment(-0.35, -0.4), colors: [Color.lerp(base, Colors.white, 0.45)!, base, Color.lerp(base, Colors.black, 0.35)!], stops: const [0, 0.55, 1]),
        border: Border.all(color: rim, width: size * 0.06),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.55), blurRadius: size * 0.2, offset: Offset(0, size * 0.08)),
          if (mine) BoxShadow(color: Colors.white.withValues(alpha: 0.18), blurRadius: size * 0.3),
        ],
      ),
      child: Center(
        child: Container(
          width: size * 0.42,
          height: size * 0.42,
          decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: rim.withValues(alpha: 0.8), width: 1)),
        ),
      ),
    );
  }
}

class _Striker extends StatelessWidget {
  const _Striker({required this.size, this.glow});
  final double size;
  final Color? glow;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const RadialGradient(center: Alignment(-0.35, -0.4), colors: [Colors.white, Color(0xFF9FD8FF), Color(0xFF2E6FA8)], stops: [0, 0.5, 1]),
        border: Border.all(color: Colors.white, width: size * 0.05),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: size * 0.2, offset: Offset(0, size * 0.08)),
          if (glow != null) BoxShadow(color: glow!.withValues(alpha: 0.7), blurRadius: size * 0.5),
        ],
      ),
      child: Center(
        child: Container(
          width: size * 0.36,
          height: size * 0.36,
          decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.8), width: 1.2)),
        ),
      ),
    );
  }
}

class _SideCard extends StatelessWidget {
  const _SideCard({required this.session, required this.seat, required this.color, required this.remaining, required this.hasQueen, required this.active});
  final GameSessionView session;
  final int seat;
  final String color;
  final int remaining;
  final bool hasQueen;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final palette = TableSkins.paletteFor(session, seat);
    final name = seat < session.seats.length ? session.seats[seat].displayName : 'Seat $seat';
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      margin: const EdgeInsets.symmetric(horizontal: 4),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: active ? palette.base.withValues(alpha: 0.22) : AppColors.glassFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: active ? palette.light : AppColors.glassStroke, width: active ? 1.6 : 1),
        boxShadow: active ? [BoxShadow(color: palette.glow.withValues(alpha: 0.35), blurRadius: 12)] : null,
      ),
      child: Row(
        children: [
          _Coin(kind: color, size: 26, mine: false),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w800)),
                Text('$remaining ${color == 'black' ? 'black' : 'white'} left', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
              ],
            ),
          ),
          if (hasQueen) const _Coin(kind: 'queen', size: 20, mine: false),
        ],
      ),
    );
  }
}

// ── Painters ──────────────────────────────────────────────────────────────────

class _BoardPainter extends CustomPainter {
  _BoardPainter({required this.accent});
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    final full = Offset.zero & size;
    // Frame.
    final frame = RRect.fromRectAndRadius(full, Radius.circular(s * 0.05));
    canvas.drawRRect(
      frame,
      Paint()..shader = const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF5A3A22), Color(0xFF2E1B10)]).createShader(full),
    );
    // Playing surface (engine coordinates map to the full square; frame is drawn
    // inside the pocket margin so positions stay exact).
    final inner = Rect.fromLTWH(s * 0.03, s * 0.03, s * 0.94, s * 0.94);
    canvas.drawRRect(
      RRect.fromRectAndRadius(inner, Radius.circular(s * 0.02)),
      Paint()..shader = const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFF1DDB0), Color(0xFFE2C58F), Color(0xFFD9B77C)]).createShader(inner),
    );
    // Wood grain lines.
    final grain = Paint()
      ..color = const Color(0xFFB99B63).withValues(alpha: 0.18)
      ..strokeWidth = 1;
    for (var i = 0; i < 26; i++) {
      final y = inner.top + inner.height * (i + 0.5) / 26 + math.sin(i * 1.7) * 2;
      canvas.drawLine(Offset(inner.left, y), Offset(inner.right, y), grain);
    }
    // Baselines (two lines with end circles) on all four sides.
    final line = Paint()
      ..color = const Color(0xFF3B2A1A)
      ..strokeWidth = 1.4
      ..style = PaintingStyle.stroke;
    void baseline(double y) {
      canvas.drawLine(Offset(s * 0.18, y), Offset(s * 0.82, y), line);
      canvas.drawLine(Offset(s * 0.18, y + s * 0.03), Offset(s * 0.82, y + s * 0.03), line);
      for (final x in [s * 0.18, s * 0.82]) {
        canvas.drawCircle(Offset(x, y + s * 0.015), s * 0.02, line);
        canvas.drawCircle(Offset(x, y + s * 0.015), s * 0.008, Paint()..color = const Color(0xFFD62839));
      }
    }
    baseline(s * 0.135);
    baseline(s * 0.835);
    canvas.save();
    canvas.translate(s / 2, s / 2);
    canvas.rotate(math.pi / 2);
    canvas.translate(-s / 2, -s / 2);
    baseline(s * 0.135);
    baseline(s * 0.835);
    canvas.restore();
    // Centre rosette.
    final c = Offset(s / 2, s / 2);
    canvas.drawCircle(c, s * 0.16, line);
    canvas.drawCircle(c, s * 0.035, Paint()..color = const Color(0xFFD62839).withValues(alpha: 0.85));
    canvas.drawCircle(c, s * 0.16, Paint()..color = const Color(0xFFD62839).withValues(alpha: 0.06));
    for (var i = 0; i < 8; i++) {
      final a = i * math.pi / 4;
      final p1 = c + Offset(math.cos(a), math.sin(a)) * s * 0.06;
      final p2 = c + Offset(math.cos(a), math.sin(a)) * s * 0.15;
      canvas.drawLine(p1, p2, line..strokeWidth = 1);
    }
    // Diagonal arrows toward pockets.
    final arrow = Paint()
      ..color = const Color(0xFF3B2A1A)
      ..strokeWidth = 1.2;
    for (final d in const [Offset(1, 1), Offset(-1, 1), Offset(1, -1), Offset(-1, -1)]) {
      final from = c + d * s * 0.2;
      final to = c + d * s * 0.36;
      canvas.drawLine(from, to, arrow);
      canvas.drawCircle(to, s * 0.012, arrow);
    }
    // Pockets (engine: 0.08 from the corners, radius 0.09 → draw net holes).
    for (final p in const [Offset(0.08, 0.08), Offset(0.92, 0.08), Offset(0.08, 0.92), Offset(0.92, 0.92)]) {
      final pc = Offset(p.dx * s, p.dy * s);
      canvas.drawCircle(pc, s * 0.052, Paint()..color = Colors.black.withValues(alpha: 0.35));
      canvas.drawCircle(pc, s * 0.046, Paint()..shader = const RadialGradient(colors: [Color(0xFF1B140E), Color(0xFF3A2A1A)]).createShader(Rect.fromCircle(center: pc, radius: s * 0.046)));
      // Net mesh.
      final mesh = Paint()
        ..color = Colors.white.withValues(alpha: 0.12)
        ..strokeWidth = 0.8;
      for (var i = -3; i <= 3; i++) {
        canvas.drawLine(pc + Offset(i * s * 0.012, -s * 0.04), pc + Offset(i * s * 0.012, s * 0.04), mesh);
        canvas.drawLine(pc + Offset(-s * 0.04, i * s * 0.012), pc + Offset(s * 0.04, i * s * 0.012), mesh);
      }
    }
    // Soft vignette + accent glow on the frame edge.
    canvas.drawRRect(
      frame,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = accent.withValues(alpha: 0.35),
    );
  }

  @override
  bool shouldRepaint(covariant _BoardPainter old) => old.accent != accent;
}

class _GuidePainter extends CustomPainter {
  _GuidePainter({required this.angleView, required this.striker, required this.power, required this.accent});
  final double angleView;
  final Offset striker;
  final double power;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final dir = Offset(math.cos(angleView), math.sin(angleView));
    final length = size.width * (0.25 + 0.55 * power);
    // Dotted guide.
    final dot = Paint()..color = Colors.white.withValues(alpha: 0.85);
    for (var d = size.width * 0.06; d < length; d += size.width * 0.03) {
      final p = striker + dir * d;
      if (p.dx < 0 || p.dy < 0 || p.dx > size.width || p.dy > size.height) break;
      canvas.drawCircle(p, 2.2, dot);
    }
    // Ghost striker at the end of the guide.
    final end = striker + dir * length;
    canvas.drawCircle(end, size.width * 0.045, Paint()..color = accent.withValues(alpha: 0.22));
    canvas.drawCircle(
      end,
      size.width * 0.045,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..color = accent.withValues(alpha: 0.9),
    );
    // Pull-back flick indicator behind the striker.
    final back = striker - dir * (size.width * 0.05 + size.width * 0.08 * power);
    canvas.drawLine(
      striker - dir * size.width * 0.05,
      back,
      Paint()
        ..color = AppColors.gold
        ..strokeWidth = 4
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(covariant _GuidePainter old) => old.angleView != angleView || old.striker != striker || old.power != power || old.accent != accent;
}
