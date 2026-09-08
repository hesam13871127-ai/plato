import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Carrom — polished wood board with precise pockets, 3D coins and striker.
/// 2 players, skin-tinted frame and felt.
class CarromBoard extends StatefulWidget {
  const CarromBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<CarromBoard> createState()=> _CarromBoardState();
}

class _CarromBoardState extends State<CarromBoard> {
  Offset? _aim; Size _boardSize=Size.zero; double _power=0.75; String _skin='wood';
  Map<String,dynamic> get b=> widget.session.board;
  List<Map<String,dynamic>> get _pieces=> ((b['pieces'] as List?)??const[]).whereType<Map>().map((e)=> Map<String,dynamic>.from(e)).toList();
  bool get _myTurn { final turn=(b['turnSeat'] as num?)?.toInt() ?? widget.session.currentSeat; return widget.session.isInProgress && turn==widget.mySeat; }
  bool get _simulating=> (b['phase'] as String?)=='sim';
  Color _pieceColor(String c){
    switch(c){
      case 'white': return const Color(0xFFFFFEF2);
      case 'black': return const Color(0xFF1A1E2E);
      case 'queen': return const Color(0xFFE11D48);
      default: return AppColors.electricPurple;
    }
  }
  void _strike(){
    if(_aim==null) return;
    final striker=_pieces.firstWhere((x)=> x['color']=='striker', orElse: ()=> <String,dynamic>{});
    if(striker.isEmpty) return;
    final center=Offset((striker['x'] as num).toDouble()*_boardSize.width, (striker['y'] as num).toDouble()*_boardSize.height);
    final angle=math.atan2(_aim!.dy-center.dy, _aim!.dx-center.dx);
    GameFeedback.hit(); widget.onAction('strike', {'angle':angle,'power':_power}); setState(()=> _aim=null);
  }
  @override
  Widget build(BuildContext context){
    final colors=(b['colors'] as List?)??const[]; final myColor= widget.mySeat < colors.length ? colors[widget.mySeat] : ''; final foul=b['foul']==true; final skin=BoardSkin.byId(_skin);
    return Column(children:[
      TurnIndicator(text: widget.session.isInProgress ? _simulating ? 'Coins sliding…' : _myTurn ? 'Your flick — drag to aim' : 'Opponent is flicking…' : 'Game over', highlight: _myTurn && !_simulating, icon: Icons.adjust_rounded),
      const SizedBox(height:4),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:6),
      Text('You are $myColor coins', style: const TextStyle(color: AppColors.textSecondary, fontSize:12, fontWeight: FontWeight.w600)),
      if(b['queenCovered']==true) const Text('Queen covered ♛', style: TextStyle(color: AppColors.warning, fontSize:12, fontWeight: FontWeight.w700)),
      if(foul) const Text('Foul — striker pocketed!', style: TextStyle(color: AppColors.danger, fontSize:12, fontWeight: FontWeight.w700)),
      const SizedBox(height:6),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.12)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.13)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius:22, offset: const Offset(0,10))]),
        child: AspectRatio(aspectRatio:1, child: LayoutBuilder(builder: (context, constraints){
          _boardSize=constraints.biggest; final size=constraints.biggest;
          return GestureDetector(
            onPanDown: _myTurn && !_simulating ? (d)=> setState(()=> _aim=d.localPosition) : null,
            onPanUpdate: _myTurn && !_simulating ? (d)=> setState(()=> _aim=d.localPosition) : null,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [Color.lerp(skin.feltTop, Colors.white, 0.14)!, skin.feltTop, skin.feltBottom], begin: Alignment.topLeft, end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Color.lerp(skin.edge, Colors.black, 0.2)!, width:10),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius:12, offset: const Offset(0,6))],
              ),
              child: Stack(children:[
                // centre ring
                Center(child: Container(width:92,height:92, decoration: BoxDecoration(shape: BoxShape.circle, color: Color.lerp(skin.feltTop, Colors.black, 0.12)!.withOpacity(0.6), border: Border.all(color: Colors.white.withOpacity(0.18), width:2)))),
                // corner pockets with brass rims
                for(final p in const [[0.08,0.08],[0.92,0.08],[0.08,0.92],[0.92,0.92]])
                  Positioned(left: p[0]*size.width-20, top: p[1]*size.height-20, child: Container(width:40,height:40, decoration: BoxDecoration(color: const Color(0xFF0A0A0A), shape: BoxShape.circle, border: Border.all(color: const Color(0xFF8B5A2B), width:4), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.6), blurRadius:8)]))),
                for(final pc in _pieces) if(pc['active']==true)
                  Positioned(
                    left: (pc['x'] as num).toDouble()*size.width - (pc['color']=='striker' ? 15:13),
                    top: (pc['y'] as num).toDouble()*size.height - (pc['color']=='striker' ? 15:13),
                    child: _Coin(color: _pieceColor(pc['color'] as String? ?? 'white'), size: pc['color']=='striker' ? 30:26, isStriker: pc['color']=='striker'),
                  ),
                if(_aim!=null && _myTurn && !_simulating) CustomPaint(size:size, painter: _AimLine(aim:_aim!, pieces:_pieces, size:size)),
              ]),
            ),
          );
        })),
      ),
      const SizedBox(height:10),
      if(_myTurn && !_simulating) ...[
        Container(padding: const EdgeInsets.symmetric(horizontal:12, vertical:8), decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.glassStroke)), child: Row(children:[ const Icon(Icons.bolt_rounded, size:14, color: AppColors.cosmicGold), const SizedBox(width:6), const Text('Power', style: TextStyle(color: AppColors.textSecondary, fontSize:12, fontWeight: FontWeight.w700)), Expanded(child: Slider(value:_power, min:0.4, max:1, activeColor: AppColors.electricPurple, inactiveColor: AppColors.glassStroke, onChanged: (v)=> setState(()=>_power=v), onChangeEnd: (_)=> GameFeedback.tap())), Text('${(_power*100).round()}%', style: const TextStyle(color: AppColors.textPrimary, fontSize:12, fontWeight: FontWeight.w800))])),
        const SizedBox(height:8),
        SizedBox(width: double.infinity, child: ActionButton(label:'Flick', icon: Icons.touch_app_rounded, color: AppColors.electricPurple, onPressed: _aim==null ? null : _strike)),
      ],
    ]);
  }
}

class _AimLine extends CustomPainter {
  _AimLine({required this.aim, required this.pieces, required this.size});
  final Offset aim; final List<Map<String,dynamic>> pieces; final Size size;
  @override void paint(Canvas canvas, Size s){
    final striker=pieces.firstWhere((x)=> x['color']=='striker', orElse: ()=> <String,dynamic>{});
    if(striker.isEmpty) return;
    final c=Offset((striker['x'] as num).toDouble()*s.width, (striker['y'] as num).toDouble()*s.height);
    final p=Paint()..color=AppColors.softCyan.withOpacity(0.85)..strokeWidth=3..style=PaintingStyle.stroke..strokeCap=StrokeCap.round;
    // dashed
    final total=(aim-c).distance; var d=0.0; const dash=8.0,gap=6.0;
    while(d<total){ final t0=d/total; final t1=(d+dash)/total; final p0=Offset.lerp(c, aim, t0.clamp(0,1))!; final p1=Offset.lerp(c, aim, t1.clamp(0,1))!; canvas.drawLine(p0,p1,p); d+=dash+gap; }
    canvas.drawCircle(aim, 5, Paint()..color=AppColors.softCyan);
  }
  @override bool shouldRepaint(_AimLine old)=> old.aim != aim;
}

class _Coin extends StatelessWidget {
  const _Coin({required this.color, required this.size, required this.isStriker});
  final Color color; final double size; final bool isStriker;
  @override Widget build(BuildContext context){
    return Container(
      width:size,height:size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(center: const Alignment(-0.3,-0.35), colors: [Color.lerp(color, Colors.white, 0.42)!, color, Color.lerp(color, Colors.black, 0.35)!]),
        border: Border.all(color: isStriker ? AppColors.softCyan : Colors.white.withOpacity(0.85), width: isStriker ? 2:1.2),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.40), blurRadius:5, offset: const Offset(0,3)), if(isStriker) BoxShadow(color: AppColors.softCyan.withOpacity(0.55), blurRadius:12)],
      ),
      child: Center(child: Container(width:size*0.55,height:size*0.55, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withOpacity(0.55), width:1)))),
    );
  }
}
