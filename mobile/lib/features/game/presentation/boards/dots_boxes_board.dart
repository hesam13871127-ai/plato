import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Dots & Boxes — 5×5 boxes (6×6 dots). Players draw glowing edges; completing
/// a box claims it with their colour and grants an extra turn. 2–4 players.
class DotsBoxesBoard extends StatefulWidget {
  const DotsBoxesBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<DotsBoxesBoard> createState()=> _DotsBoxesBoardState();
}

class _DotsBoxesBoardState extends State<DotsBoxesBoard> {
  String _skin='midnight';
  static const _seatColors=[AppColors.softCyan, AppColors.danger, AppColors.success, AppColors.warning, AppColors.neonPink, AppColors.cosmicGold];
  Map<String,dynamic> get b=> widget.session.board;
  int get _size => (b['size'] as num?)?.toInt() ?? 5;
  List<List<bool>> _h(){ final raw=(b['h'] as List?)??const[]; return raw.map((row)=> (row as List).map((v)=> v==true).toList()).cast<List<bool>>().toList(); }
  List<List<bool>> _v(){ final raw=(b['v'] as List?)??const[]; return raw.map((row)=> (row as List).map((v)=> v==true).toList()).cast<List<bool>>().toList(); }
  List<List<int?>> _owners(){ final raw=(b['owners'] as List?)??const[]; return raw.map((row)=> (row as List).map((v)=> v==null? null : (v as num).toInt()).toList()).cast<List<int?>>().toList(); }
  bool get _myTurn=> widget.session.isInProgress && widget.session.currentSeat==widget.mySeat;

  @override
  Widget build(BuildContext context){
    final size=_size; final h=_h(); final v=_v(); final owners=_owners(); final skin=BoardSkin.byId(_skin);
    final scores=((b['scores'] as List?)??const[]).whereType<num>().map((n)=>n.toInt()).toList();
    return Column(children:[
      TurnIndicator(text: widget.session.isInProgress ? (_myTurn ? 'Your turn — draw an edge' : 'Waiting for ${widget.session.seats[widget.session.currentSeat].displayName}…') : 'Game over', highlight: _myTurn, icon: Icons.grid_on_rounded),
      const SizedBox(height:6),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:8),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.10)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.11)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 22, offset: const Offset(0,10))]),
        child: Column(children:[
          Container(
            padding: const EdgeInsets.symmetric(horizontal:10, vertical:7),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.08))),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children:[
              for(var i=0;i<widget.session.seats.length;i++)
                Row(children:[
                  Container(width:10,height:10, decoration: BoxDecoration(color: _seatColors[i % _seatColors.length], shape: BoxShape.circle, boxShadow: widget.session.currentSeat==i ? [BoxShadow(color: _seatColors[i % _seatColors.length].withOpacity(0.6), blurRadius:8)] : null)),
                  const SizedBox(width:5),
                  Text('${widget.session.seats[i].displayName}: ${i<scores.length? scores[i]:0}', style: TextStyle(color: widget.session.currentSeat==i ? AppColors.textPrimary : AppColors.textSecondary, fontSize:12, fontWeight: widget.session.currentSeat==i ? FontWeight.w800 : FontWeight.w600)),
                ]),
            ]),
          ),
          const SizedBox(height:8),
          AspectRatio(aspectRatio:1, child: Container(
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), color: Color.lerp(skin.feltTop, Colors.white, 0.05), border: Border.all(color: Colors.white.withOpacity(0.08))),
            child: LayoutBuilder(builder: (context, c){
              final pad=16.0; final bw=c.maxWidth - pad*2; final bh=c.maxHeight - pad*2; final cellW=bw/size; final cellH=bh/size;
              return Stack(children:[
                // box fills
                for(var r=0;r<size;r++) for(var c2=0;c2<size;c2++)
                  if(owners.isNotEmpty && r<owners.length && c2<owners[r].length && owners[r][c2]!=null)
                    Positioned(
                      left: pad + c2*cellW + 2, top: pad + r*cellH + 2, width: cellW-4, height: cellH-4,
                      child: Container(decoration: BoxDecoration(color: _seatColors[owners[r][c2]! % _seatColors.length].withOpacity(0.30), borderRadius: BorderRadius.circular(8), border: Border.all(color: _seatColors[owners[r][c2]! % _seatColors.length].withOpacity(0.7))), child: Center(child: Text(_seatColors[owners[r][c2]! % _seatColors.length]==AppColors.softCyan ? '⬢' : '⬣', style: TextStyle(color: _seatColors[owners[r][c2]! % _seatColors.length], fontSize:18)))),
                    ),
                // horizontal edges
                for(var r=0;r<=size;r++) for(var col=0;col<size;col++)
                  Positioned(
                    left: pad + col*cellW + 8, top: pad + r*cellH - 5, width: cellW - 16, height: 10,
                    child: GestureDetector(
                      onTap: (){ if(!_myTurn) return; if(h.isNotEmpty && r<h.length && col<h[r].length && h[r][col]) return; GameFeedback.tap(); widget.onAction('draw', {'kind':'h','r':r,'c':col}); },
                      child: Container(
                        decoration: BoxDecoration(
                          color: (h.isNotEmpty && r<h.length && col<h[r].length && h[r][col]) ? _seatColors[widget.session.currentSeat % _seatColors.length].withOpacity(0.9) : Colors.white.withOpacity(0.10),
                          borderRadius: BorderRadius.circular(6),
                          boxShadow: (h.isNotEmpty && r<h.length && col<h[r].length && h[r][col]) ? [BoxShadow(color: _seatColors[widget.session.currentSeat % _seatColors.length].withOpacity(0.5), blurRadius:8)] : null,
                          border: Border.all(color: Colors.white.withOpacity(0.14)),
                        ),
                      ),
                    ),
                  ),
                // vertical edges
                for(var r=0;r<size;r++) for(var col=0;col<=size;col++)
                  Positioned(
                    left: pad + col*cellW -5, top: pad + r*cellH + 8, width: 10, height: cellH -16,
                    child: GestureDetector(
                      onTap: (){ if(!_myTurn) return; if(v.isNotEmpty && r<v.length && col<v[r].length && v[r][col]) return; GameFeedback.tap(); widget.onAction('draw', {'kind':'v','r':r,'c':col}); },
                      child: Container(
                        decoration: BoxDecoration(
                          color: (v.isNotEmpty && r<v.length && col<v[r].length && v[r][col]) ? _seatColors[widget.session.currentSeat % _seatColors.length].withOpacity(0.9) : Colors.white.withOpacity(0.10),
                          borderRadius: BorderRadius.circular(6),
                          boxShadow: (v.isNotEmpty && r<v.length && col<v[r].length && v[r][col]) ? [BoxShadow(color: _seatColors[widget.session.currentSeat % _seatColors.length].withOpacity(0.5), blurRadius:8)] : null,
                          border: Border.all(color: Colors.white.withOpacity(0.14)),
                        ),
                      ),
                    ),
                  ),
                // dots
                for(var r=0;r<=size;r++) for(var col=0;col<=size;col++)
                  Positioned(
                    left: pad + col*cellW -7, top: pad + r*cellH -7,
                    child: Container(width:14,height:14, decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, border: Border.all(color: const Color(0xFF0F172A), width:1.2), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius:4)])),
                  ),
              ]);
            }),
          )),
          const SizedBox(height:8),
          Text('Tap any faint edge to draw • Complete a box to claim it + extra turn • Shop → Neon Pen Set', style: TextStyle(color: AppColors.textMuted, fontSize:11), textAlign: TextAlign.center),
        ]),
      ),
    ]);
  }
}
