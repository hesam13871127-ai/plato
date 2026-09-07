import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// 4 in a Row: a 6×7 vertical board. Tap a column to drop a disc. The board
/// rows are bottom→top on the server; we render with row 0 at the bottom.
/// Discs use each seat's equipped piece set; the frame uses your playground.
class Connect4Board extends StatefulWidget {
  const Connect4Board({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<Connect4Board> createState() => _Connect4BoardState();
}

class _Connect4BoardState extends State<Connect4Board> {
  int? _hoverCol;

  List<List<int>> get _grid {
    final raw = (widget.session.board['grid'] as List?) ?? const [];
    return raw.map((row) => (row as List).map((v) => (v as num?)?.toInt() ?? -1).toList()).toList();
  }

  void _drop(int col) {
    if (!widget.session.isInProgress) return;
    if (widget.session.currentSeat != widget.mySeat) return;
    GameFeedback.move();
    widget.onAction('drop', {'col': col});
    setState(() => _hoverCol = null);
  }

  @override
  Widget build(BuildContext context) {
    final grid = _grid;
    final rows = grid.isEmpty ? 6 : grid.length;
    final cols = grid.isEmpty ? 7 : grid.first.length;
    final myTurn = widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final lastMove = widget.session.board['lastMove'] as Map?;
    final lastCol = (lastMove?['col'] as num?)?.toInt();
    final lastRow = (lastMove?['row'] as num?)?.toInt();

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress ? (myTurn ? 'Your turn — tap a column' : 'Opponent is thinking…') : 'Game over',
          highlight: myTurn,
        ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (var i = 0; i < 2 && i < widget.session.seats.length; i++)
                Row(
                  children: [
                    SkinnedPiece(skin: TableSkins.pieceSkin(widget.session.cosmeticsOf(i).piece), seat: i, size: 18),
                    const SizedBox(width: 6),
                    Text(
                      i == widget.mySeat ? 'You' : widget.session.seats[i].displayName,
                      style: TextStyle(
                        color: widget.session.currentSeat == i && widget.session.isInProgress ? playground.accent : AppColors.textPrimary,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(10),
          child: Column(
            children: [
              // Drop hint row: shows the disc that would fall.
              SizedBox(
                height: 34,
                child: Row(
                  children: List.generate(cols, (c) {
                    final canDrop = myTurn && _columnHasSpace(grid, c, rows);
                    return Expanded(
                      child: GestureDetector(
                        onTap: () => _drop(c),
                        onTapDown: (_) => setState(() => _hoverCol = c),
                        child: Center(
                          child: AnimatedOpacity(
                            duration: const Duration(milliseconds: 150),
                            opacity: canDrop ? (_hoverCol == c ? 1 : 0.35) : 0,
                            child: SkinnedPiece(
                              skin: TableSkins.pieceSkin(widget.session.cosmeticsOf(widget.mySeat).piece),
                              seat: widget.mySeat < 0 ? 0 : widget.mySeat,
                              size: 24,
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ),
              AspectRatio(
                aspectRatio: cols / rows,
                child: GestureDetector(
                  onTapUp: (details) {
                    final box = context.findRenderObject() as RenderBox?;
                    if (box == null) return;
                    final local = box.globalToLocal(details.globalPosition);
                    final col = (local.dx / box.size.width * cols).floor().clamp(0, cols - 1);
                    _drop(col);
                  },
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color.lerp(playground.rail, Colors.white, 0.18)!, playground.rail, Color.lerp(playground.rail, Colors.black, 0.35)!],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                      borderRadius: BorderRadius.circular(18),
                      boxShadow: [BoxShadow(color: playground.glow.withValues(alpha: 0.25), blurRadius: 24, spreadRadius: -4)],
                    ),
                    child: Column(
                      children: List.generate(rows, (r) {
                        final boardRow = rows - 1 - r;
                        return Expanded(
                          child: Row(
                            children: List.generate(cols, (c) {
                              final owner = boardRow < grid.length && c < grid[boardRow].length ? grid[boardRow][c] : -1;
                              final isLast = lastCol == c && lastRow == boardRow;
                              return Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.all(3),
                                  child: _Slot(owner: owner, session: widget.session, playground: playground, highlight: isLast),
                                ),
                              );
                            }),
                          ),
                        );
                      }),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  bool _columnHasSpace(List<List<int>> grid, int col, int rows) {
    for (var r = rows - 1; r >= 0; r--) {
      if (r < grid.length && col < grid[r].length && grid[r][col] == -1) return true;
    }
    return false;
  }
}

class _Slot extends StatelessWidget {
  const _Slot({required this.owner, required this.session, required this.playground, required this.highlight});
  final int owner; // -1 empty, 0 seat0, 1 seat1
  final GameSessionView session;
  final PlaygroundSkin playground;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final s = constraints.maxWidth;
        return Stack(
          alignment: Alignment.center,
          children: [
            // Recessed hole.
            Container(
              width: s,
              height: s,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [playground.feltBottom, Color.lerp(playground.feltBottom, Colors.black, 0.5)!],
                ),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 4, offset: Offset(0, 2))],
              ),
            ),
            if (owner >= 0)
              TweenAnimationBuilder<double>(
                key: ValueKey('drop-$owner'),
                tween: Tween(begin: -1.0, end: 0.0),
                duration: const Duration(milliseconds: 380),
                curve: Curves.bounceOut,
                builder: (context, t, child) => Transform.translate(offset: Offset(0, t * s * 2), child: child),
                child: SkinnedPiece(
                  skin: TableSkins.pieceSkin(session.cosmeticsOf(owner).piece),
                  seat: owner,
                  size: s * 0.94,
                  highlight: highlight,
                ),
              ),
          ],
        );
      },
    );
  }
}
