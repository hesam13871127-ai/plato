import 'dart:async';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Memory Race — 16-card grid with 3D flip tiles, skin-tinted frame.
class MemoryRaceBoard extends StatefulWidget {
  const MemoryRaceBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<MemoryRaceBoard> createState()=> _MemoryRaceBoardState();
}

class _MemoryRaceBoardState extends State<MemoryRaceBoard> {
  Timer? _tick; int _now=DateTime.now().millisecondsSinceEpoch; bool _busy=false; String _skin='cosmic';
  Map<String,dynamic> get b=> widget.session.board;
  @override void initState(){ super.initState(); _tick=Timer.periodic(const Duration(milliseconds:250), (_){ if(mounted) setState(()=> _now=DateTime.now().millisecondsSinceEpoch); });}
  @override void dispose(){ _tick?.cancel(); super.dispose();}
  Color _ownerColor(int seat){ const colors=[AppColors.softCyan, AppColors.warning, AppColors.success, AppColors.danger, AppColors.electricPurple, AppColors.textSecondary]; return colors[seat % colors.length];}
  Future<void> _flip(int i) async { setState(()=> _busy=true); GameFeedback.tap(); await widget.onAction('flip', {'index':i}); if(mounted) setState(()=> _busy=false);}

  @override
  Widget build(BuildContext context){
    final emojis=((b['emojis'] as List?)??const[]).map((e)=> e==null?'':e.toString()).toList();
    final states=((b['states'] as List?)??const[]).map((e)=> e.toString()).toList();
    final matchedBy=((b['matchedBy'] as List?)??const[]).map((e)=> (e as num?)?.toInt() ?? -1).toList();
    final scores=((b['scores'] as List?)??const[]).map((e)=> (e as num?)?.toInt() ?? 0).toList();
    final endsAt=DateTime.tryParse((b['roundEndsAt'] as String?)??'')?.millisecondsSinceEpoch ?? _now;
    final remain=((endsAt-_now)/1000).clamp(0,120).toStringAsFixed(0);
    final flippedCount=((b['flipped'] as List?)??const[]).length;
    final pairsLeft=(emojis.length ~/2) - ((matchedBy.where((s)=> s>=0).length) ~/2);
    final skin=BoardSkin.byId(_skin);
    return Column(children:[
      TurnIndicator(text: widget.session.isInProgress ? 'Flip and match! $pairsLeft pairs left' : 'Game over', highlight: widget.session.isInProgress, icon: Icons.style_rounded),
      const SizedBox(height:4),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:6),
      Container(padding: const EdgeInsets.symmetric(horizontal:12, vertical:6), decoration: BoxDecoration(color: AppColors.warning.withOpacity(0.14), borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.warning.withOpacity(0.35))), child: Text('⏳ $remain s — be the fastest pair hunter!', style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w800, fontSize:12))),
      const SizedBox(height:8),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.12)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.12)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius:22, offset: const Offset(0,10))]),
        child: Column(children:[
          GridView.count(
            crossAxisCount:4, shrinkWrap:true, physics: const NeverScrollableScrollPhysics(), mainAxisSpacing:8, crossAxisSpacing:8,
            children: List.generate(emojis.length, (i){
              final state=i < states.length ? states[i] : 'down'; final revealed= state=='up' || state=='matched'; final matched= state=='matched'; final owner= i < matchedBy.length ? matchedBy[i] : -1; final ownerColor= owner>=0 ? _ownerColor(owner) : AppColors.glassStroke;
              return GestureDetector(
                onTap: (matched || !widget.session.isInProgress || flippedCount>=2 || _busy) ? null : ()=> _flip(i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds:200),
                  decoration: BoxDecoration(
                    gradient: revealed ? null : const LinearGradient(colors: [Color(0xFF3B1A6B), Color(0xFF1A2340)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                    color: revealed ? (matched ? ownerColor.withOpacity(0.18) : const Color(0xFFFFFEFF)) : null,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: matched ? ownerColor : (revealed ? AppColors.softCyan.withOpacity(0.8) : Colors.white.withOpacity(0.12)), width: matched ? 2.2:1.2),
                    boxShadow: revealed ? [BoxShadow(color: matched ? ownerColor.withOpacity(0.45) : AppColors.softCyan.withOpacity(0.35), blurRadius:10)] : [BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius:6, offset: const Offset(0,3))],
                  ),
                  child: Center(child: revealed ? Text(emojis[i], style: TextStyle(fontSize: matched ? 28:26)) : const Text('✦', style: TextStyle(color: AppColors.softCyan, fontSize:22, fontWeight: FontWeight.w900))),
                ),
              );
            }),
          ),
          const SizedBox(height:12),
          Wrap(spacing:8, runSpacing:6, alignment: WrapAlignment.center, children: List.generate(scores.length, (i){
            return Container(padding: const EdgeInsets.symmetric(horizontal:12, vertical:8), decoration: BoxDecoration(color: i==widget.mySeat ? AppColors.electricPurple.withOpacity(0.22) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: i==widget.mySeat ? AppColors.electricPurple.withOpacity(0.5) : AppColors.glassStroke)), child: Row(mainAxisSize: MainAxisSize.min, children:[ Icon(Icons.style_rounded, size:14, color: _ownerColor(i)), const SizedBox(width:6), Text(i==widget.mySeat ? 'You' : widget.session.seats[i].displayName, style: const TextStyle(color: AppColors.textPrimary, fontSize:12, fontWeight: FontWeight.w700)), const SizedBox(width:8), Container(padding: const EdgeInsets.symmetric(horizontal:8, vertical:2), decoration: BoxDecoration(color: AppColors.softCyan.withOpacity(0.18), borderRadius: BorderRadius.circular(8)), child: Text('${scores[i]}', style: const TextStyle(color: AppColors.softCyan, fontWeight: FontWeight.w900)))]));
          })),
        ]),
      ),
    ]);
  }
}
