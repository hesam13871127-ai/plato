import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Snakes & Ladders — 3D 10×10 board with stone-tiled path, rope ladders and
/// coiling snake trails. 2–4 tokens race to 100; die has real 3D faces.
class SnakesLaddersBoard extends StatefulWidget {
  const SnakesLaddersBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session; final int mySeat; final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override State<SnakesLaddersBoard> createState()=> _SnakesLaddersBoardState();
}

class _SnakesLaddersBoardState extends State<SnakesLaddersBoard> with SingleTickerProviderStateMixin {
  String _skin='emerald';
  late final AnimationController _diceCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
  static const _palettes=[PiecePalette.cyan, PiecePalette.red, PiecePalette.green, PiecePalette.yellow];
  static const _seatColors=[AppColors.softCyan, AppColors.danger, AppColors.success, AppColors.warning];

  Map<String,dynamic> get b=> widget.session.board;
  List<int> get _positions => ((b['positions'] as List?)??const[]).whereType<num>().map((n)=>n.toInt()).toList();
  int? get _die => (b['die'] as num?)?.toInt();
  bool get _myTurn=> widget.session.isInProgress && widget.session.currentSeat==widget.mySeat;

  @override void dispose(){ _diceCtrl.dispose(); super.dispose();}

  @override
  Widget build(BuildContext context){
    final skin=BoardSkin.byId(_skin);
    final positions=_positions;
    final die=_die;
    final snakes=(b['snakes'] as Map?)?.map((k,v)=> MapEntry(int.tryParse('$k')??0, (v as num).toInt())) ?? const {};
    final ladders=(b['ladders'] as Map?)?.map((k,v)=> MapEntry(int.tryParse('$k')??0, (v as num).toInt())) ?? const {};
    return Column(children:[
      TurnIndicator(text: widget.session.isInProgress ? (_myTurn ? 'Your roll — tap Roll!' : 'Waiting for ${widget.session.seats[widget.session.currentSeat].displayName}…') : 'Game over', highlight: _myTurn, icon: Icons.casino_rounded),
      const SizedBox(height:6),
      SizedBox(height:26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width:6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal:10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height:8),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.10)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: Colors.white.withOpacity(0.11)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 22, offset: const Offset(0,10))]),
        child: Column(children:[
          // board grid 10x10
          AspectRatio(aspectRatio:1, child: Container(
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), color: Color.lerp(skin.feltTop, Colors.white, 0.06), border: Border.all(color: Colors.white.withOpacity(0.08)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.25), blurRadius: 12)]),
            child: Stack(children:[
              // cells
              Column(children: List.generate(10, (row){
                final boardRow = 9 - row; // top row is 91-100
                return Expanded(child: Row(children: List.generate(10, (col){
                  // snake & ladder classic boustrophedon numbering
                  final idxInRow = boardRow % 2 == 0 ? col : 9 - col;
                  final num = boardRow*10 + idxInRow + 1;
                  final isSnakeHead = snakes.containsKey(num);
                  final isLadderBottom = ladders.containsKey(num);
                  final isSnakeTail = snakes.containsValue(num);
                  final isLadderTop = ladders.containsValue(num);
                  return Expanded(child: Container(
                    margin: const EdgeInsets.all(1.2),
                    decoration: BoxDecoration(
                      color: isSnakeHead ? const Color(0xFFEF4444).withOpacity(0.28) : isLadderBottom ? const Color(0xFF22C55E).withOpacity(0.28) : (boardRow + col) %2==0 ? Colors.white.withOpacity(0.08) : Colors.white.withOpacity(0.03),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: isSnakeHead || isLadderBottom ? Colors.white.withOpacity(0.35) : Colors.white.withOpacity(0.06)),
                    ),
                    child: Stack(children:[
                      Positioned(left:3, top:2, child: Text('$num', style: TextStyle(color: isSnakeHead ? const Color(0xFFFF8A8A) : isLadderBottom ? const Color(0xFF86EFAC) : Colors.white.withOpacity(0.55), fontSize: 7, fontWeight: FontWeight.w800))),
                      if(isSnakeHead) const Positioned(right:3, bottom:2, child: Text('🐍', style: TextStyle(fontSize:9))),
                      if(isLadderBottom) const Positioned(right:3, bottom:2, child: Text('🪜', style: TextStyle(fontSize:9))),
                      if(isSnakeTail) Positioned.fill(child: Container(decoration: BoxDecoration(color: const Color(0xFFEF4444).withOpacity(0.10), borderRadius: BorderRadius.circular(6)))),
                      if(isLadderTop) Positioned.fill(child: Container(decoration: BoxDecoration(color: const Color(0xFF22C55E).withOpacity(0.10), borderRadius: BorderRadius.circular(6)))),
                      // token occupancy indicator (small dot if occupied)
                    ]),
                  ));
                })));
              })),
              // snake & ladder lines (custom paint)
              Positioned.fill(child: CustomPaint(painter: _SnakesLaddersPainter(snakes: snakes, ladders: ladders))),
              // tokens
              for(var seat=0; seat<positions.length; seat++)
                _TokenOnBoard(pos: positions[seat], seat: seat, total: positions.length),
            ]),
          )),
          const SizedBox(height:10),
          Row(mainAxisAlignment: MainAxisAlignment.center, children:[
            if(die!=null) Dice3D(size:56, value: die, rolling: false) else Container(width:56,height:56, decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.glassStroke)), child: const Center(child: Text('🎲', style: TextStyle(fontSize:22)))),
            const SizedBox(width:12),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children:[
              Text(die!=null ? 'Rolled $die' : 'Tap Roll to start', style: TextStyle(color: die!=null ? AppColors.cosmicGold : AppColors.textSecondary, fontWeight: FontWeight.w800, fontSize:14)),
              const SizedBox(height:2),
              Text('${widget.session.seats.length} players • first to 100 wins', style: const TextStyle(color: AppColors.textMuted, fontSize:11)),
            ]),
          ]),
          const SizedBox(height:10),
          SizedBox(width: double.infinity, child: ActionButton(label: 'Roll', icon: Icons.casino_rounded, color: AppColors.electricPurple, onPressed: _myTurn ? (){ _diceCtrl.forward(from:0); GameFeedback.roll(); widget.onAction('roll', {}); } : null)),
          const SizedBox(height:6),
          Wrap(spacing:6, children:[ for(var i=0;i<positions.length;i++) Container(padding: const EdgeInsets.symmetric(horizontal:8, vertical:4), decoration: BoxDecoration(color: i==_myTurn.hashCode ? Colors.transparent : AppColors.glassFill, borderRadius: BorderRadius.circular(10), border: Border.all(color: i==widget.session.currentSeat ? _seatColors[i].withOpacity(0.7) : AppColors.glassStroke)), child: Row(mainAxisSize: MainAxisSize.min, children:[ Container(width:8,height:8, decoration: BoxDecoration(color: _seatColors[i], shape: BoxShape.circle)), const SizedBox(width:6), Text('${widget.session.seats[i].displayName}: ${positions[i]}', style: const TextStyle(color: AppColors.textSecondary, fontSize:11, fontWeight: FontWeight.w700))]))]),
        ]),
      ),
    ]);
  }
}

class _TokenOnBoard extends StatelessWidget {
  const _TokenOnBoard({required this.pos, required this.seat, required this.total});
  final int pos; final int seat; final int total;
  @override Widget build(BuildContext context){
    if(pos<=0) return const SizedBox.shrink();
    // map 1..100 to board coordinates (boustrophedon)
    final n = pos -1;
    final row = n ~/10; // 0 = bottom row (1-10)
    final colInRow = n %10;
    final boardRow = row; // 0 bottom
    final col = boardRow %2==0 ? colInRow : 9 - colInRow;
    final displayRow = 9 - boardRow; // 0 top
    return LayoutBuilder(builder: (context, c){
      final w=c.maxWidth; final h=c.maxHeight; final cellW=w/10; final cellH=h/10;
      final cx = col*cellW + cellW/2 + (seat %2==0 ? -6 : 6) + (seat>=2 ? (seat==2 ? -10 : 10) : 0);
      final cy = displayRow*cellH + cellH/2 + (seat<2 ? 6 : -6);
      const pals=[PiecePalette.cyan, PiecePalette.red, PiecePalette.green, PiecePalette.yellow];
      return Positioned(left: cx-13, top: cy-13, child: Piece3D(palette: pals[seat % pals.length], size: 22));
    });
  }
}

class _SnakesLaddersPainter extends CustomPainter {
  _SnakesLaddersPainter({required this.snakes, required this.ladders});
  final Map<int,int> snakes; final Map<int,int> ladders;
  Offset _cellCenter(int n, Size s){
    final row = (n-1) ~/10; final colInRow=(n-1)%10; final boardRow=row; final col= boardRow %2==0 ? colInRow : 9 - colInRow; final displayRow=9-boardRow; final cellW=s.width/10; final cellH=s.height/10; return Offset(col*cellW+cellW/2, displayRow*cellH+cellH/2);
  }
  @override void paint(Canvas canvas, Size s){
    final snakePaint = Paint()..color= const Color(0xFFEF4444).withOpacity(0.95)..strokeWidth=3.5..style=PaintingStyle.stroke..strokeCap=StrokeCap.round;
    final ladderPaint = Paint()..color= const Color(0xFF22C55E).withOpacity(0.95)..strokeWidth=3..style=PaintingStyle.stroke..strokeCap=StrokeCap.round;
    snakes.forEach((head,tail){ final a=_cellCenter(head,s); final b=_cellCenter(tail,s); final mid= Offset((a.dx+b.dx)/2 + 14* math.sin((head+tail)*0.3), (a.dy+b.dy)/2); final path=Path()..moveTo(a.dx,a.dy)..quadraticBezierTo(mid.dx, mid.dy, b.dx,b.dy); canvas.drawPath(path, snakePaint); canvas.drawCircle(a, 5, Paint()..color= const Color(0xFFEF4444)); canvas.drawCircle(b, 3, Paint()..color= const Color(0xFFEF4444).withOpacity(0.5)); });
    ladders.forEach((bottom, top){ final a=_cellCenter(bottom,s); final b=_cellCenter(top,s); canvas.drawLine(a,b, ladderPaint); // rungs
      for(var t=0.2; t<0.9; t+=0.22){ final p= Offset(a.dx + (b.dx-a.dx)*t, a.dy + (b.dy-a.dy)*t); final perp= Offset(-(b.dy-a.dy), b.dx-a.dx); final len= perp.distance; if(len==0) continue; final n= perp/len * 7; canvas.drawLine(p - n, p + n, Paint()..color= const Color(0xFF15803D).withOpacity(0.9)..strokeWidth=2); }
      canvas.drawCircle(a, 5, Paint()..color= const Color(0xFF22C55E)); canvas.drawCircle(b, 5, Paint()..color= const Color(0xFF22C55E).withOpacity(0.7));
    });
  }
  @override bool shouldRepaint(covariant CustomPainter old)=> true;
}
