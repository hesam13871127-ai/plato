import 'dart:async';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Emoji Charades — 3D emoji cards with glow, guess bar.
class EmojiCharadesBoard extends StatefulWidget {
  const EmojiCharadesBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<EmojiCharadesBoard> createState()=> _EmojiCharadesBoardState();
}

class _EmojiCharadesBoardState extends State<EmojiCharadesBoard> {
  Timer? _tick; int _now=DateTime.now().millisecondsSinceEpoch; final TextEditingController _ctrl=TextEditingController(); String _skin='cosmic';
  Map<String,dynamic> get b=> widget.session.board;
  @override void initState(){ super.initState(); _tick=Timer.periodic(const Duration(milliseconds:200), (_){ if(mounted) setState(()=> _now=DateTime.now().millisecondsSinceEpoch);});}
  @override void dispose(){ _tick?.cancel(); _ctrl.dispose(); super.dispose();}
  @override
  Widget build(BuildContext context){
    final round=(b['round'] as num?)?.toInt() ?? 1; final target=(b['target'] as num?)?.toInt() ?? 6;
    final performerSeat=(b['performerSeat'] as num?)?.toInt() ?? 0; final emojis=((b['revealedEmojis'] as List?)??const[]).map((e)=> e.toString()).toList();
    final winnerSeat=(b['winnerSeat'] as num?)?.toInt(); final winnerWord=b['winnerWord']?.toString();
    final players=((b['players'] as List?)??const[]); final endsAt=DateTime.tryParse((b['revealEndsAt'] as String?)??'')?.millisecondsSinceEpoch ?? _now;
    final remain=((endsAt-_now)/1000).clamp(0,60).toStringAsFixed(1); final isPerformer=widget.mySeat==performerSeat; final solved=winnerSeat!=null; final skin=BoardSkin.byId(_skin);
    return Column(children:[
      TurnIndicator(text: widget.session.isInProgress ? solved ? 'Solved! \"$winnerWord\"' : 'Round $round of $target — guess the word!' : 'Game over', highlight: !isPerformer && !solved && widget.session.isInProgress, icon: Icons.emoji_emotions_rounded),
      const SizedBox(height:4),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:6),
      Container(padding: const EdgeInsets.symmetric(horizontal:12, vertical:6), decoration: BoxDecoration(color: AppColors.warning.withOpacity(0.14), borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.warning.withOpacity(0.35))), child: Text('⏳ $remain s', style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w800, fontSize:12))),
      const SizedBox(height:8),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.12)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.12)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius:22, offset: const Offset(0,10))]),
        child: Column(children:[
          Container(padding: const EdgeInsets.symmetric(horizontal:10, vertical:6), decoration: BoxDecoration(color: Colors.white.withOpacity(0.08), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.white.withOpacity(0.08))), child: Text((b['category'] ?? 'Emoji Charades').toString().toUpperCase(), style: const TextStyle(color: AppColors.softCyan, fontSize:11, fontWeight: FontWeight.w900, letterSpacing:0.6))),
          const SizedBox(height:10),
          Container(
            width: double.infinity, height:96,
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.10))),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: emojis.map((e)=> Padding(padding: const EdgeInsets.symmetric(horizontal:6), child: Container(width:56,height:56, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.15), blurRadius:8, offset: const Offset(0,3)), BoxShadow(color: AppColors.neonPink.withOpacity(0.18), blurRadius:12)]), child: Center(child: Text(e, style: const TextStyle(fontSize:32)))))).toList()),
          ),
          const SizedBox(height:8),
          Text(isPerformer ? 'You are performing — wait for guesses!' : solved ? '${winnerSeat!=null && winnerSeat>=0 ? widget.session.seats[winnerSeat].displayName : 'Someone'} got it!' : 'What word do the emojis describe?', textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textSecondary, fontSize:12, fontWeight: FontWeight.w600)),
          const SizedBox(height:10),
          if(!isPerformer && !solved && widget.session.isInProgress) Row(children:[
            Expanded(child: TextField(controller:_ctrl, textInputAction: TextInputAction.send, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600), decoration: InputDecoration(hintText:'Type your guess…', filled:true, fillColor: Colors.white.withOpacity(0.08), border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none), hintStyle: TextStyle(color: AppColors.textMuted)), onSubmitted: (_)=> _guess())),
            const SizedBox(width:10),
            FilledButton(style: FilledButton.styleFrom(backgroundColor: AppColors.electricPurple, padding: const EdgeInsets.symmetric(horizontal:18, vertical:16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))), onPressed: _guess, child: const Text('Guess', style: TextStyle(fontWeight: FontWeight.w800))),
          ]),
          const SizedBox(height:10),
          Wrap(spacing:8, runSpacing:6, alignment: WrapAlignment.center, children: List.generate(players.length, (i){
            final p=Map<String,dynamic>.from(players[i] as Map);
            return Container(padding: const EdgeInsets.symmetric(horizontal:12, vertical:7), decoration: BoxDecoration(color: i==widget.mySeat ? AppColors.electricPurple.withOpacity(0.18) : AppColors.glassFill, borderRadius: BorderRadius.circular(12), border: Border.all(color: i==performerSeat ? AppColors.cosmicGold.withOpacity(0.6) : AppColors.glassStroke)), child: Row(mainAxisSize: MainAxisSize.min, children:[ Text(i==performerSeat ? '🎭 ${i==widget.mySeat ? 'You' : widget.session.seats[i].displayName}' : i==widget.mySeat ? 'You' : widget.session.seats[i].displayName, style: const TextStyle(color: AppColors.textPrimary, fontSize:12, fontWeight: FontWeight.w700)), const SizedBox(width:8), Container(padding: const EdgeInsets.symmetric(horizontal:7, vertical:2), decoration: BoxDecoration(color: AppColors.softCyan.withOpacity(0.18), borderRadius: BorderRadius.circular(8)), child: Text('${(p['score'] as num?)?.toInt() ?? 0}', style: const TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.w900, fontSize:12)))]));
          })),
        ]),
      ),
    ]);
  }
  Future<void> _guess() async { final w=_ctrl.text.trim(); if(w.isEmpty) return; _ctrl.clear(); GameFeedback.move(); await widget.onAction('guess', {'word':w}); }
}
