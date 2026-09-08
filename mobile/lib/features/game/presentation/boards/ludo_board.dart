import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Ludo — 3D rebuilt: star-shaped track, glossy tokens with shadows, home
/// yards with ring lights, dice with real pips, and 2–4 player auto-layout.
/// Shop skins tint the felt and token glow.
class LudoBoard extends StatefulWidget {
  const LudoBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override
  State<LudoBoard> createState() => _LudoBoardState();
}

class _LudoBoardState extends State<LudoBoard> {
  String _skin = 'midnight';
  static const _palettes = [PiecePalette.cyan, PiecePalette.red, PiecePalette.green, PiecePalette.yellow];
  static const _seatColors = [AppColors.softCyan, AppColors.danger, AppColors.success, AppColors.warning];

  Map<String, dynamic> get b => widget.session.board;
  List<List<int>> get _tokens {
    final raw = (b['tokens'] as List?) ?? const [];
    return raw.map<List<int>>((seat) => ((seat as List?) ?? const []).map<int>((t) => ((t is Map ? t['progress'] : null) as num?)?.toInt() ?? -1).toList()).toList();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = _tokens;
    final die = (b['die'] as num?)?.toInt();
    final hasRolled = (b['hasRolled'] as bool?) ?? false;
    final myTurn = widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;
    final skin = BoardSkin.byId(_skin);
    final seatCount = widget.session.seats.length.clamp(2, 4);

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress ? (!myTurn ? 'Waiting for opponents…' : hasRolled ? 'Tap a glowing token to move' : 'Roll the die!') : 'Game over',
          highlight: myTurn, icon: Icons.casino,
        ),
        const SizedBox(height: 6),
        SizedBox(height: 26, child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: BoardSkin.all.length,
          separatorBuilder: (_, __) => const SizedBox(width: 6),
          itemBuilder: (_, i) {
            final s = BoardSkin.all[i]; final sel = s.id == _skin;
            return GestureDetector(onTap: (){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal: 10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700))));
          },
        )),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.10)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.40)!], begin: Alignment.topLeft, end: Alignment.bottomRight),
            border: Border.all(color: Colors.white.withOpacity(0.12)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 22, offset: const Offset(0, 10)), BoxShadow(color: skin.accent.withOpacity(0.16), blurRadius: 28)],
          ),
          child: Column(children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
              for (var i = 0; i < seatCount; i++)
                Row(children: [
                  Container(width: 10, height: 10, decoration: BoxDecoration(color: _seatColors[i], shape: BoxShape.circle, boxShadow: [BoxShadow(color: _seatColors[i].withOpacity(0.6), blurRadius: 6)])),
                  const SizedBox(width: 5),
                  Text('${i < tokens.length ? tokens[i].where((p)=> p >= 57).length : 0}/4', style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 13)),
                ]),
            ]),
            const SizedBox(height: 10),
            AspectRatio(
              aspectRatio: 1,
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: LinearGradient(colors: [Color.lerp(skin.feltTop, Colors.white, 0.06)!, skin.feltTop, skin.feltBottom], begin: Alignment.topCenter, end: Alignment.bottomCenter),
                  border: Border.all(color: Colors.white.withOpacity(0.10)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius: 14, offset: const Offset(0, 6))],
                ),
                child: Stack(alignment: Alignment.center, children: [
                  // outer track ring
                  Container(width: 280, height: 280, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withOpacity(0.10), width: 2))),
                  // cross arms (safe path visualization)
                  CustomPaint(size: const Size(300,300), painter: _TrackPainter(seatCount: seatCount, color: Colors.white.withOpacity(0.10))),
                  // centre home
                  Container(width: 68, height: 68, decoration: BoxDecoration(shape: BoxShape.circle, gradient: AppColors.auroraGradient, boxShadow: [BoxShadow(color: AppColors.electricPurple.withOpacity(0.5), blurRadius: 18)]), child: const Icon(Icons.home_rounded, color: Colors.white, size: 28)),
                  // home yards (corner rosettes)
                  for (var seat = 0; seat < seatCount; seat++)
                    Positioned(
                      left: _yardOffset(seat, seatCount).dx, top: _yardOffset(seat, seatCount).dy,
                      child: Container(width: 54, height: 54, decoration: BoxDecoration(color: _seatColors[seat].withOpacity(0.18), borderRadius: BorderRadius.circular(14), border: Border.all(color: _seatColors[seat].withOpacity(0.5)), boxShadow: [BoxShadow(color: _seatColors[seat].withOpacity(0.25), blurRadius: 10)]), child: Icon(Icons.shield_rounded, color: _seatColors[seat], size: 20)),
                    ),
                  // tokens
                  for (var seat = 0; seat < tokens.length; seat++)
                    for (var ti = 0; ti < tokens[seat].length; ti++)
                      _tokenAt(seat, ti, tokens[seat][ti], myTurn && hasRolled, seatCount),
                ]),
              ),
            ),
            const SizedBox(height: 10),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              if (die != null) Dice3D(size: 54, value: die, rolling: false) else Container(width: 54, height: 54, decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.glassStroke)), child: const Center(child: Text('–', style: TextStyle(color: AppColors.textMuted, fontSize: 22)))),
              const SizedBox(width: 12),
              Text(die != null ? 'Rolled $die' : 'Tap Roll', style: TextStyle(color: die != null ? AppColors.cosmicGold : AppColors.textSecondary, fontWeight: FontWeight.w800, fontSize: 14)),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: ActionButton(label: 'Roll', icon: Icons.casino, color: AppColors.electricPurple, onPressed: myTurn && !hasRolled ? (){ GameFeedback.roll(); widget.onAction('roll', {}); } : null)),
              const SizedBox(width: 10),
              ActionButton(label: 'Pass', icon: Icons.skip_next, color: AppColors.surfaceElevated, onPressed: myTurn && hasRolled ? (){ GameFeedback.tap(); widget.onAction('pass', {}); } : null),
            ]),
          ]),
        ),
        const SizedBox(height: 6),
        Text('${seatCount} players • Shop → Board Themes & Token Sets', style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
      ],
    );
  }

  Offset _yardOffset(int seat, int count) {
    if (count == 2) return seat == 0 ? const Offset(12, 12) : const Offset(234, 234);
    if (count == 3) return [const Offset(12,12), const Offset(234,12), const Offset(123,234)][seat];
    return [const Offset(12,12), const Offset(234,12), const Offset(234,234), const Offset(12,234)][seat];
  }

  Widget _tokenAt(int seat, int ti, int progress, bool canMove, int seatCount) {
    const ring = 120.0;
    Offset pos;
    if (progress < 0) {
      // spread inside yard
      final base = _yardOffset(seat, seatCount) + const Offset(27,27);
      pos = base + Offset((ti % 2)*18 - 9, (ti ~/2)*18 - 9) - const Offset(150,150);
    } else if (progress >= 57) {
      pos = Offset((ti - 1.5)*14, (seat - 1.2)*10);
    } else {
      final seatStart = (seat * (52 / seatCount));
      final cell = (seatStart + progress) % 52;
      final angle = (cell / 52) * 2 * math.pi - math.pi/2;
      pos = Offset(ring * math.cos(angle), ring * math.sin(angle));
    }
    final pal = _palettes[seat % _palettes.length];
    return Transform.translate(
      offset: pos,
      child: GestureDetector(
        onTap: canMove ? (){ GameFeedback.move(); widget.onAction('move', {'token': ti}); } : null,
        child: canMove ? GlowPulse(color: _seatColors[seat], child: Piece3D(palette: pal, size: 26)) : Piece3D(palette: pal, size: 26),
      ),
    );
  }
}

class _TrackPainter extends CustomPainter {
  _TrackPainter({required this.seatCount, required this.color});
  final int seatCount; final Color color;
  @override void paint(Canvas canvas, Size s) {
    final c = Offset(s.width/2, s.height/2);
    final p = Paint()..color = color..strokeWidth = 1.2..style = PaintingStyle.stroke;
    // faint inner circle + cross
    canvas.drawCircle(c, 120, p);
    canvas.drawCircle(c, 88, p..color = color.withOpacity(0.06));
    // seat spokes
    for (var i=0;i<seatCount;i++) {
      final a = (i * 2*math.pi/ seatCount) - math.pi/2;
      canvas.drawLine(c, c + Offset(math.cos(a)*120, math.sin(a)*120), p);
    }
  }
  @override bool shouldRepaint(covariant CustomPainter old)=> false;
}
