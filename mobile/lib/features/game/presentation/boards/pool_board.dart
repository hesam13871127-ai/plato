import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Pool 8-Ball — rebuilt as a top-down felt table with cushions, pockets,
/// ball set and cue power meter. The server is authoritative; the board is
/// visual + chat, shooting via power + angle.
class PoolBoard extends StatefulWidget {
  const PoolBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override
  State<PoolBoard> createState() => _PoolBoardState();
}

class _PoolBoardState extends State<PoolBoard> {
  double _power = 0.6;
  double _angle = 0; // radians, 0 = right
  String _skin = 'emerald';

  Map<String, dynamic> get b => widget.session.board;
  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  @override
  Widget build(BuildContext context) {
    final skin = BoardSkin.byId(_skin);
    final balls = (b['balls'] as List?)?.cast<Map>() ?? const [];
    final cueBall = (b['cueBall'] as Map?) ?? {'x': 0.25, 'y': 0.5};
    final scores = (b['scores'] as List?)?.whereType<num>().map((n)=>n.toInt()).toList() ?? const [0,0];
    final foul = b['foul'] as bool? ?? false;

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress
              ? (_myTurn ? (foul ? 'Foul — ball in hand, tap to place & shoot' : 'Your shot — drag angle, set power, shoot') : 'Opponent shooting…')
              : 'Game over',
          highlight: _myTurn,
          icon: Icons.sports_baseball,
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: 26,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: BoardSkin.all.length,
            separatorBuilder: (_, __) => const SizedBox(width: 6),
            itemBuilder: (_, i) {
              final s = BoardSkin.all[i];
              final sel = s.id == _skin;
              return GestureDetector(
                onTap: () { GameFeedback.tap(); setState(() => _skin = s.id); },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(
                    color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke),
                  ),
                  alignment: Alignment.center,
                  child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        // Table
        LayoutBuilder(builder: (context, c) {
          final w = c.maxWidth;
          final h = w * 0.62;
          return Container(
            width: w, height: h,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.10)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.45)!], begin: Alignment.topLeft, end: Alignment.bottomRight),
              border: Border.all(color: Colors.white.withOpacity(0.12), width: 1.2),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 22, offset: const Offset(0, 10)), BoxShadow(color: skin.accent.withOpacity(0.18), blurRadius: 28)],
            ),
            padding: const EdgeInsets.all(10),
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                gradient: LinearGradient(colors: [Color.lerp(skin.feltTop, Colors.white, 0.10)!, skin.feltTop, skin.feltBottom], begin: Alignment.topCenter, end: Alignment.bottomCenter),
                border: Border.all(color: Colors.white.withOpacity(0.10)),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius: 12, inset: true)],
              ),
              child: Stack(
                children: [
                  // pockets (6)
                  for (final p in _pocketPositions(w, h))
                    Positioned(
                      left: p.dx * w - 10, top: p.dy * h - 10,
                      child: Container(width: 20, height: 20, decoration: BoxDecoration(shape: BoxShape.circle, color: const Color(0xFF0B0B0B), border: Border.all(color: Color(0xFF2A2A2A), width: 2), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.6), blurRadius: 6)])),
                    ),
                  // balls
                  for (final ball in balls)
                    _BallDot(x: (ball['x'] as num?)?.toDouble() ?? 0.5, y: (ball['y'] as num?)?.toDouble() ?? 0.5, number: (ball['n'] as num?)?.toInt() ?? 1, w: w, h: h),
                  // cue ball
                  _CueBall(x: (cueBall['x'] as num?)?.toDouble() ?? 0.25, y: (cueBall['y'] as num?)?.toDouble() ?? 0.5, angle: _angle, power: _power, w: w, h: h, myTurn: _myTurn, onAngleChanged: (a)=> setState(()=>_angle=a)),
                  // aim line
                  if (_myTurn)
                    CustomPaint(size: Size(w, h), painter: _AimPainter(x: (cueBall['x'] as num?)?.toDouble() ?? 0.25, y: (cueBall['y'] as num?)?.toDouble() ?? 0.5, angle: _angle, power: _power, w: w, h: h)),
                ],
              ),
            ),
          );
        }),
        const SizedBox(height: 10),
        // scores + power
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.glassStroke)),
          child: Column(children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              _ScorePill(label: widget.session.seats.isNotEmpty ? widget.session.seats[0].displayName : 'You', score: scores.isNotEmpty ? scores[0] : 0, active: widget.session.currentSeat == 0),
              Container(width: 1, height: 28, color: AppColors.glassStroke),
              _ScorePill(label: widget.session.seats.length > 1 ? widget.session.seats[1].displayName : 'Foe', score: scores.length > 1 ? scores[1] : 0, active: widget.session.currentSeat == 1),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              const Icon(Icons.bolt, size: 14, color: AppColors.cosmicGold),
              const SizedBox(width: 6),
              const Text('Power', style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w700)),
              Expanded(child: Slider(value: _power, min: 0.15, max: 1, activeColor: AppColors.electricPurple, inactiveColor: AppColors.glassStroke, onChanged: _myTurn ? (v)=> setState(()=>_power=v) : null)),
              Text('${(_power*100).round()}%', style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w700)),
            ]),
          ]),
        ),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: ActionButton(label: 'Shoot', icon: Icons.adjust, color: AppColors.electricPurple, onPressed: _myTurn ? () { GameFeedback.hit(); widget.onAction('shoot', {'power': _power, 'angle': _angle}); } : null)),
          const SizedBox(width: 10),
          ActionButton(label: 'Chat', icon: Icons.chat_bubble_outline, color: AppColors.surfaceElevated, onPressed: () => GameFeedback.tap()),
        ]),
      ],
    );
  }

  List<Offset> _pocketPositions(double w, double h) => const [Offset(0.02,0.04), Offset(0.5,0.02), Offset(0.98,0.04), Offset(0.02,0.96), Offset(0.5,0.98), Offset(0.98,0.96)];
}

class _BallDot extends StatelessWidget {
  const _BallDot({required this.x, required this.y, required this.number, required this.w, required this.h});
  final double x, y; final int number; final double w, h;
  @override
  Widget build(BuildContext context) {
    final palette = _ballColor(number);
    final cx = x * w; final cy = y * h;
    return Positioned(
      left: cx - 13, top: cy - 13,
      child: Container(
        width: 26, height: 26,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(center: const Alignment(-0.3,-0.4), colors: [Color.lerp(palette, Colors.white, 0.45)!, palette, Color.lerp(palette, Colors.black, 0.35)!]),
          border: Border.all(color: Colors.white.withOpacity(0.75), width: 1.1),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.45), blurRadius: 6, offset: const Offset(0, 3)), BoxShadow(color: palette.withOpacity(0.4), blurRadius: 10)],
        ),
        child: Center(child: Text('$number', style: TextStyle(color: number == 8 ? Colors.white : (number > 8 ? Colors.white : Colors.white), fontSize: 11, fontWeight: FontWeight.w900, shadows: [Shadow(color: Colors.black.withOpacity(0.5), blurRadius: 2)]))),
      ),
    );
  }
  Color _ballColor(int n) {
    const m = {1: Color(0xFFFFD600), 2: Color(0xFF1E88E5), 3: Color(0xFFE53935), 4: Color(0xFF6A1B9A), 5: Color(0xFFFF6F00), 6: Color(0xFF2E7D32), 7: Color(0xFF6D4C41), 8: Color(0xFF111111), 9: Color(0xFFFFD600), 10: Color(0xFF1E88E5), 11: Color(0xFFE53935), 12: Color(0xFF6A1B9A), 13: Color(0xFFFF6F00), 14: Color(0xFF2E7D32), 15: Color(0xFF6D4C41)};
    return m[n] ?? const Color(0xFF78909C);
  }
}

class _CueBall extends StatelessWidget {
  const _CueBall({required this.x, required this.y, required this.angle, required this.power, required this.w, required this.h, required this.myTurn, required this.onAngleChanged});
  final double x, y, angle, power, w, h; final bool myTurn; final ValueChanged<double> onAngleChanged;
  @override
  Widget build(BuildContext context) {
    final cx = x * w; final cy = y * h;
    return Positioned(
      left: cx - 14, top: cy - 14,
      child: GestureDetector(
        onPanUpdate: myTurn ? (d) {
          final center = Offset(cx, cy);
          final pos = d.localPosition + Offset(cx-14, cy-14);
          final a = math.atan2(pos.dy - center.dy, pos.dx - center.dx);
          onAngleChanged(a);
        } : null,
        child: Container(
          width: 28, height: 28,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const RadialGradient(center: Alignment(-0.3,-0.35), colors: [Colors.white, Color(0xFFE8ECF5), Color(0xFFBAC2D8)]),
            border: Border.all(color: Colors.white, width: 1.2),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.45), blurRadius: 7, offset: const Offset(0, 3)), if (myTurn) BoxShadow(color: AppColors.softCyan.withOpacity(0.55), blurRadius: 14)],
          ),
          child: Center(child: Container(width: 6, height: 6, decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFFEF4444)))),
        ),
      ),
    );
  }
}

class _AimPainter extends CustomPainter {
  _AimPainter({required this.x, required this.y, required this.angle, required this.power, required this.w, required this.h});
  final double x, y, angle, power, w, h;
  @override
  void paint(Canvas canvas, Size size) {
    final cx = x * w; final cy = y * h;
    final len = 70 + power * 90;
    final ex = cx + math.cos(angle) * len;
    final ey = cy + math.sin(angle) * len;
    final p = Paint()..color = Colors.white.withOpacity(0.85)..strokeWidth = 2..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    // dashed
    const dash = 8.0, gap = 6.0;
    final total = math.sqrt(math.pow(ex-cx, 2)+math.pow(ey-cy,2));
    var d = 0.0;
    while (d < total) {
      final t0 = d/total; final t1 = math.min((d+dash)/total, 1);
      canvas.drawLine(Offset(cx + (ex-cx)*t0, cy + (ey-cy)*t0), Offset(cx + (ex-cx)*t1, cy + (ey-cy)*t1), p);
      d += dash+gap;
    }
    // power halo at tip
    canvas.drawCircle(Offset(ex, ey), 4 + power*4, Paint()..color = AppColors.softCyan.withOpacity(0.85));
  }
  @override
  bool shouldRepaint(covariant _AimPainter old) => old.angle != angle || old.power != power;
}

class _ScorePill extends StatelessWidget {
  const _ScorePill({required this.label, required this.score, required this.active});
  final String label; final int score; final bool active;
  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: active ? AppColors.success : AppColors.textMuted, boxShadow: active ? [BoxShadow(color: AppColors.success.withOpacity(0.6), blurRadius: 8)] : null)),
      const SizedBox(width: 8),
      Text(label, style: const TextStyle(color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w700)),
      const SizedBox(width: 8),
      Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: active ? AppColors.electricPurple.withOpacity(0.9) : AppColors.surfaceElevated, borderRadius: BorderRadius.circular(10)), child: Text('$score', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900))),
    ]);
  }
}
