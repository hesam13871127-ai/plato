import 'dart:async';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Bingo 3D — live caller ball + daubed ticket with gold BINGO win.
/// Supports 2–8 players; tickets adapt to seat count display.
class BingoBoard extends StatefulWidget {
  const BingoBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<BingoBoard> createState() => _BingoBoardState();
}

class _BingoBoardState extends State<BingoBoard> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))..repeat(reverse: true);
  Timer? _t; int _tick=0;
  String _skin='midnight';
  static const int free=-1;
  static const _letters=['B','I','N','G','O'];
  @override void initState(){ super.initState(); _t=Timer.periodic(const Duration(milliseconds: 300), (_) { if(mounted) setState(()=>_tick++); });}
  @override void dispose(){ _t?.cancel(); _pulse.dispose(); super.dispose();}
  Map<String,dynamic> get b=> widget.session.board;
  List<int> get _card { final raw=(b['myCard'] as List?)??const[]; final cells= raw.isNotEmpty && raw.first is Map ? ((raw.first['cells'] as List?)??const[]) : raw; return cells.map((v)=> v==null? free : (v as num).toInt()).toList();}
  Set<int> get _called => ((b['called'] as List?)??const[]).whereType<num>().map((n)=>n.toInt()).toSet();
  bool _isMarked(int v)=> v==free || _called.contains(v);
  bool get _hasWin { final card=_card; if(card.length!=25) return false; final marked=List.generate(25,(i)=> _isMarked(card[i])); for(var r=0;r<5;r++) if(List.generate(5,(c)=>marked[r*5+c]).every((e)=>e)) return true; for(var c=0;c<5;c++) if(List.generate(5,(r)=>marked[r*5+c]).every((e)=>e)) return true; if(List.generate(5,(i)=>marked[i*5+i]).every((e)=>e)) return true; if(List.generate(5,(i)=>marked[i*5+(4-i)]).every((e)=>e)) return true; return false;}

  @override
  Widget build(BuildContext context){
    final card=_card; final current=b['currentCall']; final called=_called; final skin=BoardSkin.byId(_skin);
    final markedCounts=((b['markedCounts'] as List?)??const[]).whereType<num>().map((n)=>n.toInt()).toList();
    final canClaim=widget.session.isInProgress && _hasWin;
    return Column(children:[
      TurnIndicator(text: widget.session.isInProgress ? 'Eyes down — daub your card!' : 'Game over', highlight: widget.session.isInProgress, icon: Icons.campaign_rounded),
      const SizedBox(height:6),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:8),
      Row(mainAxisAlignment: MainAxisAlignment.center, children:[
        ScaleTransition(scale: Tween(begin:0.9,end:1.08).animate(CurvedAnimation(parent:_pulse, curve: Curves.easeInOut)), child: Container(width:78,height:78, decoration: BoxDecoration(shape: BoxShape.circle, gradient: AppColors.auroraGradient, boxShadow: [BoxShadow(color: AppColors.neonPink.withOpacity(0.45), blurRadius: 20), BoxShadow(color: AppColors.softCyan.withOpacity(0.35), blurRadius: 28)]), child: Center(child: Text(current==null?'—':'$current', style: const TextStyle(color:Colors.white, fontSize:27, fontWeight: FontWeight.w900, shadows: [Shadow(color: Colors.black54, blurRadius:4)]))))),
        const SizedBox(width:14),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children:[
          Text('${called.length} called', style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 14)),
          const SizedBox(height:2),
          Text('${widget.session.seats.length} players • tap BINGO when ready', style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
          const SizedBox(height:6),
          Wrap(spacing:6, children:[ for(final n in called.take(8)) Container(width:22,height:22, decoration: BoxDecoration(color: AppColors.surfaceElevated, shape: BoxShape.circle, border: Border.all(color: AppColors.glassStroke)), child: Center(child: Text('$n', style: const TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.w700))))]),
        ]),
      ]),
      const SizedBox(height:10),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.10)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.11)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 22, offset: const Offset(0,10))]),
        child: card.length==25 ? Column(children:[
          Container(padding: const EdgeInsets.symmetric(vertical:8), decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.08))), child: Row(children:[ for(var c=0;c<5;c++) Expanded(child: Center(child: Container(width:36,height:36, decoration: BoxDecoration(gradient: AppColors.brandGradient, shape: BoxShape.circle, boxShadow: [BoxShadow(color: AppColors.electricPurple.withOpacity(0.45), blurRadius: 10)]), child: Center(child: Text(_letters[c], style: const TextStyle(color: Colors.white, fontSize:16, fontWeight: FontWeight.w900)))))) ])),
          const SizedBox(height:8),
          AspectRatio(aspectRatio:1, child: GridView.builder(physics: const NeverScrollableScrollPhysics(), gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount:5, crossAxisSpacing:6, mainAxisSpacing:6), itemCount:25, itemBuilder: (context,i){
            final value=card[i]; final isFree=value==free; final marked=_isMarked(value);
            return AnimatedContainer(duration: const Duration(milliseconds:220), decoration: BoxDecoration(
              color: marked ? null : const Color(0xFFF8FAFF), gradient: marked ? const LinearGradient(colors: [AppColors.softCyan, AppColors.electricPurple], begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
              borderRadius: BorderRadius.circular(12), border: Border.all(color: marked ? Colors.white.withOpacity(0.85) : const Color(0xFFE2E8F0)), boxShadow: marked ? [BoxShadow(color: AppColors.softCyan.withOpacity(0.45), blurRadius: 10)] : [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 4, offset: const Offset(0,2))],
            ), child: Stack(children:[
              Center(child: Text(isFree?'★':'$value', style: TextStyle(color: marked ? Colors.white : const Color(0xFF1E293B), fontWeight: FontWeight.w900, fontSize: isFree?20:16, shadows: marked ? [const Shadow(color: Colors.black38, blurRadius:3)] : null))),
              if(marked && !isFree) const Positioned(right:4, top:4, child: Icon(Icons.check_circle_rounded, size:14, color: Colors.white)),
              if(isFree) Positioned.fill(child: Container(decoration: BoxDecoration(color: AppColors.cosmicGold.withOpacity(0.18), borderRadius: BorderRadius.circular(12)))),
            ]));
          })),
        ]) : const SizedBox(height:180, child: Center(child: Text('No card dealt.', style: TextStyle(color: AppColors.textMuted)))),
      ),
      const SizedBox(height:12),
      SizedBox(width: double.infinity, child: ElevatedButton.icon(
        onPressed: canClaim ? (){ GameFeedback.win(); widget.onAction('claim', {}); } : null,
        icon: const Icon(Icons.emoji_events_rounded), label: Text(canClaim?'BINGO! — claim now':'Keep daubing…', style: const TextStyle(fontWeight: FontWeight.w900)),
        style: ElevatedButton.styleFrom(backgroundColor: canClaim ? AppColors.success : AppColors.surfaceElevated, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical:15), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)), elevation: canClaim ? 8 : 0),
      )),
      const SizedBox(height:8),
      Wrap(spacing:8, alignment: WrapAlignment.center, children:[ for(var i=0;i<widget.session.seats.length;i++) Container(padding: const EdgeInsets.symmetric(horizontal:8, vertical:4), decoration: BoxDecoration(color: i==widget.mySeat ? AppColors.electricPurple.withOpacity(0.18) : AppColors.glassFill, borderRadius: BorderRadius.circular(10), border: Border.all(color: i==widget.mySeat ? AppColors.electricPurple.withOpacity(0.5) : AppColors.glassStroke)), child: Text('${i==widget.mySeat ? 'You' : widget.session.seats[i].displayName}: ${i<markedCounts.length? markedCounts[i]:0}', style: TextStyle(color: i==widget.mySeat ? AppColors.textPrimary : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)))]),
      Opacity(opacity:0, child: Text('$_tick')),
    ]);
  }
}
