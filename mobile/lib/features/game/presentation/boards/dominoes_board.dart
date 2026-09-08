import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Dominoes — 3D tiles with ivory shine, pip inlays and a scrolling chain.
/// Supports 2–4 players; Skin selector tints the felt (Shop keeps skins).
class DominoesBoard extends StatefulWidget {
  const DominoesBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override
  State<DominoesBoard> createState() => _DominoesBoardState();
}

class _DominoesBoardState extends State<DominoesBoard> {
  String _skin = 'midnight';
  List<List<int>> get _chain {
    final d = widget.session.dominoBoard;
    return (d?.chain ?? const <Map<String,dynamic>>[]).map((link){ final raw=link['tile']; if(raw is List && raw.length==2) return [(raw[0] as num).toInt(), (raw[1] as num).toInt()]; return <int>[]; }).where((t)=>t.length==2).cast<List<int>>().toList();
  }
  List<List<int>> get _hand => widget.session.dominoBoard?.myHand ?? const <List<int>>[];
  int get _boneyard => widget.session.dominoBoard?.boneyard ?? 0;
  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  @override
  Widget build(BuildContext context) {
    final tiles = _chain;
    final skin = BoardSkin.byId(_skin);
    return Column(children: [
      TurnIndicator(text: widget.session.isInProgress ? (_myTurn ? 'Your turn — play or draw' : 'Waiting…') : 'Game over', highlight: _myTurn, icon: Icons.view_module_rounded),
      const SizedBox(height: 6),
      SizedBox(height: 26, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: BoardSkin.all.length, separatorBuilder: (_, __)=> const SizedBox(width: 6), itemBuilder: (_, i){ final s=BoardSkin.all[i]; final sel=s.id==_skin; return GestureDetector(onTap:(){ GameFeedback.tap(); setState(()=>_skin=s.id); }, child: Container(padding: const EdgeInsets.symmetric(horizontal: 10), decoration: BoxDecoration(color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke)), alignment: Alignment.center, child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)))); })),
      const SizedBox(height: 8),
      Container(
        padding: const EdgeInsets.fromLTRB(10,10,10,12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.10)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.42)!], begin: Alignment.topLeft, end: Alignment.bottomRight),
          border: Border.all(color: Colors.white.withOpacity(0.11)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 22, offset: const Offset(0, 10)), BoxShadow(color: skin.accent.withOpacity(0.16), blurRadius: 26)],
        ),
        child: Column(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.08))),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Row(children: [const Icon(Icons.inventory_2_rounded, size: 14, color: AppColors.textSecondary), const SizedBox(width: 6), Text('Boneyard $_boneyard', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w700)), const SizedBox(width: 10), Text('${widget.session.seats.length} players', style: const TextStyle(color: AppColors.textMuted, fontSize: 11))]),
              Row(children: [for (var i=0;i<widget.session.seats.length;i++) Container(margin: const EdgeInsets.only(left: 4), width: 22, height: 22, decoration: BoxDecoration(color: i==widget.session.currentSeat ? AppColors.electricPurple : AppColors.glassFill, shape: BoxShape.circle, border: Border.all(color: i==widget.session.currentSeat ? Colors.white : AppColors.glassStroke)), child: Center(child: Text('${(widget.session.dominoBoard?.opponentCounts != null && i < (widget.session.dominoBoard!.opponentCounts.length)) ? widget.session.dominoBoard!.opponentCounts[i] : "–"}', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800))))]),
            ]),
          ),
          const SizedBox(height: 10),
          Container(
            height: 108,
            decoration: BoxDecoration(color: Color.lerp(skin.feltTop, Colors.white, 0.03), borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.white.withOpacity(0.08))),
            child: tiles.isEmpty
                ? const Center(child: Text('The table is empty — lead a tile!', style: TextStyle(color: AppColors.textMuted)))
                : ListView.separated(
                    scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    itemCount: tiles.length, separatorBuilder: (_, __)=> const SizedBox(width: 8),
                    itemBuilder: (context, i)=> _DominoTile(a: tiles[i][0], b: tiles[i][1], horizontal: true, glow: i==tiles.length-1),
                  ),
          ),
        ]),
      ),
      const SizedBox(height: 10),
      if (widget.session.isInProgress)
        Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: _myTurn ? (){ GameFeedback.roll(); widget.onAction('draw', {}); } : null, icon: const Icon(Icons.download_rounded, size: 18), label: const Text('Draw'), style: OutlinedButton.styleFrom(foregroundColor: AppColors.softCyan, side: const BorderSide(color: AppColors.glassStroke), padding: const EdgeInsets.symmetric(vertical: 13), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))))),
          const SizedBox(width: 10),
          Expanded(child: OutlinedButton.icon(onPressed: _myTurn ? (){ GameFeedback.tap(); widget.onAction('pass', {}); } : null, icon: const Icon(Icons.skip_next_rounded, size: 18), label: const Text('Pass'), style: OutlinedButton.styleFrom(foregroundColor: AppColors.warning, side: const BorderSide(color: AppColors.glassStroke), padding: const EdgeInsets.symmetric(vertical: 13), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))))),
        ])),
      const SizedBox(height: 10),
      Align(alignment: Alignment.centerLeft, child: Padding(padding: const EdgeInsets.only(left: 4, bottom: 6), child: Text('Your hand — tap to play', style: TextStyle(color: _myTurn ? AppColors.softCyan : AppColors.textMuted, fontSize: 12, fontWeight: FontWeight.w700)))),
      SizedBox(
        height: 112,
        child: _hand.isEmpty ? const Center(child: Text('No tiles in hand.', style: TextStyle(color: AppColors.textMuted))) : ListView.separated(
          scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 4),
          itemCount: _hand.length, separatorBuilder: (_, __)=> const SizedBox(width: 8),
          itemBuilder: (context, i)=> GestureDetector(
            onTap: _myTurn ? (){ GameFeedback.move(); widget.onAction('play_tile', {'tile': _hand[i]}); } : null,
            child: Opacity(opacity: _myTurn ? 1 : 0.62, child: _DominoTile(a: _hand[i][0], b: _hand[i][1], horizontal: false, glow: _myTurn)),
          ),
        ),
      ),
    ]);
  }
}

class _DominoTile extends StatelessWidget {
  const _DominoTile({required this.a, required this.b, required this.horizontal, this.glow=false});
  final int a, b; final bool horizontal; final bool glow;
  @override
  Widget build(BuildContext context) {
    final w = horizontal ? 64.0 : 50.0; final h = horizontal ? 50.0 : 92.0;
    return Container(
      width: w, height: h,
      decoration: BoxDecoration(
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFFFEF7), Color(0xFFE8ECF5), Color(0xFFD6DCEB)]),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withOpacity(0.9), width: 1.1),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius: 8, offset: const Offset(0, 4)), if (glow) BoxShadow(color: AppColors.softCyan.withOpacity(0.45), blurRadius: 14)],
      ),
      child: horizontal
          ? Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [_Pips(value: a), Container(width: 1, height: 30, color: const Color(0xFF9AA7C7).withOpacity(0.5)), _Pips(value: b)])
          : Column(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [_Pips(value: a), Container(height: 1, width: 34, color: const Color(0xFF9AA7C7).withOpacity(0.5)), _Pips(value: b)]),
    );
  }
}

class _Pips extends StatelessWidget {
  const _Pips({required this.value});
  final int value;
  static const _layout = {0: <List<int>>[], 1: [[1,1]], 2: [[0,0],[2,2]], 3: [[0,0],[1,1],[2,2]], 4: [[0,0],[0,2],[2,0],[2,2]], 5: [[0,0],[0,2],[1,1],[2,0],[2,2]], 6: [[0,0],[0,2],[1,0],[1,2],[2,0],[2,2]]};
  @override
  Widget build(BuildContext context) {
    return SizedBox(width: 26, height: 26, child: Stack(children: [for (final p in _layout[value] ?? const <List<int>>[]) Positioned(left: p[1]*9.0+1, top: p[0]*9.0+1, child: Container(width: 6, height: 6, decoration: BoxDecoration(color: const Color(0xFF0F1832), shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.25), blurRadius: 2)])))]));
  }
}
