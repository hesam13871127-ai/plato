import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

class _ArchView {
  _ArchView(Map<String, dynamic> b)
      : round = (b['round'] as num?)?.toInt() ?? 1,
        arrowsLeft = (b['arrowsLeft'] as num?)?.toInt() ?? 3,
        shooter = (b['shooter'] as num?)?.toInt() ?? 0,
        wind = _wind(b['wind']),
        throws = _throws(b['throws']),
        lastThrow = _throw(b['lastThrow']);

  final int round;
  final int arrowsLeft;
  final int shooter;
  final _Wind wind;
  final List<_Arrow> throws;
  final _Arrow? lastThrow;

  static _Wind _wind(Object? raw) {
    final m=raw as Map?;
    return _Wind((m?['x'] as num?)?.toDouble() ?? 0, (m?['y'] as num?)?.toDouble() ?? 0);
  }
  static List<_Arrow> _throws(Object? raw)=> ((raw as List?)??const[]).whereType<Map>().map((m)=>_throw(m)!).whereType<_Arrow>().toList();
  static _Arrow? _throw(Object? raw) {
    final m=raw as Map?;
    if(m==null) return null;
    return _Arrow(
      (m['seat'] as num?)?.toInt() ??0,
      (m['aimX'] as num?)?.toDouble() ??0,
      (m['aimY'] as num?)?.toDouble() ??0,
      (m['landingX'] as num?)?.toDouble() ??0,
      (m['landingY'] as num?)?.toDouble() ??0,
      (m['points'] as num?)?.toInt() ??0,
      (m['ring'] as String?)??'MISS',
    );
  }
}

class _Wind { const _Wind(this.x,this.y); final double x; final double y; }
class _Arrow { const _Arrow(this.seat,this.aimX,this.aimY,this.landingX,this.landingY,this.points,this.ring); final int seat; final double aimX,aimY,landingX,landingY; final int points; final String ring; }

/// Archery — Plato ten-ring, wave-8 board.
/// Three arrows per turn, five rounds, wind indicator, power slider.
class ArcheryBoard extends StatefulWidget {
  const ArcheryBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String,dynamic> payload) onAction;
  @override State<ArcheryBoard> createState()=> _ArchState();
}

class _ArchState extends State<ArcheryBoard> {
  String _skin='wood';
  double _aimX=0, _aimY=0;
  double _power=0.85;

  _ArchView get _view=>_ArchView(widget.session.board);
  bool get _myTurn=>widget.session.isInProgress && widget.session.currentSeat==widget.mySeat;

  Future<void> _shoot() async {
    if (!_myTurn) return;
    GameFeedback.tap();
    await widget.onAction('shoot', {'aimX': _aimX, 'aimY': _aimY, 'power': _power});
  }

  @override Widget build(BuildContext context) {
    final view=_view; final skin=BoardSkin.byId(_skin);
    final myThrows=view.throws.where((t)=>t.seat==widget.mySeat).toList();
    final myTotal=myThrows.fold<int>(0, (s,t)=>s+t.points);
    return Column(children: [
      TurnIndicator(text: _statusText(view), highlight: _myTurn, icon: Icons.adjust_rounded),
      const SizedBox(height:8),
      BoardSkinRow(selected:_skin, onPick:(id){GameFeedback.tap();setState(()=>_skin=id);}),
      const SizedBox(height:10),
      TableSurface(skin:skin, child: Column(children: [
        _scoreRow(view),
        const SizedBox(height:10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal:12, vertical:8),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha:0.06), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.white.withValues(alpha:0.10))),
          child: Row(children: [
            const Icon(Icons.air_rounded, size:16, color: AppColors.textSecondary),
            const SizedBox(width:8),
            const Text('WIND', style: TextStyle(color: AppColors.textSecondary, fontSize:10, fontWeight: FontWeight.w900, letterSpacing:1)),
            const SizedBox(width:12),
            Expanded(child: _windIndicator(view.wind)),
            Text('${(view.wind.x*100).round()} · ${(view.wind.y*100).round()}', style: const TextStyle(color: AppColors.textSecondary, fontSize:10, fontWeight: FontWeight.w700)),
          ]),
        ),
        const SizedBox(height:10),
        AspectRatio(
          aspectRatio: 1,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color.lerp(skin.edge, Colors.white,0.08)!, skin.edge, Color.lerp(skin.edge, Colors.black,0.5)!]),
              border: Border.all(color: Colors.white.withValues(alpha:0.14)),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha:0.5), blurRadius:16, offset: const Offset(0,8))],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: LayoutBuilder(builder: (context, constraints){
                final size=constraints.biggest;
                return GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onPanUpdate: _myTurn? (d){
                    final local=d.localPosition;
                    final nx=(local.dx / size.width)*2 -1;
                    final ny=(local.dy / size.height)*2 -1;
                    setState(()=>{_aimX=nx.clamp(-1,1); _aimY=ny.clamp(-1,1);});
                  }:null,
                  child: CustomPaint(painter: _ArchPainter(view:view, aimX:_aimX, aimY:_aimY), size: Size.infinite),
                );
              }),
            ),
          ),
        ),
        const SizedBox(height:10),
        Row(children: [
          const Text('POWER', style: TextStyle(color: AppColors.textSecondary, fontSize:10, fontWeight: FontWeight.w800)),
          Expanded(child: Slider(value:_power, min:0.25, max:1, activeColor: const Color(0xFFD9A94A), onChanged: _myTurn? (v)=>setState(()=>_power=v):null)),
          Text('${(_power*100).round()}%', style: const TextStyle(color: Color(0xFFD9A94A), fontSize:13, fontWeight: FontWeight.w900)),
        ]),
        const SizedBox(height:4),
        SizedBox(width: double.infinity, child: ElevatedButton(
          onPressed: _myTurn? _shoot:null,
          style: ElevatedButton.styleFrom(backgroundColor: _myTurn? const Color(0xFFD9A94A): Colors.white.withValues(alpha:0.08), foregroundColor: _myTurn? Colors.black: Colors.white38, padding: const EdgeInsets.symmetric(vertical:13), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
          child: const Text('LOOSE!  🏹', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing:1.2)),
        )),
        const SizedBox(height:6),
        Text('$myTotal pts · ${myThrows.length}/15 arrows · Round ${view.round}/5', style: const TextStyle(color: AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700)),
        if (view.lastThrow!=null)
          Padding(padding: const EdgeInsets.only(top:6), child: Text('${view.lastThrow!.ring}  ·  +${view.lastThrow!.points}', style: TextStyle(color: view.lastThrow!.points>=8? const Color(0xFFD9A94A): view.lastThrow!.points==0? AppColors.danger: Colors.white, fontSize:11, fontWeight: FontWeight.w900))),
      ])),
    ]);
  }

  Widget _windIndicator(_Wind w) {
    final ang = w.x==0 && w.y==0 ? 0 : (w.x*180/3.14159); // not needed
    return SizedBox(height: 18, child: LayoutBuilder(builder: (c, size){
      final cx=size.maxWidth*0.5, cy=9.0;
      final sx=w.x*80, sy=w.y*80;
      return CustomPaint(painter: _WindPainter(w), size: Size(size.maxWidth,18));
    }));
  }

  Widget _scoreRow(_ArchView view) {
    return Wrap(spacing:8, runSpacing:6, alignment: WrapAlignment.center, children: [
      for(var seat=0; seat<widget.session.seats.length; seat++)
        Container(
          padding: const EdgeInsets.symmetric(horizontal:10, vertical:5),
          decoration: BoxDecoration(color: widget.session.currentSeat==seat && widget.session.isInProgress?AppColors.electricPurple.withValues(alpha:0.3):Colors.white.withValues(alpha:0.06), borderRadius: BorderRadius.circular(10), border: Border.all(color: widget.session.currentSeat==seat && widget.session.isInProgress?AppColors.softCyan:Colors.white.withValues(alpha:0.12))),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(_seatLabel(seat), style: TextStyle(color: seat==widget.mySeat?AppColors.softCyan:AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700)),
            const SizedBox(width:6),
            Text('${widget.session.scores.length>seat?widget.session.scores[seat]:0}', style: const TextStyle(color: Colors.white, fontSize:13, fontWeight: FontWeight.w900)),
          ]),
        ),
    ]);
  }
  String _statusText(_ArchView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat==null) return 'Even archers — a tie';
      return widget.session.winnerSeat==widget.mySeat?'Bullseye! You win!':'They out-shot you…';
    }
    if (!_myTurn) return 'Their arrow is nocked…';
    return 'Drag to aim, adjust for wind, loose!';
  }
  String _seatLabel(int seat)=> seat>=widget.session.seats.length?'Seat ${seat+1}': seat==widget.mySeat?'You':widget.session.seats[seat].displayName;
}

class _WindPainter extends CustomPainter {
  _WindPainter(this.w);
  final _Wind w;
  @override void paint(Canvas canvas, Size size){
    final cx=size.width*0.5, cy=size.height*0.5;
    final len=w.x.abs()+ w.y.abs();
    final str=(len*400).clamp(0,1);
    // line
    final end=Offset(cx + w.x*80, cy + w.y*40);
    final paint=Paint()..color= AppColors.softCyan.withValues(alpha: 0.85)..strokeWidth=2+str*2 ..strokeCap=StrokeCap.round;
    canvas.drawLine(Offset(cx,cy), end, paint);
    // arrow head
    final ang= (w.x==0&&w.y==0)?0: (3.14159/2 + (w.y*0.5));
    // simpler arrow head at end
    canvas.drawCircle(end, 3, Paint()..color=AppColors.softCyan);
    // centre dot
    canvas.drawCircle(Offset(cx,cy), 2, Paint()..color=Colors.white.withValues(alpha:0.6));
  }
  @override bool shouldRepaint(covariant _WindPainter old)=> old.w.x!=w.x || old.w.y!=w.y;
}

class _ArchPainter extends CustomPainter {
  _ArchPainter({required this.view, required this.aimX, required this.aimY});
  final _ArchView view; final double aimX, aimY;
  @override void paint(Canvas canvas, Size size) {
    final w=size.width, h=size.height;
    final cx=w*0.5, cy=h*0.5;
    final radius=w*0.46;
    // Wood surround handled by parent, paint target face
    canvas.drawCircle(Offset(cx,cy), radius, Paint()..color=const Color(0xFFEDE8D0));
    // Rings from outer to inner
    final rings=[
      {'r':1.0, 'c': const Color(0xFFFFFFFF)},
      {'r':0.82, 'c': const Color(0xFF1A1A1A)},
      {'r':0.68, 'c': const Color(0xFF3B82F6)},
      {'r':0.55, 'c': const Color(0xFFEF4444)},
      {'r':0.42, 'c': const Color(0xFFFACC15)},
      {'r':0.30, 'c': const Color(0xFFFACC15)},
      {'r':0.18, 'c': const Color(0xFFEF4444)},
      {'r':0.08, 'c': const Color(0xFFFACC15)},
    ];
    for (final r in rings.reversed) {
      canvas.drawCircle(Offset(cx,cy), radius*(r['r'] as double), Paint()..color=r['c'] as Color);
    }
    // ring lines
    final line=Paint()..color=Colors.black.withValues(alpha:0.25)..strokeWidth=1..style=PaintingStyle.stroke;
    for(final r in [1.0,0.82,0.68,0.55,0.42,0.30,0.18,0.08]) {
      canvas.drawCircle(Offset(cx,cy), radius*r, line);
    }
    // Plus lines
    canvas.drawLine(Offset(cx-radius,cy), Offset(cx+radius,cy), line);
    canvas.drawLine(Offset(cx,cy-radius), Offset(cx,cy+radius), line);

    // Arrows landed
    for (final a in view.throws) {
      final lx=cx + a.landingX * radius*0.95;
      final ly=cy + a.landingY * radius*0.95;
      final col= a.points>=8? const Color(0xFFD9A94A): a.points==0? AppColors.danger: Colors.white;
      canvas.drawCircle(Offset(lx,ly), 4, Paint()..color=col);
      canvas.drawCircle(Offset(lx,ly), 2, Paint()..color=Colors.black.withValues(alpha:0.5));
    }
    if (view.lastThrow!=null) {
      final lt=view.lastThrow!;
      final lx=cx + lt.landingX * radius*0.95;
      final ly=cy + lt.landingY * radius*0.95;
      canvas.drawCircle(Offset(lx,ly), 8, Paint()..color=AppColors.softCyan.withValues(alpha:0.25));
    }
    // Aim crosshair (where player is aiming, not where it lands)
    final aimPx=Offset(cx + aimX * radius*0.95, cy + aimY * radius*0.95);
    final cross=Paint()..color=AppColors.softCyan..strokeWidth=2;
    canvas.drawLine(aimPx + const Offset(-10,0), aimPx + const Offset(10,0), cross);
    canvas.drawLine(aimPx + const Offset(0,-10), aimPx + const Offset(0,10), cross);
    canvas.drawCircle(aimPx, 3, Paint()..color=AppColors.softCyan);
    // Wind arrow overlay mini
    final wind=wToStr(view.wind);
    // not needed
  }
  String wToStr(_Wind w)=>'';
  @override bool shouldRepaint(covariant _ArchPainter old)=> old.aimX!=aimX || old.aimY!=aimY || old.view.lastThrow!=view.lastThrow;
}
