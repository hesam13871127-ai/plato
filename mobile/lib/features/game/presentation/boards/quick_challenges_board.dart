import 'dart:async';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Quick Challenges — 6 micro-games with 3D progress and tap targets.
class QuickChallengesBoard extends StatefulWidget {
  const QuickChallengesBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<QuickChallengesBoard> createState()=> _QuickChallengesBoardState();
}

class _QuickChallengesBoardState extends State<QuickChallengesBoard> {
  Timer? _t; int _now=DateTime.now().millisecondsSinceEpoch; String _skin='midnight';
  @override void initState(){ super.initState(); _t=Timer.periodic(const Duration(milliseconds:200), (_){ if(mounted) setState(()=> _now=DateTime.now().millisecondsSinceEpoch);});}
  @override void dispose(){ _t?.cancel(); super.dispose();}
  Map<String,dynamic> get b=> widget.session.board;
  @override
  Widget build(BuildContext context){
    final challenge=(b['currentChallenge'] as String?)?? 'tap'; final idx=(b['challengeIndex'] as num?)?.toInt() ?? 0;
    final total=(b['totalChallenges'] as num?)?.toInt() ?? 6; final endsAt=DateTime.tryParse((b['endsAt'] as String?)??'')?.millisecondsSinceEpoch ?? _now;
    final remain=((endsAt-_now)/1000).clamp(0,20).toStringAsFixed(1); final scores=((b['scores'] as List?)??const[]).whereType<num>().map((n)=>n.toInt()).toList();
    final skin=BoardSkin.byId(_skin);
    return Column(children:[
      TurnIndicator(text: widget.session.isInProgress ? 'Challenge ${idx+1} of $total — $challenge' : 'Game over', highlight: widget.session.isInProgress, icon: Icons.bolt_rounded),
      const SizedBox(height:4),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:6),
      Container(padding: const EdgeInsets.symmetric(horizontal:12, vertical:6), decoration: BoxDecoration(color: AppColors.warning.withOpacity(0.14), borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.warning.withOpacity(0.35))), child: Text('⏳ $remain s', style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w800, fontSize:12))),
      const SizedBox(height:8),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.12)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.12)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius:22, offset: const Offset(0,10))]),
        child: Column(children:[
          // progress dots
          Row(mainAxisAlignment: MainAxisAlignment.center, children: List.generate(total, (i)=> Container(margin: const EdgeInsets.symmetric(horizontal:4), width: idx==i ? 22:10, height:10, decoration: BoxDecoration(color: i<idx ? AppColors.success : i==idx ? AppColors.softCyan : Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(6), boxShadow: i==idx ? [BoxShadow(color: AppColors.softCyan.withOpacity(0.6), blurRadius:8)] : null)))),
          const SizedBox(height:12),
          // challenge card
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(14,18,14,16),
            decoration: BoxDecoration(gradient: AppColors.auroraGradient, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: AppColors.electricPurple.withOpacity(0.35), blurRadius:14)], border: Border.all(color: Colors.white.withOpacity(0.9), width:1.2)),
            child: Column(children:[
              Icon(_iconFor(challenge), color: Colors.white, size:36),
              const SizedBox(height:8),
              Text(_titleFor(challenge), style: const TextStyle(color: Colors.white, fontSize:18, fontWeight: FontWeight.w900), textAlign: TextAlign.center),
              const SizedBox(height:4),
              Text(_descFor(challenge), style: const TextStyle(color: Colors.white70, fontSize:12, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
            ]),
          ),
          const SizedBox(height:12),
          // action area depends on challenge
          _ActionForChallenge(challenge: challenge, onTap: (){ GameFeedback.tap(); widget.onAction('tap', {}); }),
          const SizedBox(height:10),
          Wrap(spacing:8, runSpacing:6, alignment: WrapAlignment.center, children: List.generate(scores.length, (i){
            return Container(padding: const EdgeInsets.symmetric(horizontal:10, vertical:7), decoration: BoxDecoration(color: i==widget.mySeat ? AppColors.electricPurple.withOpacity(0.18) : AppColors.glassFill, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.glassStroke)), child: Row(mainAxisSize: MainAxisSize.min, children:[ Text(i==widget.mySeat ? 'You' : widget.session.seats[i].displayName, style: const TextStyle(color: AppColors.textPrimary, fontSize:12, fontWeight: FontWeight.w700)), const SizedBox(width:8), Container(padding: const EdgeInsets.symmetric(horizontal:7, vertical:2), decoration: BoxDecoration(color: AppColors.cosmicGold.withOpacity(0.18), borderRadius: BorderRadius.circular(8)), child: Text('${scores[i]}', style: const TextStyle(color: AppColors.cosmicGold, fontWeight: FontWeight.w900, fontSize:12)))]));
          })),
        ]),
      ),
    ]);
  }
  IconData _iconFor(String c){
    switch(c){
      case 'tap': return Icons.touch_app_rounded;
      case 'swipe': return Icons.swipe_rounded;
      case 'shake': return Icons.vibration_rounded;
      case 'memory': return Icons.psychology_rounded;
      default: return Icons.bolt_rounded;
    }
  }
  String _titleFor(String c){
    switch(c){
      case 'tap': return 'TAP FRENZY';
      case 'swipe': return 'SWIPE RUSH';
      case 'shake': return 'SHAKE IT';
      case 'memory': return 'RECALL';
      default: return c.toUpperCase();
    }
  }
  String _descFor(String c){
    switch(c){
      case 'tap': return 'Tap as fast as you can!';
      case 'swipe': return 'Swipe in the shown direction!';
      case 'shake': return 'Shake your phone!';
      default: return 'React quickly!';
    }
  }
}

class _ActionForChallenge extends StatelessWidget {
  const _ActionForChallenge({required this.challenge, required this.onTap});
  final String challenge; final VoidCallback onTap;
  @override
  Widget build(BuildContext context){
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity, height:86,
        decoration: BoxDecoration(gradient: const LinearGradient(colors:[Color(0xFF22D3EE), Color(0xFF8B5CF6)], begin: Alignment.topLeft, end: Alignment.bottomRight), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.9), width:1.4), boxShadow: [BoxShadow(color: AppColors.electricPurple.withOpacity(0.35), blurRadius:14), BoxShadow(color: Colors.black.withOpacity(0.25), blurRadius:8, offset: const Offset(0,4))]),
        child: Center(child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.ads_click_rounded, color: Colors.white, size:28), const SizedBox(width:10), Text(challenge=='tap' ? 'TAP!' : 'GO!', style: const TextStyle(color: Colors.white, fontSize:24, fontWeight: FontWeight.w900, letterSpacing:1.2))])),
      ),
    );
  }
}
