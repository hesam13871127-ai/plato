import 'dart:async';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Werewolf — night/day with 3D role cards, voting halos.
class WerewolfBoard extends StatefulWidget {
  const WerewolfBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<WerewolfBoard> createState()=> _WerewolfBoardState();
}

class _WerewolfBoardState extends State<WerewolfBoard> {
  Timer? _t; int _now=DateTime.now().millisecondsSinceEpoch; String _skin='midnight';
  @override void initState(){ super.initState(); _t=Timer.periodic(const Duration(milliseconds:300), (_){ if(mounted) setState(()=> _now=DateTime.now().millisecondsSinceEpoch);});}
  @override void dispose(){ _t?.cancel(); super.dispose();}
  Map<String,dynamic> get b=> widget.session.board;
  List<Map<String,dynamic>> get _players=> ((b['players'] as List?)??const[]).whereType<Map>().map((e)=> Map<String,dynamic>.from(e)).toList();
  @override
  Widget build(BuildContext context){
    final phase=(b['phase'] as String?)??'day_discuss'; final day=(b['day'] as num?)?.toInt() ?? 1;
    final myRole=b['myRole'] as String?; final players=_players;
    final votes=((b['votes'] as Map?)??const{}).map((k,v)=> MapEntry(int.tryParse('$k')??-1, (v as num).toInt()));
    final log=((b['log'] as List?)??const[]).whereType<String>().toList();
    final endsAt=DateTime.tryParse((b['phaseEndsAt'] as String?)??'')?.millisecondsSinceEpoch;
    final remain= ((endsAt ?? _now) - _now)/1000;
    final isNight= phase=='night_kill' || phase=='night_seer'; final iAmWolf=myRole=='werewolf'; final iAmSeer=myRole=='seer';
    final me= widget.mySeat>=0 && widget.mySeat<players.length ? players[widget.mySeat] : null; final iAlive=me?['alive']==true; final skin=BoardSkin.byId(_skin);
    return Column(children:[
      TurnIndicator(text: widget.session.isCompleted ? 'Game over' : isNight ? '🌙 Night $day — eyes closed' : phase=='day_vote' ? '☀️ Day $day — vote to lynch!' : '☀️ Day $day — discuss', highlight: widget.session.isInProgress, icon: isNight ? Icons.nightlight_round : Icons.wb_sunny_rounded),
      const SizedBox(height:4),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:6),
      if(myRole!=null) Container(padding: const EdgeInsets.symmetric(horizontal:12, vertical:7), decoration: BoxDecoration(gradient: iAmWolf ? const LinearGradient(colors:[Color(0xFFEF4444), Color(0xFF7F1D1D)]) : iAmSeer ? const LinearGradient(colors:[Color(0xFF8B5CF6), Color(0xFF3B1A6B)]) : const LinearGradient(colors:[Color(0xFF22C55E), Color(0xFF14532D)]), borderRadius: BorderRadius.circular(12), boxShadow: [BoxShadow(color: (iAmWolf ? AppColors.danger : AppColors.electricPurple).withOpacity(0.35), blurRadius:10)]), child: Row(mainAxisSize: MainAxisSize.min, children:[ Text(_roleLabel(myRole!), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize:13)), const SizedBox(width:6), const Icon(Icons.visibility_rounded, color: Colors.white, size:14)])),
      if(widget.session.isInProgress) Padding(padding: const EdgeInsets.only(top:6), child: Text('${remain.clamp(0,99).toStringAsFixed(0)}s left', style: const TextStyle(color: AppColors.warning, fontSize:12, fontWeight: FontWeight.w700))),
      const SizedBox(height:8),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.12)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.12)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius:22, offset: const Offset(0,10))]),
        child: Column(children:[
          GridView.count(
            crossAxisCount:4, shrinkWrap:true, physics: const NeverScrollableScrollPhysics(), mainAxisSpacing:8, crossAxisSpacing:8, childAspectRatio:0.92,
            children:[
              for(var i=0;i<players.length;i++)
                _PlayerCard(
                  name: i==widget.mySeat ? 'You' : widget.session.seats[i].displayName,
                  alive: players[i]['alive']==true,
                  role: players[i]['role'] as String?,
                  votes: votes.values.where((v)=> v==i).length,
                  showVotes: phase=='day_vote',
                  isMe: i==widget.mySeat,
                  onTap: iAlive && widget.session.isInProgress ? ()=> _onTap(i, phase, iAmWolf, iAmSeer, players) : null,
                ),
            ],
          ),
          const SizedBox(height:10),
          Container(constraints: const BoxConstraints(maxHeight:88), width: double.infinity, padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.08))), child: ListView(reverse:true, children:[ for(final line in log.reversed) Padding(padding: const EdgeInsets.symmetric(vertical:1), child: Text(line, style: const TextStyle(color: AppColors.textSecondary, fontSize:11)))])),
        ]),
      ),
    ]);
  }
  void _onTap(int target, String phase, bool iAmWolf, bool iAmSeer, List<Map<String,dynamic>> players){
    if(target==widget.mySeat) return; if(players[target]['alive']!=true) return;
    if(phase=='night_kill' && iAmWolf){ GameFeedback.hit(); widget.onAction('kill', {'target':target}); }
    else if(phase=='night_seer' && iAmSeer){ GameFeedback.tap(); widget.onAction('seer_check', {'target':target}); }
    else if(phase=='day_vote'){ GameFeedback.tap(); widget.onAction('vote', {'target':target}); }
  }
  String _roleLabel(String r)=> r=='werewolf' ? '🐺 Werewolf' : r=='seer' ? '🔮 Seer' : '🧑‍🌾 Villager';
}

class _PlayerCard extends StatelessWidget {
  const _PlayerCard({required this.name, required this.alive, required this.role, required this.votes, required this.showVotes, required this.isMe, required this.onTap});
  final String name; final bool alive; final String? role; final int votes; final bool showVotes; final bool isMe; final VoidCallback? onTap;
  @override
  Widget build(BuildContext context){
    return GestureDetector(
      onTap:onTap,
      child: AnimatedOpacity(
        opacity: alive ? 1:0.38, duration: const Duration(milliseconds:300),
        child: Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            gradient: isMe ? const LinearGradient(colors:[Color(0xFF8B5CF6), Color(0xFF22D3EE)], begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
            color: isMe ? null : AppColors.glassFill,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: alive ? (isMe ? Colors.white.withOpacity(0.9) : AppColors.glassStroke) : AppColors.danger.withOpacity(0.5), width: isMe ? 1.6:1),
            boxShadow: isMe ? [BoxShadow(color: AppColors.electricPurple.withOpacity(0.35), blurRadius:10)] : null,
          ),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children:[
            Container(width:32,height:32, decoration: BoxDecoration(color: alive ? AppColors.softCyan.withOpacity(0.18) : AppColors.danger.withOpacity(0.18), shape: BoxShape.circle, border: Border.all(color: alive ? AppColors.softCyan : AppColors.danger)), child: Icon(alive ? Icons.person_rounded : Icons.person_off_rounded, size:20, color: alive ? AppColors.softCyan : AppColors.danger)),
            const SizedBox(height:4),
            Text(name, maxLines:1, overflow: TextOverflow.ellipsis, style: TextStyle(color: isMe ? Colors.white : AppColors.textPrimary, fontSize:11, fontWeight: FontWeight.w700)),
            if(role!=null) Text(role=='werewolf' ? '🐺' : role=='seer' ? '🔮' : '🧑‍🌾', style: const TextStyle(fontSize:12)),
            if(showVotes && votes>0) Container(margin: const EdgeInsets.only(top:2), padding: const EdgeInsets.symmetric(horizontal:6, vertical:2), decoration: BoxDecoration(color: AppColors.warning.withOpacity(0.22), borderRadius: BorderRadius.circular(8)), child: Text('$votes vote${votes>1?"s":""}', style: const TextStyle(color: AppColors.warning, fontSize:9, fontWeight: FontWeight.w900))),
          ]),
        ),
      ),
    );
  }
}
