import 'dart:async';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Impostor Light — word cards with hidden role reveal, discussion + vote.
class ImpostorLightBoard extends StatefulWidget {
  const ImpostorLightBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<ImpostorLightBoard> createState()=> _ImpostorLightBoardState();
}

class _ImpostorLightBoardState extends State<ImpostorLightBoard> {
  Timer? _t; int _now=DateTime.now().millisecondsSinceEpoch; String _skin='cosmic';
  @override void initState(){ super.initState(); _t=Timer.periodic(const Duration(milliseconds:300), (_){ if(mounted) setState(()=> _now=DateTime.now().millisecondsSinceEpoch);});}
  @override void dispose(){ _t?.cancel(); super.dispose();}
  Map<String,dynamic> get b=> widget.session.board;
  @override
  Widget build(BuildContext context){
    final phase=(b['phase'] as String?)??'discuss'; final word=b['word'] as String?; final hint=b['hint'] as String?;
    final isImpostor=b['isImpostor'] as bool? ?? false; final votes=((b['votes'] as Map?)??const{}).map((k,v)=> MapEntry(int.tryParse('$k')??-1, (v as num).toInt()));
    final players=((b['players'] as List?)??const[]); final endsAt=DateTime.tryParse((b['phaseEndsAt'] as String?)??'')?.millisecondsSinceEpoch; final remain= ((endsAt ?? _now) - _now)/1000; final skin=BoardSkin.byId(_skin);
    return Column(children:[
      TurnIndicator(text: widget.session.isCompleted ? 'Game over' : phase=='reveal' ? '👁️ Remember your word!' : phase=='discuss' ? '💬 Discuss the word' : '🗳️ Vote the impostor!', highlight: widget.session.isInProgress, icon: phase=='reveal' ? Icons.visibility_rounded : phase=='discuss' ? Icons.chat_bubble_rounded : Icons.how_to_vote_rounded),
      const SizedBox(height:4),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:6),
      if(widget.session.isInProgress) Text('${remain.clamp(0,99).toStringAsFixed(0)}s left', style: const TextStyle(color: AppColors.warning, fontSize:12, fontWeight: FontWeight.w700)),
      const SizedBox(height:8),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.12)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.12)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius:22, offset: const Offset(0,10))]),
        child: Column(children:[
          // secret card
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(14,16,14,14),
            decoration: BoxDecoration(
              gradient: isImpostor ? const LinearGradient(colors:[Color(0xFFEF4444), Color(0xFF7F1D1D)], begin: Alignment.topLeft, end: Alignment.bottomRight) : AppColors.auroraGradient,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [BoxShadow(color: (isImpostor ? AppColors.danger : AppColors.electricPurple).withOpacity(0.35), blurRadius:14)],
              border: Border.all(color: Colors.white.withOpacity(0.9), width:1.2),
            ),
            child: Column(children:[
              Icon(isImpostor ? Icons.help_outline_rounded : Icons.lightbulb_rounded, color: Colors.white, size:28),
              const SizedBox(height:8),
              Text(isImpostor ? 'You are the IMPOSTOR' : (word ?? '—'), style: const TextStyle(color: Colors.white, fontSize:22, fontWeight: FontWeight.w900, shadows: [Shadow(color: Colors.black38, blurRadius:4)]), textAlign: TextAlign.center),
              if(hint!=null && !isImpostor) Padding(padding: const EdgeInsets.only(top:6), child: Text('Hint: $hint', style: const TextStyle(color: Colors.white70, fontSize:12, fontWeight: FontWeight.w600))),
              if(isImpostor) const Padding(padding: EdgeInsets.only(top:6), child: Text('Blend in — you don’t know the word!', style: TextStyle(color: Colors.white70, fontSize:12, fontWeight: FontWeight.w600))),
            ]),
          ),
          const SizedBox(height:10),
          GridView.count(
            crossAxisCount:4, shrinkWrap:true, physics: const NeverScrollableScrollPhysics(), mainAxisSpacing:8, crossAxisSpacing:8, childAspectRatio:0.92,
            children:[
              for(var i=0;i<players.length;i++)
                GestureDetector(
                  onTap: phase=='vote' && widget.session.isInProgress ? (){ GameFeedback.tap(); widget.onAction('vote', {'target':i}); } : null,
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(color: i==widget.mySeat ? AppColors.electricPurple.withOpacity(0.22) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: i==widget.mySeat ? AppColors.electricPurple.withOpacity(0.6) : AppColors.glassStroke)),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children:[
                      CircleAvatar(radius:18, backgroundColor: AppColors.softCyan.withOpacity(0.18), child: Icon(Icons.person_rounded, color: AppColors.softCyan, size:18)),
                      const SizedBox(height:4),
                      Text(i==widget.mySeat ? 'You' : widget.session.seats[i].displayName, maxLines:1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.textPrimary, fontSize:11, fontWeight: FontWeight.w700)),
                      if(votes.values.where((v)=> v==i).isNotEmpty) Container(margin: const EdgeInsets.only(top:3), padding: const EdgeInsets.symmetric(horizontal:6, vertical:2), decoration: BoxDecoration(color: AppColors.warning.withOpacity(0.22), borderRadius: BorderRadius.circular(8)), child: Text('${votes.values.where((v)=> v==i).length} votes', style: const TextStyle(color: AppColors.warning, fontSize:9, fontWeight: FontWeight.w900))),
                    ]),
                  ),
                ),
            ],
          ),
        ]),
      ),
    ]);
  }
}
