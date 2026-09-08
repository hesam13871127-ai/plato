import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Ocho (Crazy Eights / UNO) — 3D fanned hand, tilted discard + deck,
/// neon active-color orb and 2–4 player direction arrow. Skin tints felt.
class OchoBoard extends StatefulWidget {
  const OchoBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<OchoBoard> createState()=> _OchoBoardState();
}

class _OchoBoardState extends State<OchoBoard> {
  String _skin='midnight';
  static const _colors={ 'R': Color(0xFFEF4444), 'G': Color(0xFF22C55E), 'B': Color(0xFF3B82F6), 'Y': Color(0xFFF59E0B), 'W': Color(0xFF1E293B) };
  Map<String,dynamic> get b=> widget.session.board;
  List<Map<String,dynamic>> get _hand=> ((b['hand'] as List?)??const[]).whereType<Map>().map((e)=> Map<String,dynamic>.from(e)).toList();
  bool get _myTurn=> widget.session.isInProgress && widget.session.currentSeat==widget.mySeat;

  Future<void> _play(Map<String,dynamic> card) async {
    if(!_myTurn) return;
    String? chosen;
    if(card['color']=='W'){ chosen= await _pickColor(); if(chosen==null) return; }
    GameFeedback.move();
    await widget.onAction('play', {'cardId': card['id'], if(chosen!=null) 'color': chosen});
  }

  Future<String?> _pickColor(){
    return showModalBottomSheet<String>(context: context, backgroundColor: AppColors.surfaceDark, shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))), builder: (ctx)=> Padding(padding: const EdgeInsets.all(22), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children:[
      const Text('Choose a colour', textAlign: TextAlign.center, style: TextStyle(color: AppColors.textPrimary, fontSize:18, fontWeight: FontWeight.w900)),
      const SizedBox(height:18),
      Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: ['R','G','B','Y'].map((c)=> GestureDetector(onTap:()=> Navigator.of(ctx).pop(c), child: Container(width:58,height:58, decoration: BoxDecoration(color: _colors[c], shape: BoxShape.circle, border: Border.all(color: Colors.white, width:2), boxShadow: [BoxShadow(color: _colors[c]!.withOpacity(0.5), blurRadius: 14)]) , child: const Icon(Icons.palette_rounded, color: Colors.white)))).toList()),
      const SizedBox(height:10),
    ])));
  }

  @override
  Widget build(BuildContext context){
    final top=(b['discardTop'] as Map?)??const{}; final activeColor=(b['activeColor'] as String?)??'R'; final drawCount=(b['drawCount'] as num?)?.toInt()??0; final pending=(b['drawPending'] as num?)?.toInt()??0; final direction=(b['direction'] as num?)?.toInt()??1; final hand=_hand; final skin=BoardSkin.byId(_skin);
    return Column(children:[
      TurnIndicator(text: widget.session.isInProgress ? (_myTurn ? 'Your turn — play a card!' : 'Waiting for ${widget.session.seats[widget.session.currentSeat].displayName}…') : 'Game over', highlight: _myTurn, icon: direction==1 ? Icons.trending_flat_rounded : Icons.trending_flat_rounded),
      const SizedBox(height:6),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:8),
      Container(
        padding: const EdgeInsets.fromLTRB(10,12,10,12),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.10)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.11)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 22, offset: const Offset(0,10))]),
        child: Column(children:[
          Row(mainAxisAlignment: MainAxisAlignment.center, children:[
            Container(padding: const EdgeInsets.symmetric(horizontal:8, vertical:4), decoration: BoxDecoration(color: Colors.white.withOpacity(0.08), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.white.withOpacity(0.08))), child: Row(children:[Icon(direction==1 ? Icons.east_rounded : Icons.west_rounded, color: AppColors.textSecondary, size:16), const SizedBox(width:4), Text('${widget.session.seats.length}P • ${direction==1?"CW":"CCW"}', style: const TextStyle(color: AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700))])),
            const SizedBox(width:12),
            Transform.rotate(angle: -0.06, child: _CardView(card: Map<String,dynamic>.from(top), size: 96, tilt: -0.08)),
            const SizedBox(width:18),
            GestureDetector(onTap: _myTurn ? (){ GameFeedback.hit(); widget.onAction('draw', {}); } : null, child: _Deck(size: 96, count: drawCount)),
            const SizedBox(width:12),
            Container(width:42,height:42, decoration: BoxDecoration(color: _colors[activeColor], shape: BoxShape.circle, border: Border.all(color: Colors.white, width:2.2), boxShadow: [BoxShadow(color: (_colors[activeColor]!).withOpacity(0.55), blurRadius: 14)]), child: const Icon(Icons.color_lens_rounded, color: Colors.white, size:18)),
          ]),
          if(pending>0) Padding(padding: const EdgeInsets.only(top:10), child: Container(padding: const EdgeInsets.symmetric(horizontal:10, vertical:6), decoration: BoxDecoration(color: AppColors.warning.withOpacity(0.18), borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.warning.withOpacity(0.5))), child: Text('+$pending pending — stack a +2/+4 or draw!', style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w800, fontSize:12)))),
        ]),
      ),
      const SizedBox(height:10),
      SizedBox(height: 136, child: ListView.separated(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal:8), itemCount: hand.length, separatorBuilder: (_, __)=> const SizedBox(width: 6), itemBuilder: (context,i){
        final card=hand[i]; final isPlayable=_myTurn; // server validates anyway
        return GestureDetector(onTap: ()=> _play(card), child: Transform.rotate(angle: (i - hand.length/2)*0.06, child: Opacity(opacity: _myTurn ? 1 : 0.72, child: _CardView(card: card, size: 92, highlight: isPlayable))));
      })),
      const SizedBox(height:6),
      Text('Tap a card to play • Wild asks colour • Stack +2/+4', style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
    ]);
  }
}

class _Deck extends StatelessWidget {
  const _Deck({required this.size, required this.count});
  final double size; final int count;
  @override Widget build(BuildContext context){
    return Column(mainAxisSize: MainAxisSize.min, children:[
      Transform.rotate(angle: 0.04, child: Container(width: size*0.66, height: size, decoration: BoxDecoration(gradient: AppColors.auroraGradient, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.9), width:1.4), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius: 10, offset: const Offset(0,4)), BoxShadow(color: AppColors.electricPurple.withOpacity(0.35), blurRadius: 16)]), child: const Center(child: Text('OCHO', style: TextStyle(color:Colors.white, fontWeight: FontWeight.w900, fontSize:16, letterSpacing:1.2, shadows: [Shadow(color: Colors.black54, blurRadius:3)]))))),
      const SizedBox(height:5),
      Container(padding: const EdgeInsets.symmetric(horizontal:7, vertical:2), decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(8), border: Border.all(color: AppColors.glassStroke)), child: Text('$count left', style: const TextStyle(color: AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700))),
    ]);
  }
}

class _CardView extends StatelessWidget {
  const _CardView({required this.card, required this.size, this.tilt=0, this.highlight=false});
  final Map<String,dynamic> card; final double size; final double tilt; final bool highlight;
  static const _colors={ 'R': Color(0xFFEF4444), 'G': Color(0xFF22C55E), 'B': Color(0xFF3B82F6), 'Y': Color(0xFFF59E0B), 'W': Color(0xFF0F172A) };
  @override Widget build(BuildContext context){
    final color=_colors[card['color'] as String? ?? 'W'] ?? const Color(0xFF0F172A);
    final rank=(card['rank'] as String?)??'?';
    final label= rank=='S' ? '⊘' : rank=='R' ? '⇄' : rank=='P' ? '+2' : rank=='X' ? '+4' : rank=='W' ? '★' : rank;
    return Transform.rotate(angle: tilt, child: Container(
      width: size*0.66, height: size,
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color.lerp(color, Colors.white, 0.18)!, color, Color.lerp(color, Colors.black, 0.22)!]),
        borderRadius: BorderRadius.circular(13), border: Border.all(color: Colors.white.withOpacity(0.92), width: 1.4),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.32), blurRadius: 10, offset: const Offset(0,5)), if(highlight) BoxShadow(color: AppColors.softCyan.withOpacity(0.45), blurRadius: 16)],
      ),
      child: Center(child: Container(width: size*0.44, height: size*0.60, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(50), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.15), blurRadius: 6)]), child: Center(child: Text(label, style: TextStyle(color: color==const Color(0xFF0F172A) ? AppColors.electricPurple : color, fontWeight: FontWeight.w900, fontSize: size*0.26))))),
    ));
  }
}
