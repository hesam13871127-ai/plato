import 'dart:async';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Trivia Battle — 3D quiz card with aurora header, tiled answers and pulse.
class TriviaBoard extends StatefulWidget {
  const TriviaBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<TriviaBoard> createState()=> _TriviaBoardState();
}

class _TriviaBoardState extends State<TriviaBoard> {
  Timer? _tick; int _now=DateTime.now().millisecondsSinceEpoch; int? _myChoice; String _skin='midnight';
  Map<String,dynamic> get b=> widget.session.board;
  @override void initState(){ super.initState(); _tick=Timer.periodic(const Duration(milliseconds:200), (_){ if(mounted) setState(()=> _now=DateTime.now().millisecondsSinceEpoch);});}
  @override void dispose(){ _tick?.cancel(); super.dispose();}
  @override
  Widget build(BuildContext context){
    final round=(b['round'] as num?)?.toInt() ?? 1; final target=(b['target'] as num?)?.toInt() ?? 7; final reveal=b['reveal']==true;
    final options=((b['options'] as List?)??const[]).map((e)=> e.toString()).toList();
    final players=((b['players'] as List?)??const[]); final correctIndex=(b['correctIndex'] as num?)?.toInt();
    final endsAt=DateTime.tryParse((b['answerEndsAt'] as String?)??'')?.millisecondsSinceEpoch ?? _now;
    final remain=((endsAt-_now)/1000).clamp(0,60).toStringAsFixed(1);
    final me= widget.mySeat>=0 && widget.mySeat<players.length ? Map<String,dynamic>.from(players[widget.mySeat] as Map) : null;
    final answered=me?['answered']==true; _myChoice=(me?['chosen'] as num?)?.toInt();
    final skin=BoardSkin.byId(_skin);
    return Column(children:[
      TurnIndicator(text: widget.session.isInProgress ? reveal ? 'Correct answer revealed!' : answered ? 'Answer locked — wait for others…' : 'Round $round of $target — pick your answer!' : 'Game over', highlight: !reveal && !answered && widget.session.isInProgress, icon: Icons.quiz_rounded),
      const SizedBox(height:4),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:6),
      if(!reveal) Container(padding: const EdgeInsets.symmetric(horizontal:12, vertical:6), decoration: BoxDecoration(color: AppColors.warning.withOpacity(0.14), borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.warning.withOpacity(0.35))), child: Text('⏳ $remain s — answer fast for bonus!', style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w800, fontSize:12))),
      const SizedBox(height:8),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.12)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.12)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius:22, offset: const Offset(0,10))]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children:[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(14,14,14,12),
            decoration: BoxDecoration(gradient: AppColors.auroraGradient, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: AppColors.electricPurple.withOpacity(0.35), blurRadius:14)]),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children:[
              Container(padding: const EdgeInsets.symmetric(horizontal:8, vertical:4), decoration: BoxDecoration(color: Colors.white.withOpacity(0.22), borderRadius: BorderRadius.circular(8)), child: Text((b['category'] ?? 'Trivia').toString().toUpperCase(), style: const TextStyle(color: Colors.white, fontSize:11, fontWeight: FontWeight.w900, letterSpacing:0.6))),
              const SizedBox(height:8),
              Text((b['prompt'] ?? '').toString(), style: const TextStyle(color: Colors.white, fontSize:17, fontWeight: FontWeight.w800, height:1.2)),
            ]),
          ),
          const SizedBox(height:10),
          ...List.generate(options.length, (i){
            final isCorrect= reveal && correctIndex==i; final isMine=_myChoice==i; Color? bg; Color border; IconData? icon;
            if(isCorrect){ bg=AppColors.success.withOpacity(0.22); border=AppColors.success; icon=Icons.check_circle_rounded; }
            else if(reveal && isMine){ bg=AppColors.danger.withOpacity(0.18); border=AppColors.danger; icon=Icons.cancel_rounded; }
            else if(isMine){ bg=AppColors.electricPurple.withOpacity(0.18); border=AppColors.electricPurple; icon=Icons.radio_button_checked_rounded; }
            else { bg=Colors.white.withOpacity(0.06); border=Colors.white.withOpacity(0.12); }
            return Padding(padding: const EdgeInsets.only(bottom:9), child: Material(color: Colors.transparent, child: InkWell(borderRadius: BorderRadius.circular(14), onTap: (reveal || answered) ? null : () async { GameFeedback.move(); await widget.onAction('answer', {'index':i}); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:14, vertical:13), decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14), border: Border.all(color: border, width:1.2), boxShadow: isCorrect || isMine ? [BoxShadow(color: border.withOpacity(0.35), blurRadius:10)] : null), child: Row(children:[
              Container(width:28,height:28, decoration: BoxDecoration(color: isCorrect ? AppColors.success : isMine ? AppColors.electricPurple : AppColors.surfaceElevated, shape: BoxShape.circle, border: Border.all(color: Colors.white.withOpacity(0.9))), child: Center(child: Text(String.fromCharCode(65+i), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize:13)))),
              const SizedBox(width:12),
              Expanded(child: Text(options[i], style: TextStyle(color: isCorrect || isMine ? AppColors.textPrimary : AppColors.textPrimary, fontSize:14, fontWeight: FontWeight.w600))),
              if(icon!=null) Icon(icon, color: border, size:20),
            ])))));
          }),
          const SizedBox(height:6),
          Wrap(spacing:8, runSpacing:6, alignment: WrapAlignment.center, children: List.generate(players.length, (i){
            final p=Map<String,dynamic>.from(players[i] as Map);
            final done=p['answered']==true;
            return Container(padding: const EdgeInsets.symmetric(horizontal:10, vertical:7), decoration: BoxDecoration(color: i==widget.mySeat ? AppColors.electricPurple.withOpacity(0.18) : AppColors.glassFill, borderRadius: BorderRadius.circular(12), border: Border.all(color: done ? AppColors.success : AppColors.glassStroke)), child: Row(mainAxisSize: MainAxisSize.min, children:[ Icon(done ? Icons.check_circle_rounded : Icons.hourglass_bottom_rounded, size:14, color: done ? AppColors.success : AppColors.textMuted), const SizedBox(width:6), Text(i==widget.mySeat ? 'You' : widget.session.seats[i].displayName, style: const TextStyle(color: AppColors.textPrimary, fontSize:12, fontWeight: FontWeight.w700)), const SizedBox(width:8), Container(padding: const EdgeInsets.symmetric(horizontal:7, vertical:2), decoration: BoxDecoration(color: AppColors.softCyan.withOpacity(0.18), borderRadius: BorderRadius.circular(8)), child: Text('${(p['score'] as num?)?.toInt() ?? 0}', style: const TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.w900, fontSize:12)))]));
          })),
        ]),
      ),
    ]);
  }
}
