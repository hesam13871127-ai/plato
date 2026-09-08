import 'dart:async';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Sketch & Guess — draw canvas + guess list, 3D frame.
class SketchBoard extends StatefulWidget {
  const SketchBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<SketchBoard> createState()=> _SketchBoardState();
}

class _SketchBoardState extends State<SketchBoard> {
  Timer? _t; int _now=DateTime.now().millisecondsSinceEpoch; final TextEditingController _ctrl=TextEditingController(); final List<Offset?> _points=[]; String _skin='midnight';
  Map<String,dynamic> get b=> widget.session.board;
  @override void initState(){ super.initState(); _t=Timer.periodic(const Duration(milliseconds:300), (_){ if(mounted) setState(()=> _now=DateTime.now().millisecondsSinceEpoch);});}
  @override void dispose(){ _t?.cancel(); _ctrl.dispose(); super.dispose();}
  @override
  Widget build(BuildContext context){
    final drawerSeat=(b['drawerSeat'] as num?)?.toInt() ?? 0; final isDrawer=widget.mySeat==drawerSeat;
    final word=b['word'] as String?; final hint=b['hint'] as String?; final players=((b['players'] as List?)??const[]);
    final guesses=((b['guesses'] as List?)??const[]).whereType<Map>().toList();
    final endsAt=DateTime.tryParse((b['endsAt'] as String?)??'')?.millisecondsSinceEpoch ?? _now; final remain=((endsAt-_now)/1000).clamp(0,90).toStringAsFixed(0); final skin=BoardSkin.byId(_skin);
    return Column(children:[
      TurnIndicator(text: widget.session.isInProgress ? isDrawer ? 'You draw: ${word ?? hint ?? "…"}' : '${widget.session.seats[drawerSeat].displayName} is drawing…' : 'Game over', highlight: widget.session.isInProgress, icon: Icons.brush_rounded),
      const SizedBox(height:4),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:6),
      Container(padding: const EdgeInsets.symmetric(horizontal:12, vertical:6), decoration: BoxDecoration(color: AppColors.warning.withOpacity(0.14), borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.warning.withOpacity(0.35))), child: Text('⏳ $remain s', style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w800, fontSize:12))),
      const SizedBox(height:8),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.12)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.12)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius:22, offset: const Offset(0,10))]),
        child: Column(children:[
          // canvas
          Container(
            height:220,
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.electricPurple.withOpacity(0.25), width:1.2), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.12), blurRadius:10)]),
            child: Stack(children:[
              Positioned.fill(child: CustomPaint(painter: _SketchPainter(points: _points))),
              if(isDrawer) Positioned.fill(child: GestureDetector(
                onPanStart: (d)=> setState(()=> _points.add(d.localPosition)),
                onPanUpdate: (d)=> setState(()=> _points.add(d.localPosition)),
                onPanEnd: (_)=> setState(()=> _points.add(null)),
                child: Container(color: Colors.transparent),
              )),
              if(!isDrawer) Center(child: Container(padding: const EdgeInsets.symmetric(horizontal:12, vertical:6), decoration: BoxDecoration(color: AppColors.deepNavy.withOpacity(0.85), borderRadius: BorderRadius.circular(10)), child: Text(hint ?? 'Guess the drawing!', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize:13)))),
            ]),
          ),
          if(isDrawer) Padding(padding: const EdgeInsets.only(top:8), child: Row(children:[
            ActionButton(label:'Clear', icon: Icons.clear_rounded, color: AppColors.surfaceElevated, onPressed: ()=> setState(()=> _points.clear())),
            const SizedBox(width:8),
            Expanded(child: ActionButton(label:'Send', icon: Icons.send_rounded, color: AppColors.electricPurple, onPressed: (){ GameFeedback.hit(); widget.onAction('strokes', {'strokes': _points.map((p)=> p==null ? null : {'x':p.dx,'y':p.dy}).toList()}); })),
          ])),
          const SizedBox(height:10),
          if(!isDrawer) Row(children:[
            Expanded(child: TextField(controller:_ctrl, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600), decoration: InputDecoration(hintText:'Type your guess…', filled:true, fillColor: Colors.white.withOpacity(0.08), border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none), hintStyle: TextStyle(color: AppColors.textMuted)), onSubmitted: (_)=> _guess())),
            const SizedBox(width:8),
            FilledButton(style: FilledButton.styleFrom(backgroundColor: AppColors.electricPurple, padding: const EdgeInsets.symmetric(horizontal:16, vertical:14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))), onPressed: _guess, child: const Text('Guess')),
          ]),
          const SizedBox(height:8),
          SizedBox(height:88, child: ListView.separated(reverse:true, itemCount: guesses.length, separatorBuilder: (_, __)=> const SizedBox(height:4), itemBuilder: (_, i){
            final g= guesses[guesses.length-1-i]; final seat=(g['seat'] as num?)?.toInt() ?? 0; final text=(g['text'] as String?)??''; final correct=g['correct']==true;
            return Container(padding: const EdgeInsets.symmetric(horizontal:10, vertical:6), decoration: BoxDecoration(color: correct ? AppColors.success.withOpacity(0.18) : AppColors.glassFill, borderRadius: BorderRadius.circular(10), border: Border.all(color: correct ? AppColors.success : AppColors.glassStroke)), child: Row(children:[ Text('${widget.session.seats[seat].displayName}:', style: TextStyle(color: correct ? AppColors.success : AppColors.textSecondary, fontSize:12, fontWeight: FontWeight.w700)), const SizedBox(width:6), Expanded(child: Text(text, style: TextStyle(color: correct ? AppColors.success : AppColors.textPrimary, fontSize:12))), if(correct) const Icon(Icons.check_circle_rounded, color: AppColors.success, size:14)]));
          })),
          const SizedBox(height:8),
          Wrap(spacing:8, children: List.generate(players.length, (i){
            final p=Map<String,dynamic>.from(players[i] as Map);
            return Container(padding: const EdgeInsets.symmetric(horizontal:10, vertical:6), decoration: BoxDecoration(color: i==drawerSeat ? AppColors.cosmicGold.withOpacity(0.18) : AppColors.glassFill, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.glassStroke)), child: Text('${widget.session.seats[i].displayName}: ${(p['score'] as num?)?.toInt() ?? 0}', style: const TextStyle(color: AppColors.textPrimary, fontSize:12, fontWeight: FontWeight.w700)));
          })),
        ]),
      ),
    ]);
  }
  Future<void> _guess() async { final w=_ctrl.text.trim(); if(w.isEmpty) return; _ctrl.clear(); GameFeedback.move(); await widget.onAction('guess', {'word':w}); }
}

class _SketchPainter extends CustomPainter {
  _SketchPainter({required this.points});
  final List<Offset?> points;
  @override void paint(Canvas canvas, Size size){
    final p=Paint()..color= const Color(0xFF0F172A)..strokeWidth=3.2..strokeCap=StrokeCap.round..strokeJoin=StrokeJoin.round;
    for(var i=0;i<points.length-1;i++){
      final a=points[i]; final b=points[i+1];
      if(a!=null && b!=null) canvas.drawLine(a,b,p);
      else if(a!=null && b==null) canvas.drawCircle(a, 1.6, p);
    }
  }
  @override bool shouldRepaint(covariant _SketchPainter old)=> old.points != points;
}
