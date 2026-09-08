import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Word Chain — 3D flowing chain with gradient word pills, letter orb.
class WordChainBoard extends StatefulWidget {
  const WordChainBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<WordChainBoard> createState()=> _WordChainBoardState();
}

class _WordChainBoardState extends State<WordChainBoard> {
  final TextEditingController _ctrl=TextEditingController(); bool _busy=false; String _skin='midnight';
  Map<String,dynamic> get b=> widget.session.board;
  @override void dispose(){ _ctrl.dispose(); super.dispose();}
  @override
  Widget build(BuildContext context){
    final players=((b['players'] as List?)??const[]); final chain=((b['chain'] as List?)??const[]).map((e)=> e.toString()).toList();
    final requiredLetter=b['requiredFirstLetter']?.toString(); final lastWord=b['lastWord']?.toString() ?? '';
    final myTurn= widget.session.isInProgress && widget.session.currentSeat==widget.mySeat; final skin=BoardSkin.byId(_skin);
    return Column(children:[
      TurnIndicator(text: widget.session.isInProgress ? myTurn ? (requiredLetter!=null ? 'Your turn — starts with \"$requiredLetter\"' : 'Your turn — start the chain!') : 'Waiting for ${_currentName()}…' : 'Game over', highlight: myTurn, icon: Icons.text_fields_rounded),
      const SizedBox(height:4),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:8),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.12)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.12)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius:22, offset: const Offset(0,10))]),
        child: Column(children:[
          // last word hero
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal:18, vertical:16),
            decoration: BoxDecoration(gradient: AppColors.auroraGradient, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: AppColors.electricPurple.withOpacity(0.35), blurRadius:14)]),
            child: Column(children:[
              if(lastWord.isNotEmpty) Text(lastWord.toUpperCase(), textAlign: TextAlign.center, style: const TextStyle(fontSize:28, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing:1.2, shadows: [Shadow(color: Colors.black38, blurRadius:4)])) else const Text('No word yet — start the chain!', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w600)),
              if(requiredLetter!=null) ...[
                const SizedBox(height:10),
                Row(mainAxisAlignment: MainAxisAlignment.center, children:[
                  const Text('Next starts with', style: TextStyle(color: Colors.white70, fontSize:12, fontWeight: FontWeight.w600)),
                  const SizedBox(width:8),
                  Container(width:36,height:36, decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius:6)]), child: Center(child: Text(requiredLetter.toUpperCase(), style: const TextStyle(color: AppColors.electricPurple, fontWeight: FontWeight.w900, fontSize:18)))),
                ]),
              ],
            ]),
          ),
          const SizedBox(height:12),
          if(myTurn) Row(children:[
            Expanded(child: TextField(controller:_ctrl, enabled:!_busy, autofocus:true, textCapitalization: TextCapitalization.none, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600), decoration: InputDecoration(hintText: requiredLetter!=null ? 'Word starting with $requiredLetter…' : 'Type a word…', filled:true, fillColor: Colors.white.withOpacity(0.08), border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none), hintStyle: TextStyle(color: AppColors.textMuted)), onSubmitted: (_)=> _submit())),
            const SizedBox(width:10),
            FilledButton(style: FilledButton.styleFrom(backgroundColor: AppColors.electricPurple, padding: const EdgeInsets.symmetric(horizontal:18, vertical:16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))), onPressed: _busy ? null : _submit, child: const Text('Play', style: TextStyle(fontWeight: FontWeight.w800))),
          ]) else if(widget.session.isInProgress) const Padding(padding: EdgeInsets.symmetric(vertical:6), child: Text('Wait for your turn…', style: TextStyle(color: AppColors.textMuted, fontSize:12))),
          if(myTurn) TextButton(onPressed: _busy ? null : _pass, child: const Text('Pass (lose a life)', style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700))),
          const Divider(color: AppColors.glassStroke),
          const SizedBox(height:4),
          Wrap(spacing:8, runSpacing:6, alignment: WrapAlignment.center, children: List.generate(players.length, (i){
            final p=Map<String,dynamic>.from(players[i] as Map); final alive=p['alive']==true; final lives=(p['lives'] as num?)?.toInt() ?? 0;
            return Container(padding: const EdgeInsets.symmetric(horizontal:12, vertical:8), decoration: BoxDecoration(color: i==widget.mySeat ? AppColors.electricPurple.withOpacity(0.22) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: widget.session.currentSeat==i && alive ? AppColors.softCyan : AppColors.glassStroke, width: widget.session.currentSeat==i ? 1.6:1)), child: Row(mainAxisSize: MainAxisSize.min, children:[ Text(i==widget.mySeat ? 'You' : widget.session.seats[i].displayName, style: TextStyle(color: alive ? AppColors.textPrimary : AppColors.textMuted, fontSize:12, fontWeight: FontWeight.w700, decoration: alive ? null : TextDecoration.lineThrough)), const SizedBox(width:8), Text('❤️' * lives, style: const TextStyle(fontSize:12))]));
          })),
          if(chain.isNotEmpty) ...[
            const SizedBox(height:10),
            SizedBox(height:36, child: ListView(scrollDirection: Axis.horizontal, reverse:true, children: chain.reversed.take(12).map((w)=> Padding(padding: const EdgeInsets.symmetric(horizontal:4), child: Container(padding: const EdgeInsets.symmetric(horizontal:12, vertical:7), decoration: BoxDecoration(gradient: LinearGradient(colors: [AppColors.electricPurple.withOpacity(0.35), AppColors.softCyan.withOpacity(0.22)], begin: Alignment.topLeft, end: Alignment.bottomRight), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.12))), child: Text(w, style: const TextStyle(fontSize:12, color: AppColors.textPrimary, fontWeight: FontWeight.w700))))).toList())),
          ],
        ]),
      ),
    ]);
  }
  String _currentName(){ final seat=widget.session.currentSeat; if(seat<0||seat>=widget.session.seats.length) return '…'; return seat==widget.mySeat ? 'you' : widget.session.seats[seat].displayName; }
  Future<void> _submit() async { final word=_ctrl.text.trim().toLowerCase(); if(word.isEmpty) return; setState(()=> _busy=true); GameFeedback.move(); await widget.onAction('word', {'word':word}); _ctrl.clear(); if(mounted) setState(()=> _busy=false); }
  Future<void> _pass() async { setState(()=> _busy=true); await widget.onAction('pass', {}); if(mounted) setState(()=> _busy=false); }
}
