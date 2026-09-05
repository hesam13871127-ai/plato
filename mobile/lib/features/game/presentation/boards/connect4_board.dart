import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// 4 in a Row: a 6×7 vertical board. Tap a column to drop a disc. The board
/// rows are bottom→top on the server; we render with row 0 at the bottom.
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
    return raw
        .map((row) => (row as List).map((v) => (v as num?)?.toInt() ?? -1).toList())
        .toList();
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
    final cols = grid.isEmpty ? 7 : (grid.first.length);
    final myTurn = widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress ? (myTurn ? 'Your turn — tap a column' : 'Opponent is thinking…') : 'Game over',
          highlight: myTurn,
        ),
        const SizedBox(height: 10),
        TableSurface(
          child: Column(
            children: [
              // Drop hint row.
              Row(
                children: List.generate(cols, (c) {
                  final canDrop = myTurn && _columnHasSpace(grid, c, rows);
                  return Expanded(
                    child: GestureDetector(
                      onTap: () => _drop(c),
                      onTapDown: (_) => setState(() => _hoverCol = c),
                      child: Icon(
                        Icons.arrow_drop_down,
                        size: 30,
                        color: _hoverCol == c && canDrop
                            ? AppColors.softCyan
                            : canDrop
                                ? AppColors.electricPurple.withOpacity(0.7)
                                : Colors.transparent,
                      ),
                    ),
                  );
                }),
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
                      gradient: const LinearGradient(
                        colors: [AppColors.electricPurple, Color(0xFF5A40D6)],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(
                      children: List.generate(rows, (r) {
                        // server row 0 is the bottom → render top = rows-1-r
                        final boardRow = rows - 1 - r;
                        return Expanded(
                          child: Row(
                            children: List.generate(cols, (c) {
                              final owner = boardRow < grid.length && c < grid[boardRow].length
                                  ? grid[boardRow][c]
                                  : -1;
                              return Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.all(3),
                                  child: _Disc(owner: owner),
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

class _Disc extends StatelessWidget {
  const _Disc({required this.owner});
  final int owner; // -1 empty, 0 seat0, 1 seat1

  @override
  Widget build(BuildContext context) {
    final color = owner == 0
        ? AppColors.softCyan
        : owner == 1
            ? AppColors.danger
            : AppColors.deepNavy.withOpacity(0.55);
    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: owner == -1 ? AppColors.deepNavy.withOpacity(0.6) : color,
        boxShadow: owner == -1
            ? [const BoxShadow(color: Colors.black26, blurRadius: 2, offset: Offset(0, 2))]
            : [BoxShadow(color: color.withOpacity(0.5), blurRadius: 8)],
        border: Border.all(color: AppColors.glassStroke, width: 1),
      ),
    );
  }
}
