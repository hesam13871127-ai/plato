import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Checkers (Draughts) — 8×8 board with glossy men/kings, mandatory capture
/// glow and king-crown promotion. Two players.
class CheckersBoard extends StatefulWidget {
  const CheckersBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<CheckersBoard> createState()=> _CheckersBoardState();
}

class _CheckersBoardState extends State<CheckersBoard> {
  List<int>? _selected;
  String _skin='wood';
  Map<String,dynamic> get b=> widget.session.board;
  List<List<String>> get _grid { final raw=(b['board'] as List?)??const[]; return raw.map((row)=> (row as List).map((c)=> (c as String?)??'').toList()).toList(); }
  bool get _myTurn=> widget.session.isInProgress && widget.session.currentSeat==widget.mySeat;
  bool _isRed(String p)=> p=='r'||p=='R';
  bool _isBlack(String p)=> p=='b'||p=='B';

  void _tap(int r,int c){
    if(!_myTurn) return;
    final grid=_grid; if(grid.isEmpty) return;
    final piece=grid[r][c];
    final myIsRed=widget.mySeat==0;
    if(_selected!=null){
      final [sr,sc]=_selected!;
      if(sr==r && sc==c){ setState(()=> _selected=null); return; }
      GameFeedback.move();
      widget.onAction('move', {'from':[sr,sc],'to':[r,c]});
      setState(()=> _selected=null);
      return;
    }
    if(piece.isNotEmpty && (_isRed(piece)==myIsRed)){
      GameFeedback.tap();
      setState(()=> _selected=[r,c]);
    }
  }

  @override
  Widget build(BuildContext context){
    final grid=_grid;
    final skin=BoardSkin.byId(_skin);
    final mustFrom=(b['mustCaptureFrom'] as List?)?.whereType<num>().map((n)=>n.toInt()).toList();
    final turnColor=(b['turnColor'] as String?)??'r';
    return Column(children:[
      TurnIndicator(text: widget.session.isInProgress ? (_myTurn ? 'Your move — ${turnColor=='r'?'Red':'Black'} to play' : 'Opponent thinking…') : 'Game over', highlight: _myTurn, icon: Icons.circle_rounded),
      const SizedBox(height:6),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:8),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.12)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.4)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.14)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 22, offset: const Offset(0,10)), BoxShadow(color: skin.accent.withOpacity(0.18), blurRadius: 30)]),
        child: AspectRatio(aspectRatio:1, child: Container(
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius: 12, offset: const Offset(0,6))]),
          clipBehavior: Clip.antiAlias,
          child: grid.isEmpty ? const Center(child: Text('Waiting for board…', style: TextStyle(color: AppColors.textMuted))) : Column(children: List.generate(8, (r){
            return Expanded(child: Row(children: List.generate(8, (c){
              final piece=grid[r][c];
              final dark=(r+c)%2==1;
              final selected=_selected!=null && _selected![0]==r && _selected![1]==c;
              final must = mustFrom!=null && mustFrom.length==2 && mustFrom[0]==r && mustFrom[1]==c;
              final lightSq= Color.lerp(skin.feltTop, Colors.white, 0.58)!;
              final darkSq= skin.feltTop;
              return Expanded(child: GestureDetector(onTap:()=> _tap(r,c), child: AnimatedContainer(duration: const Duration(milliseconds:160), decoration: BoxDecoration(
                gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: selected ? [AppColors.softCyan, AppColors.electricPurple] : must ? [AppColors.cosmicGold.withOpacity(0.55), AppColors.cosmicGold.withOpacity(0.25)] : dark ? [darkSq, Color.lerp(darkSq, Colors.black, 0.18)!] : [lightSq, Color.lerp(lightSq, Colors.black, 0.06)!]),
                border: selected ? Border.all(color: Colors.white, width:1.6) : must ? Border.all(color: AppColors.cosmicGold, width:1.4) : null,
                boxShadow: selected ? [BoxShadow(color: AppColors.softCyan.withOpacity(0.5), blurRadius:10)] : must ? [BoxShadow(color: AppColors.cosmicGold.withOpacity(0.5), blurRadius:10)] : null,
              ), child: piece.isEmpty ? null : Center(child: _CheckerToken(piece: piece, selected: selected)))));
            })));
          })),
        )),
      ),
      const SizedBox(height:8),
      Text('Tap a man, then a diagonal step or jump. Capture is mandatory — chain jumps stay with the same piece.', style: TextStyle(color: AppColors.textMuted, fontSize: 11), textAlign: TextAlign.center),
    ]);
  }
}

class _CheckerToken extends StatelessWidget {
  const _CheckerToken({required this.piece, required this.selected});
  final String piece; final bool selected;
  @override Widget build(BuildContext context){
    final isRed= piece=='r'||piece=='R'; final isKing= piece=='R'||piece=='B';
    final base= isRed ? const Color(0xFFEF4444) : const Color(0xFF0F172A);
    final light= isRed ? const Color(0xFFFF8A8A) : const Color(0xFF3A4A6B);
    final dark= isRed ? const Color(0xFF7F1D1D) : const Color(0xFF020617);
    return Container(
      margin: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(center: const Alignment(-0.32,-0.38), colors: [Color.lerp(base, Colors.white, 0.32)!, base, dark]),
        border: Border.all(color: Colors.white.withOpacity(isRed ? 0.92 : 0.22), width:1.3),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.45), blurRadius:6, offset: const Offset(0,3)), if(selected) BoxShadow(color: AppColors.softCyan.withOpacity(0.6), blurRadius:12)],
      ),
      child: Stack(children:[
        Center(child: Container(width: isKing? 20:14, height: isKing?20:14, decoration: BoxDecoration(shape: BoxShape.circle, color: light.withOpacity(0.95), border: Border.all(color: Colors.white.withOpacity(0.7))), child: Center(child: Text(isKing?'♔':'●', style: TextStyle(color: isRed ? const Color(0xFF7F1D1D) : Colors.white, fontSize: isKing?11:9, fontWeight: FontWeight.w900))))),
        // inner shine
        Positioned(left:6, top:5, child: Container(width:8,height:8, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withOpacity(0.55)))),
      ]),
    );
  }
}
