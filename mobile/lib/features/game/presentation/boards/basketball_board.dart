import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

class _HoopView {
  _HoopView(Map<String, dynamic> b)
      : round = (b['round'] as num?)?.toInt() ?? 1,
        shotsLeft = (b['shotsLeft'] as num?)?.toInt() ?? 2,
        shooter = (b['shooter'] as num?)?.toInt() ?? 0,
        throws = _throws(b['throws']),
        lastThrow = _throw(b['lastThrow']);

  final int round;
  final int shotsLeft;
  final int shooter;
  final List<_Throw> throws;
  final _Throw? lastThrow;

  static List<_Throw> _throws(Object? raw) => ((raw as List?) ?? const []).whereType<Map>().map((m)=>_throw(m)!).whereType<_Throw>().toList();
  static _Throw? _throw(Object? raw) {
    final m = raw as Map?;
    if (m==null) return null;
    return _Throw(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['aimX'] as num?)?.toDouble() ?? 0,
      (m['aimY'] as num?)?.toDouble() ?? 0,
      (m['power'] as num?)?.toDouble() ?? 0,
      m['made']==true,
      (m['points'] as num?)?.toInt() ?? 0,
    );
  }
}

class _Throw {
  const _Throw(this.seat, this.aimX, this.aimY, this.power, this.made, this.points);
  final int seat; final double aimX; final double aimY; final double power; final bool made; final int points;
}

/// Basketball — Plato hoops arcade, wave-8 board.
/// Two shots per turn, five rounds = ten shots per player.
class BasketballBoard extends StatefulWidget {
  const BasketballBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override
  State<BasketballBoard> createState() => _HoopState();
}

class _HoopState extends State<BasketballBoard> {
  String _skin='wood';
  double _aimX=0, _aimY=0.05;
  double _power=0.82;

  _HoopView get _view=>_HoopView(widget.session.board);
  bool get _myTurn=>widget.session.isInProgress && widget.session.currentSeat==widget.mySeat;

  Future<void> _shoot() async {
    if (!_myTurn) return;
    GameFeedback.tap();
    await widget.onAction('shoot', {'aimX': _aimX, 'aimY': _aimY, 'power': _power});
  }

  @override
  Widget build(BuildContext context) {
    final view=_view; final skin=BoardSkin.byId(_skin);
    final made = view.throws.where((t)=>t.seat==widget.mySeat && t.made).length;
    final total = view.throws.where((t)=>t.seat==widget.mySeat).length;
    return Column(
      children: [
        TurnIndicator(text: _statusText(view), highlight: _myTurn, icon: Icons.sports_basketball_rounded),
        const SizedBox(height:8),
        BoardSkinRow(selected:_skin, onPick:(id){GameFeedback.tap();setState(()=>_skin=id);}),
        const SizedBox(height:10),
        TableSurface(
          skin: skin,
          child: Column(
            children: [
              _scoreRow(view),
              const SizedBox(height:10),
              AspectRatio(
                aspectRatio: 1.1,
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    gradient: LinearGradient(begin: Alignment.topLeft, end:Alignment.bottomRight,
                      colors: [Color.lerp(skin.edge, Colors.white, 0.08)!, skin.edge, Color.lerp(skin.edge, Colors.black,0.5)!]),
                    border: Border.all(color: Colors.white.withValues(alpha:0.14)),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha:0.5), blurRadius: 16, offset: const Offset(0,8))],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: LayoutBuilder(builder: (context,constraints){
                      final size=constraints.biggest;
                      return GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onPanUpdate: _myTurn ? (d){
                          final local=d.localPosition;
                          // map 0..size to -1..1
                          final nx=(local.dx / size.width)*2 -1;
                          final ny=(local.dy / size.height)*2 -1;
                          setState(()=>{_aimX=nx.clamp(-1,1); _aimY=ny.clamp(-1,1);});
                        }:null,
                        child: CustomPaint(
                          painter: _HoopPainter(view:view, aimX:_aimX, aimY:_aimY),
                          size: Size.infinite,
                        ),
                      );
                    }),
                  ),
                ),
              ),
              const SizedBox(height:10),
              Row(
                children: [
                  const Text('POWER', style: TextStyle(color: AppColors.textSecondary, fontSize:10, fontWeight: FontWeight.w800)),
                  Expanded(child: Slider(value:_power, min:0.25, max:1, activeColor: const Color(0xFFFB923C), onChanged: _myTurn? (v)=>setState(()=>_power=v):null)),
                  Text('${(_power*100).round()}%', style: const TextStyle(color: Color(0xFFFB923C), fontSize:13, fontWeight: FontWeight.w900)),
                ],
              ),
              const SizedBox(height:4),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _myTurn? _shoot: null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _myTurn? const Color(0xFFFB923C): Colors.white.withValues(alpha:0.08),
                    foregroundColor: _myTurn? Colors.white: Colors.white38,
                    padding: const EdgeInsets.symmetric(vertical:13),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: Text(view.throws.length%2==0?'SHOOT  🏀':'SHOOT AGAIN', style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing:1.1)),
                ),
              ),
              const SizedBox(height:6),
              Text('$made / $total made · Round ${view.round}/5 · ${view.shotsLeft} shots left', style: const TextStyle(color: AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700)),
              if (view.lastThrow!=null)
                Padding(padding: const EdgeInsets.only(top:6), child: Text(view.lastThrow!.made?'SWISH! +2':'Clank — rimmed out…', style: TextStyle(color: view.lastThrow!.made? const Color(0xFF4ADE80): AppColors.danger, fontSize:11, fontWeight: FontWeight.w800))),
            ],
          ),
        ),
      ],
    );
  }

  Widget _scoreRow(_HoopView view) {
    return Wrap(spacing:8, runSpacing:6, alignment: WrapAlignment.center, children: [
      for (var seat=0; seat<widget.session.seats.length; seat++)
        Container(
          padding: const EdgeInsets.symmetric(horizontal:10, vertical:5),
          decoration: BoxDecoration(
            color: widget.session.currentSeat==seat && widget.session.isInProgress?AppColors.electricPurple.withValues(alpha:0.3):Colors.white.withValues(alpha:0.06),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: widget.session.currentSeat==seat && widget.session.isInProgress?AppColors.softCyan:Colors.white.withValues(alpha:0.12)),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(_seatLabel(seat), style: TextStyle(color: seat==widget.mySeat?AppColors.softCyan:AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700)),
            const SizedBox(width:6),
            Text('${widget.session.scores.length>seat?widget.session.scores[seat]:0}', style: const TextStyle(color: Colors.white, fontSize:13, fontWeight: FontWeight.w900)),
          ]),
        ),
    ]);
  }

  String _statusText(_HoopView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat==null) return 'Even nets — a tie';
      return widget.session.winnerSeat==widget.mySeat?'Buckets! You win!':'They out-shot you…';
    }
    if (!_myTurn) return 'Their shot — watch the arc…';
    return 'Drag to aim, set power, shoot!';
  }
  String _seatLabel(int seat)=> seat>=widget.session.seats.length?'Seat ${seat+1}': seat==widget.mySeat?'You':widget.session.seats[seat].displayName;
}

class _HoopPainter extends CustomPainter {
  _HoopPainter({required this.view, required this.aimX, required this.aimY});
  final _HoopView view;
  final double aimX; final double aimY;
  @override
  void paint(Canvas canvas, Size size) {
    final w=size.width, h=size.height;
    // Court wood
    canvas.drawRect(Offset.zero & size, Paint()..color=const Color(0xFF8B5A2B));
    // Grain
    final grain=Paint()..color=Colors.white.withValues(alpha:0.04);
    for(var i=0;i<16;i++) canvas.drawRect(Rect.fromLTWH(0, (i/16)*h, w, h/32), grain);
    // Hoop backboard + pole
    final cx=w*0.5, cy=h*0.32;
    final pole=Paint()..color=const Color(0xFF52525B)..strokeWidth=8..strokeCap=StrokeCap.round;
    canvas.drawLine(Offset(cx, cy+14), Offset(cx, h*0.78), pole);
    // Backboard
    final bb=Rect.fromCenter(center: Offset(cx, cy-10), width: w*0.42, height: 12);
    canvas.drawRect(bb, Paint()..color=Colors.white);
    canvas.drawRect(bb, Paint()..style=PaintingStyle.stroke..strokeWidth=2..color=const Color(0xFFFB923C));
    // Square target on backboard
    final sq=Rect.fromCenter(center: Offset(cx, cy+4), width: 56, height: 28);
    canvas.drawRect(sq, Paint()..style=PaintingStyle.stroke..strokeWidth=2..color=Colors.white.withValues(alpha:0.9));
    // Rim
    final rimR=w*0.095;
    canvas.drawOval(Rect.fromCenter(center: Offset(cx, cy+14), width: rimR*2, height: rimR*1.2), Paint()..color=const Color(0xFFFB923C)..style=PaintingStyle.stroke..strokeWidth=5);
    // Net
    final net=Paint()..color=Colors.white.withValues(alpha:0.55)..style=PaintingStyle.stroke..strokeWidth=1;
    for(var i=-3;i<=3;i++) {
      final x=cx + i*rimR*0.33;
      canvas.drawLine(Offset(x, cy+14), Offset(x + i*2, cy+14+28), net);
    }
    canvas.drawLine(Offset(cx-rimR, cy+14), Offset(cx-rimR*0.6, cy+14+28), net);
    canvas.drawLine(Offset(cx+rimR, cy+14), Offset(cx+rimR*0.6, cy+14+28), net);
    // Aim crosshair
    final aimPx=Offset(cx + aimX * w*0.32, cy+14 + aimY * h*0.26);
    final cross=Paint()..color=AppColors.softCyan..strokeWidth=2;
    canvas.drawLine(aimPx + const Offset(-10,0), aimPx + const Offset(10,0), cross);
    canvas.drawLine(aimPx + const Offset(0,-10), aimPx + const Offset(0,10), cross);
    canvas.drawCircle(aimPx, 4, Paint()..color=AppColors.softCyan);
    // Last throws markers
    for (final t in view.throws.take(view.throws.length > 12 ? 12 : view.throws.length)) {
      final lx=cx + t.aimX * w*0.32;
      final ly=cy+14 + t.aimY * h*0.26;
      canvas.drawCircle(Offset(lx, ly), 3, Paint()..color= t.made? const Color(0xFF4ADE80): AppColors.danger);
    }
    // Last marker bigger
    if (view.lastThrow!=null) {
      final lt=view.lastThrow!;
      final lx=cx + lt.aimX * w*0.32;
      final ly=cy+14 + lt.aimY * h*0.26;
      canvas.drawCircle(Offset(lx, ly), 7, Paint()..color= (lt.made? const Color(0xFF4ADE80): AppColors.danger).withValues(alpha:0.3));
    }
  }
  @override bool shouldRepaint(covariant _HoopPainter old)=> old.aimX!=aimX || old.aimY!=aimY || old.view.lastThrow!=view.lastThrow;
}
