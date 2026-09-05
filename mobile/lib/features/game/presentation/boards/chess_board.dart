import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Chess: an 8×8 board. Rank 0 (server) is Black's back rank, rendered at the
/// top; White (seat 0) sits at the bottom. Tap a piece, then a legal target.
/// Only the active player's pieces are selectable; the server validates every
/// move (check/checkmate/stalemate).
class ChessBoard extends StatefulWidget {
  const ChessBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<ChessBoard> createState() => _ChessBoardState();
}

class _ChessBoardState extends State<ChessBoard> {
  List<int>? _selected; // [rank, file]

  Map<String, dynamic> get b => widget.session.board;
  List<List<String>> get _grid {
    final raw = (b['board'] as List?) ?? const [];
    return raw
        .map((row) => (row as List).map((c) => (c as String?) ?? '').toList())
        .toList();
  }

  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;
  bool _isWhite(String p) => p.isNotEmpty && p == p.toUpperCase();

  void _tap(int r, int f) {
    if (!_myTurn) return;
    final grid = _grid;
    if (grid.isEmpty) return;
    final piece = grid[r][f];
    final myColorIsWhite = widget.mySeat == 0;

    if (_selected != null) {
      final [sr, sf] = _selected!;
      if (sr == r && sf == f) {
        setState(() => _selected = null);
        return;
      }
      // Attempt move.
      GameFeedback.move();
      widget.onAction('move', {
        'from': [sr, sf],
        'to': [r, f],
      });
      setState(() => _selected = null);
      return;
    }
    if (piece.isNotEmpty && _isWhite(piece) == myColorIsWhite) {
      GameFeedback.tap();
      setState(() => _selected = [r, f]);
    }
  }

  @override
  Widget build(BuildContext context) {
    final grid = _grid;
    final turnColor = (b['turnColor'] as String?) ?? 'w';
    final captured = b['captured'] as Map?;

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress
              ? (_myTurn ? 'Your move (${turnColor == 'w' ? 'White' : 'Black'})' : 'Opponent thinking…')
              : 'Game over',
          highlight: _myTurn,
          icon: Icons.shield_outlined,
        ),
        const SizedBox(height: 8),
        TableSurface(
          child: grid.isEmpty
              ? const SizedBox(height: 300, child: Center(child: Text('No board.', style: TextStyle(color: AppColors.textMuted))))
              : AspectRatio(
                  aspectRatio: 1,
                  // Render with rank 7 (White back rank) at bottom for white;
                  // server rank 0 is Black's back rank → top.
                  child: Column(
                    children: List.generate(8, (displayRow) {
                      // Server rank 0 = Black's back rank, rendered at the top;
                      // rank 7 = White's back rank, at the bottom.
                      final serverRank = displayRow;
                      return Expanded(
                        child: Row(
                          children: List.generate(8, (f) {
                            final piece = grid[serverRank][f];
                            final dark = (serverRank + f) % 2 == 1;
                            final selected = _selected != null && _selected![0] == serverRank && _selected![1] == f;
                            void callTap() => _tap(serverRank, f);
                            return Expanded(
                              child: GestureDetector(
                                onTap: callTap,
                                child: Container(
                                  decoration: BoxDecoration(
                                    color: selected
                                        ? AppColors.softCyan.withOpacity(0.6)
                                        : dark
                                            ? const Color(0xFF26345C)
                                            : const Color(0xFF3A4A78),
                                    border: Border.all(
                                        color: selected ? AppColors.softCyan : Colors.transparent,
                                        width: selected ? 2 : 0),
                                  ),
                                  child: Center(
                                    child: piece.isEmpty
                                        ? null
                                        : Text(
                                            _glyph(piece),
                                            style: TextStyle(
                                              fontSize: 30,
                                              color: _isWhite(piece) ? Colors.white : const Color(0xFF141B2E),
                                              fontWeight: FontWeight.bold,
                                              shadows: _isWhite(piece)
                                                  ? [const Shadow(color: Colors.black54, blurRadius: 2)]
                                                  : null,
                                            ),
                                          ),
                                  ),
                                ),
                              ),
                            );
                          }),
                        ),
                      );
                    }),
                  ),
                ),
        ),
        if (captured != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _CapturedRow(pieces: (captured['w'] as List?)?.cast<String>() ?? const [], label: 'You', byWhite: true),
                _CapturedRow(pieces: (captured['b'] as List?)?.cast<String>() ?? const [], label: 'Foe', byWhite: false),
              ],
            ),
          ),
      ],
    );
  }

  String _glyph(String p) {
    const map = {
      'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
      'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
    };
    return map[p] ?? '';
  }
}

class _CapturedRow extends StatelessWidget {
  const _CapturedRow({required this.pieces, required this.label, required this.byWhite});
  final List<String> pieces;
  final String label;
  final bool byWhite;

  @override
  Widget build(BuildContext context) {
    const glyphs = {
      'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
      'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
    };
    return Row(
      children: [
        Text('$label: ', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
        for (final p in pieces)
          Text(glyphs[p] ?? '',
              style: TextStyle(fontSize: 16, color: byWhite ? Colors.white : AppColors.textMuted)),
      ],
    );
  }
}
